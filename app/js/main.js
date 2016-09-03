var Color = function (r, g, b) {
  this.r = r;
  this.g = g;
  this.b = b;
};

Color.prototype.toRGBString = function () {
    return 'rgb('+this.r+','+this.g+','+this.b+')';
};

Color.prototype.toRGBAString = function (a) {
    return 'rgba('+this.r+','+this.g+','+this.b+','+a+')';
};

// Color is immutable
Object.freeze(Color);

var debug = false;

var inTempSensorId = "0000068a3594"; // Tub water temp
var outTempSensorId = "0000066eff45"; // Heated water temp

//var inTempSensorId = "0000067745db"; // Test values
//var outTempSensorId = "0000067769ea"; // Test values

var timeWindowParam = 'now -2 hour';
var endpoint = 'https://data.sparkfun.com/output/';
var publicKey = 'OG62ZDJ65VC3x9jmWbK0';

var defaultColor = new Color(27, 166, 190);

var spectrum = [
  {offset: 0, color: new Color(53, 203, 229)}, // #35cbe5 30 °C
  {offset: 0.5, color: new Color(64, 203, 156)}, // #40cb9c 35 °C
  {offset: 0.7, color: new Color(124, 202, 87)}, // #7cca57 36 °C
  {offset: 0.8, color: new Color(212, 243, 85)}, // #d4f355 37 °C
  {offset: 0.9, color: new Color(254, 152, 4)}, // #fe9804 38 °C
  {offset: 1, color: new Color(223, 51, 65)} // #df3341 39 °C
];

var minColorTemp = 30; // °C
var maxColorTemp = 39; // °C
var optimalTemp = 36.5; // °C

var currentTemp;
var currentEstimate;
var currentInSlope = 0;
var currentOutSlope = 0;

var maxEstimate = 7 * 60; // min
var sampleCountForAvg = 1;
var minSampleCountForEstimates = 3;
var timeWindowForInEstimates = 30 * 60 * 1000; // ms
var timeWindowForOutEstimates = 10 * 60 * 1000; // ms

// Update display values
var displayUpdateInterval = 4000; // ms
var displayAlertInterval = 2000; // ms

var chartAnimate = true; // For one time animations

// Chart vars
var seq = 0;
var delays = 80;
var durations = 500;

$(function() {
  debug = getUrlParameter('debug') ? true : false;
  
  // Start updates
  startDisplayUpdates();
  
  setInterval(function () {
    chartAnimate = false;
    fetchData();
  }, 30000);

  hideWarning(false);
  fetchData();
});

var initChart = function() {
  chart = new Chartist.Line('.ct-chart', data, options);

  // Once the chart is fully created we reset the sequence
  chart.on('created', function() {
    seq = 0;
  });

  // On each drawn element by Chartist we use the Chartist.Svg API to trigger SMIL animations
  chart.on('draw', function(data) {

    if (data.type === 'line') {
      data.element.animate({
        opacity: {
          begin: seq * delays + 1000,
          dur: durations,
          from: 0,
          to: 1
        }
      });

      seq++;
    } else if (data.type === 'label' && data.axis === 'x') {
      data.element.animate({
        y: {
          begin: seq * delays,
          dur: durations,
          from: data.y + 100,
          to: data.y,
          // We can specify an easing function from Chartist.Svg.Easing
          easing: 'easeOutQuart'
        }
      });

      seq++;
    } else if (data.type === 'label' && data.axis === 'y') {
      data.element.animate({
        x: {
          begin: seq * delays,
          dur: durations,
          from: data.x - 100,
          to: data.x,
          easing: 'easeOutQuart'
        }
      });

      seq++;
    } else if (chartAnimate && data.type === 'grid') {
      // Using data.axis we get x or y which we can use to construct our animation definition objects
      var pos1Animation = {
        begin: seq * delays,
        dur: durations,
        from: data[data.axis.units.pos + '1'] - 30,
        to: data[data.axis.units.pos + '1'],
        easing: 'easeOutQuart'
      };

      var pos2Animation = {
        begin: seq * delays,
        dur: durations,
        from: data[data.axis.units.pos + '2'] - 100,
        to: data[data.axis.units.pos + '2'],
        easing: 'easeOutQuart'
      };

      var animations = {};
      animations[data.axis.units.pos + '1'] = pos1Animation;
      animations[data.axis.units.pos + '2'] = pos2Animation;
      animations['opacity'] = {
        begin: seq * delays,
        dur: durations,
        from: 0,
        to: 1,
        easing: 'easeOutQuart'
      };

      data.element.animate(animations);

      seq++;
    }
  });
};

var lerp = function(a, b, u) {
    return (1-u) * a + u * b;
};

var interpolateColor = function(color1, color2, value) {
  var r = parseInt(lerp(color1.r, color2.r, value));
  var g = parseInt(lerp(color1.g, color2.g, value));
  var b = parseInt(lerp(color1.b, color2.b, value));

  return new Color(r, g, b);
};

var animateStyleProperty = function(element, property, from, to, duration, callback) {
  var start = null;
  var previousUpdate = null;
  var progress = 0.0;

  var animationUpdate = function(timestamp) {
    if (!start) start = timestamp;
    if (!previousUpdate) previousUpdate = timestamp;

    var delta = timestamp - previousUpdate;
    var elapsed = timestamp - start;
    var progress = Math.min(elapsed / duration, 1.0);

    if (progress < 1.0) window.requestAnimationFrame(animationUpdate);

    if (delta < 40) {
      return;
    }

    previousUpdate = timestamp;
    element.style.setProperty(property, callback(from, to, progress));
  };

  window.requestAnimationFrame(animationUpdate);
};

var showAlertOverlay = false;

var startAlertToggling = function() {
  if(showAlertOverlay) {
    return;
  }
  showAlertOverlay = true;

  var estimateDisplay = document.getElementById('estimate-display');
  var estimateAlert = estimateDisplay.children[0];

  var toAlpha = 0;

  var pulsateAlertOverlay = setInterval(function() {
    toAlpha = 1 - toAlpha; // Switch between 0 and 1

    if (!showAlertOverlay) {
      clearInterval(pulsateAlertOverlay);
    }

    animateStyleProperty(estimateAlert, 'background-color', 1 - toAlpha, toAlpha, displayAlertInterval, function(from, to, progress) {
      return pickSpectrumHue(1).toRGBAString(Math.abs(progress - from));
    });

  }, displayAlertInterval);
};

var stopAlertToggling = function() {
  showAlertOverlay = false;
};

var startDisplayUpdates = function() {
  var tempElement = document.getElementById('temperature-value');
  var timeElement = document.getElementById('estimate-value');
  var timeLabel = document.getElementById('estimate-label');

  var showClock = false;
  var showMessage = false;

  var updateDisplays = setInterval(function() {
    var estimateHtml = '--';
    var showLabel = false;

    var hotEnough = currentTemp && currentTemp >= 36;
    var tooHot = currentTemp && currentTemp >= 38;
    var coolingDown = currentOutSlope && currentOutSlope <= 0;

    if (tooHot) {
      estimateHtml = '<span>Poppaa!<span>';
    } else if (hotEnough) {
      estimateHtml = '<span>Paljuun!<span>';
    } else {
      // Toggle between message and time estimates
      if (coolingDown && showMessage) {
        estimateHtml = '<span>P&ouml;kky&auml;!<span>'
      } else {
        if (currentEstimate) {
          var minutes = (currentEstimate - Date.now()) / 1000 / 60;

          if (showClock && minutes > 0 && minutes < maxEstimate) {
            estimateHtml = formatClockEstimateHtml(currentEstimate);
          } else {
            estimateHtml = formatTimeEstimateHtml(minutes); 
          }
        }
        showLabel = true;
        showClock = !showClock;
      } 
    }

    if (tooHot || !hotEnough && coolingDown) {
      startAlertToggling();
    } else {
      stopAlertToggling();
    }

    showMessage = !showMessage
    tempElement.innerHTML = formatTemperatureHtml(currentTemp);
    timeElement.innerHTML = estimateHtml;
    timeLabel.style.opacity = showLabel ? 1 : 0;
  }, displayUpdateInterval);
}

var getStopColor = function(temp, stopIndex) {
  var tempPosition = (temp - minColorTemp) / (maxColorTemp - minColorTemp) - (stopIndex * 0.2);
  return pickSpectrumHue(tempPosition);
};

var pickSpectrumHue = function(value) {
  // Ensure range from 0 to 1
  value = Math.max(Math.min(value, 1), 0);

  var prevStop = spectrum.findLastOrDefault(function(obj) {
    return obj.offset <= value;
  }, spectrum[0]);

  var nextStop = spectrum.findFirstOrDefault(function(obj) {
    return obj.offset >= value;
  }, spectrum[spectrum.length - 1]);

  if (nextStop.offset === prevStop.offset) {
    return prevStop.color;
  } else {
    var colorOffset = (value - prevStop.offset) / (nextStop.offset - prevStop.offset);
    return interpolateColor(prevStop.color, nextStop.color, colorOffset);
  }
};

var updateCurrentTemp = function(samples) {
  var avgTemp;

  if (samples.length >= sampleCountForAvg) {
    var samplesForAvg = samples.slice(-sampleCountForAvg);
    avgTemp = samplesForAvg.reduce(function(sum, sample) { return sum + sample.temp; }, 0) / sampleCountForAvg;

    if (avgTemp) {
      updateTemperatureDisplayGradient(currentTemp, avgTemp);
      updateEstimateDisplayGradient(currentTemp, avgTemp);
      updateChartLineGradient(samples);
      currentTemp = avgTemp;
    }
  }
}

var updateCurrentEstimate = function(inSamples, outSamples) {
  if (inSamples.length >= minSampleCountForEstimates) {
    var lineResult = linearRegressionForSamples(inSamples, timeWindowForInEstimates);

    currentEstimate = parseInt(lineResult.fn(optimalTemp));
    currentInSlope = lineResult['slope'];

    if (debug) {
      console.log('estimate', currentEstimate);
      console.log('in slope', currentInSlope);
      //console.log('in intercept', lineResult['intercept']);
      //console.log('in r2', lineResult['r2']);
    }
  }

  if (outSamples.length >= minSampleCountForEstimates) {
    var lineResult = linearRegressionForSamples(outSamples, timeWindowForOutEstimates);
    currentOutSlope = lineResult['slope'];

    if (debug) {
      console.log('out slope', currentOutSlope);
      //console.log('out intercept', lineResult['intercept']);
      //console.log('out r2', lineResult['r2']);
    }
  }
}

var linearRegressionForSamples = function(samples, timeWindow) {
  // Filter out samples, which are older than timeWindowForEstimate
  var minTime = samples[samples.length - 1].time - timeWindow;
  var estimateSamples = samples.filter(function(sample) {return sample.time >= minTime});

  // Prepare samples for linear regression. Note, that we flip the x-axis and y-axis.
  var xSamples = samples.map(function(sample) { return sample.temp;});
  var ySamples = samples.map(function(sample) { return sample.time;});

  return linearRegression(xSamples, ySamples);
}

// http://trentrichardson.com/2010/04/06/compute-linear-regressions-in-javascript/
function linearRegression(x, y) {
  var lr = {};
  var n = y.length;
  var sum_x = 0;
  var sum_y = 0;
  var sum_xy = 0;
  var sum_xx = 0;
  var sum_yy = 0;

  for (var i = 0; i < y.length; i++) {
      sum_x += x[i];
      sum_y += y[i];
      sum_xy += (x[i] * y[i]);
      sum_xx += (x[i] * x[i]);
      sum_yy += (y[i] * y[i]);
  }

  lr['slope'] = (n * sum_xy - sum_x * sum_y) / (n * sum_xx - sum_x * sum_x);
  lr['intercept'] = (sum_y - lr.slope * sum_x)/n;
  lr['r2'] = Math.pow((n * sum_xy - sum_x * sum_y) /
            Math.sqrt((n * sum_xx - sum_x * sum_x) *
                      (n * sum_yy - sum_y * sum_y)),2);
  lr['fn'] = function (x) { return this.slope * x + this.intercept; };

  return lr;
}

var formatTemperatureHtml = function(temp) {
  if (temp) {
    var rounded = Math.round(temp * 10) / 10;
    var integer = parseInt(rounded); // Get integer part
    var decimal = parseInt(rounded % 1 * 10); // Get decimal part

    return integer+'<span>.'+decimal+'</span><strong>&deg;</strong>';
  } else {
    return '--';
  }
}

var formatTimeEstimateHtml = function(minutes) {
  if (minutes > 60) {
    var hours = Math.round(Math.min(minutes, maxEstimate) / 60 * 10) / 10;
    var integer = parseInt(hours); // Get integer part
    var decimal = parseInt(hours % 1 * 10); // Get decimal part

    if (minutes > maxEstimate) {
      return  '>' + integer + '<span>h</span>'
    }
    return integer + '.' + decimal + '<span>h</span>'
  } else if (minutes > 0) {
    return parseInt(minutes) + '<span>min</span>'
  }
  return '--';
}

var formatClockEstimateHtml = function(estimateMs) {
  if (estimateMs) {
    return '<span style="font-size: 80%">' + moment(estimateMs).format('HH:mm') + '</span>';
  }
  return '--';
}

var updateTemperatureDisplayGradient = function(fromTemp, toTemp) {
  var display = document.getElementById('temperature-display');
  updateDisplayGradient(display, fromTemp, toTemp, function(from, to, progress) {
    var colors = []
    for (var i = 0; i < 3; i++) {
      var color = interpolateColor(from[i], to[i], progress);
      colors.push(color.toRGBString());
    }
    return 'linear-gradient(to left, ' + colors[0] + ' 0%, ' + colors[1] + ' 50%, ' + colors[2] + ' 100%)';
  });
}

var updateEstimateDisplayGradient = function(fromTemp, toTemp) {
  var display = document.getElementById('estimate-display');
  updateDisplayGradient(display, fromTemp, toTemp, function(from, to, progress) {
    var colors = []
    for (var i = 0; i < 3; i++) {
      var color = interpolateColor(from[i], to[i], progress);
      colors.push(color.toRGBString());
    }
    return 'linear-gradient(to left, ' + colors[0] + ' 0%, ' + colors[1] + ' 50%, ' + colors[2] + ' 100%)';
  });
}

var updateDisplayGradient = function(display, fromTemp, toTemp, callback) {
  var fromColors = [];
  var toColors = [];

  for (var i = 0; i < 3; i++) {
    fromColors.push(!fromTemp ? defaultColor : getStopColor(fromTemp, i));
    toColors.push(!toTemp ? defaultColor : getStopColor(toTemp, i));
  }

  animateStyleProperty(display, 'background', fromColors, toColors, 2000, callback);
};

var updateChartLineGradient = function(samples) {
  var gradientElement = document.getElementById('line-gradient');

  var temps = samples.map(function(sample) {return sample.temp});
  var lowestTemp = temps.min();
  var highestTemp = temps.max();

  var stops = gradientElement.getElementsByTagName('stop');
  var tempStep = (highestTemp - lowestTemp) / stops.length;

  for (var i = 0; i < stops.length; i++) {
    var temp = highestTemp - i * tempStep;
    stops[i].style.setProperty('stop-color', getStopColor(temp, 0).toRGBString());
  }
};

var showWarning = function(message, animated) {
  $('#warning').slideDown(animated ? 400 : 0);
  $('#warning > span').text(message);
}

var hideWarning = function(animated) {
  $('#warning').slideUp(animated ? 400 : 0);
}

var options = {
  showLine: true,
  axisX: {
    offset: 30,
    labelInterpolationFnc: function(value, index, labels) {
      return formatTimeLabel(value, index, labels);
    }
  },
  axisY: {
    offset: 60,
    labelInterpolationFnc: function(value, index, labels) {
      return formatTempLabel(value, index, labels);
    }
  }
};

var formatTimeLabel = function(value, index, labels) {
  var current = moment(value);
  var label = null;

  if (index > 0) {
    var previous = moment(labels[index - 1]);
    var first = moment(labels[0]);
    var last = moment(labels[labels.length - 1]);

    if (last.diff(first, 'minutes') < 50) {
      // Short time window. Show label for second value and median
      var medianIndex = parseInt(labels.length / 2);
      return index === 1 || index === medianIndex ? current.format('HH:mm') : null;
    } else if (previous.hours() < current.hours()) {
      // Hour passed
      label = moment(current.hours() + '00', "hmm").format("HH:mm");
    } else if (previous.minutes() < 30 && current.minutes() >= 30) {
      // Half an hour passed
      label = moment(current.hours() + '30', "hmm").format("HH:mm");
    } else if (previous.date() != current.date()) {
      // Full day passed
      label = current.format('ddd');
    }

    if (last.diff(current, 'minutes') < 20) {
      // Do not show label for last less than 30 minutes
      return null;
    }
  }

  return label;
}

function formatTempLabel(value) {
  return value.toFixed(1) + '&nbsp;&deg;C';
}

var data = {};
var chart = null;

var fetchData = function() {
  $.ajax({
    url: 'http://data.sparkfun.com/output/' + publicKey + '.json',
    jsonp: 'callback',
    cache: true,
    dataType: 'jsonp',
    data: { 'gte[timestamp]': timeWindowParam },
    success: function(response) {
      handleResponse(response);
    },
    error: function(jqXHR, textStatus, errorThrown) {
      if (debug) {
        console.error("Referesh failed: " + textStatus);
      }
      
      if (XMLHttpRequest.readyState == 0) {
        showWarning('Yhteysongelma!', true);
      }
    }
  });
}

var handleResponse = function(samples) {
  if (samples instanceof Array && samples.length >= 4) {
    refreshValues(samples);
  } else {
    if (debug) {
      console.log('Not enough data for calculations.');
    }
    hideWarning(true);
  }
}

var refreshValues = function(samples) {
  //samples = samples.filter(function(value, index) {return index % 4 === 0;});
  samples = samples.map(function(sample) {return convertSample(sample);});
  samples.reverse();
  
  if (isDataOutdated(samples)) {
    showWarning('Viimeisin lämpötilamittaus yli 5 minuuttia vanha.');
  } else {
    hideWarning(true);
  }
  
  var inSamples = samples.filter(function(sample) {return sample.id === inTempSensorId});
  var outSamples = samples.filter(function(sample) {return sample.id === outTempSensorId});

  // Drop every other sample
  inSamples = inSamples.filter(function(sample, index) {return index % 2 === 0;});
  outSamples = outSamples.filter(function(sample, index) {return index % 2 === 0;});

  // Replace data with generated data set
  //inSamples = generateData(inTempSensorId, 30, 35, 120 * 60 * 1000, 30 * 1000);
  //outSamples = generateData(inTempSensorId, 32, 31.9, 120 * 60 * 1000, 30 * 1000);

  updateCurrentTemp(inSamples);
  updateCurrentEstimate(inSamples, outSamples);

  data.labels = inSamples.map(function(sample) {return sample.time;});

  data.series = [];
  data.series.push(inSamples.map(function(sample) {return sample.temp;}));

  if (debug) {
    // Visualize also heating temps
    data.series.push(outSamples.map(function(sample) {return sample.temp;}));
  }

  if (!chart) {
    initChart();
  } else {
    chart.data = data;
    chart.update();
  }
}

var isDataOutdated = function(samples) {
  var now = moment();
  var last = moment(samples[samples.length - 1].time);

  return now.diff(last, 'minutes') > 5;
}

var convertSample = function(sample) {
  return {
    id: trimSensorId(sample.id),
    time: new Date(sample.timestamp).getTime(),
    temp: parseFloat(sample.temp)
  };
}

// Once we don't have extra parenthesis around the id, this will not be needed anymore
var trimSensorId = function(id) {
  return id.substring(1, id.length - 1);
}

var toLocalDate = function(milliseconds) {
  var inDate = new Date(milliseconds);
  var localDate = new Date();
  localDate.setTime(inDate.getTime() + 60 * 1000 * localDate.getTimezoneOffset());
  return localDate;
}

var getUrlParameter = function(sParam) {
  var sPageURL = decodeURIComponent(window.location.search.substring(1));
  var sURLVariables = sPageURL.split('&');
  var sParameterName;
  var i;

  for (i = 0; i < sURLVariables.length; i++) {
      sParameterName = sURLVariables[i].split('=');

      if (sParameterName[0] === sParam) {
          return sParameterName[1] === undefined ? true : sParameterName[1];
      }
  }
};

Array.prototype.max = function() {
  return Math.max.apply(null, this);
};

Array.prototype.min = function() {
  return Math.min.apply(null, this);
};

Array.prototype.findFirstOrDefault = function (predicateCallback, defaultValue) {
  for (var i = 0; i < this.length; i++) {
      if (i in this && predicateCallback(this[i])) return this[i];
  }

  return defaultValue;
};

Array.prototype.findLastOrDefault = function (predicateCallback, defaultValue) {
  for (var i = this.length - 1; i >= 0; i--) {
      if (i in this && predicateCallback(this[i])) return this[i];
  }

  return defaultValue;
};

var isNumeric = function(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

// Generates data set for testing
var generateData = function(id, minTemp, maxTemp, timeSpan, interval) {
  var sampleCount = timeSpan / interval;
  var tempStep = (maxTemp - minTemp) / sampleCount;
  var time = Date.now() - timeSpan;
  var samples = [];

  for (i = 0; i < sampleCount; i++) {
    samples.push({"temp": minTemp + i * tempStep, "id": id, "time": (time + i * interval)});
  }

  return samples;
}