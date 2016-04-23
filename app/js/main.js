$(function() {
  var Color = function (r, g, b) {
    this.r = r;
    this.g = g;
    this.b = b;
  };
  
  Color.prototype.toRGBString = function () {
      return 'rgb('+this.r+','+this.g+','+this.b+')';
  };

  // Color is immutable
  Object.freeze(Color);
  
  var spectrum = [
    {offset: 0, color: new Color(53, 203, 229)}, // #35cbe5 25.5°C
    {offset: 0.5, color: new Color(64, 203, 156)}, // #40cb9c 33°C
    {offset: 0.7, color: new Color(124, 202, 87)}, // #7cca57 36°C
    {offset: 0.8, color: new Color(212, 243, 85)}, // #d4f355 37.5°C
    {offset: 0.9, color: new Color(254, 152, 4)}, // #fe9804 39°C
    {offset: 1, color: new Color(223, 51, 65)} // #df3341 40.5°C
  ];

  var minColorTemp = 25.5;
  var maxColorTemp = 40.5;

  var optimalTemp = 36.5;
  var currentTemp = 0.0;

  var timeWindow = 'now -2 hour';
  var endpointUrl = 'https://data.sparkfun.com/output/OG62ZDJ65VC3x9jmWbK0.json';

  var chartAnimate = true; // For one time animations

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
    var interval = 10;
    var steps = duration/interval;
    var step = 1.0/steps;
    var progress = 0.0;
    
    var animationInterval = setInterval(function() {
      if (progress >= 1.0){ clearInterval(animationInterval) }
      element.style.setProperty(property, callback(from, to, progress));
      progress += step;
    }, interval);
  };

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
  
  var updateCurrentTemp = function(newTemp) {
    var gradient = document.getElementById('gradient');
    updateTempGradient(gradient, currentTemp, newTemp);
    currentTemp = newTemp;
  }
  
  var updateTempGradient = function(gradientElement, fromTemp, toTemp) {
    var stops = gradientElement.getElementsByTagName('stop');
    
    for (var i = 0; i < stops.length; i++) {
      var fromColor = getStopColor(fromTemp, i);
      var toColor = getStopColor(toTemp, i);
      
      animateStyleProperty(stops[i], 'stop-color', fromColor, toColor, 2000, function(from, to, progress) {
        var color = interpolateColor(from, to, progress);
        return color.toRGBString();
      });
    }
  };
  /*
  var lolTemp = 25.0;
  setInterval(function() {
    console.log(lolTemp);
    updateCurrentTemp(lolTemp);
    lolTemp += 2.0;
  }, 5000);
  */
  var options = {
    showLine: true,
    axisX: {
      labelInterpolationFnc: function(value, index) {
        return index % 10 === 0 ? getLabel(value) : null;
      }
    },
    axisY: {
      offset: 60,
      labelInterpolationFnc: function(value, index) {
        return formatTemp(value);
      }
    }
  };

  var getLabel = function(value) {
    return value.getHours() + ':' + (Math.floor(value.getMinutes() / 10) * 10); 
  }

  var responsiveOptions = [
    /*
    ['screen and (min-width: 640px)', {
      axisX: {
        labelInterpolationFnc: function(value, index) {
          return index % 10 === 0 ? getLabel(value) : null;
        }
      },
      axisY: {
        offset: 100,
        labelInterpolationFnc: function(value, index) {
          return value + '&nbsp;&deg;C';
        }
      }
    }]
    */
  ];

  var data = {};
  var chart = null;

  setInterval(function () {
    animate = false;
    refresh();
  }, 30000);

  // First draw
  refresh();

  function refresh() {

    $.get(endpointUrl, { 'gte[timestamp]': timeWindow }, function(measurements) {
      console.log(measurements);

      if (measurements instanceof Array && measurements.length >= 4) {
        measurements = measurements.filter(function(value, index) {return index % 4 === 0;});
        measurements.reverse();

        data.labels = measurements.map(function(current) {
          return toLocalDate(current.timestamp);
        });

        var previousTemp = parseFloat(measurements[0].temp);
        data.series = [];
        data.series.push(measurements.map(function(current) {
          var temp = parseFloat(current.temp);
          var delta = temp - previousTemp;

          // Dampen the temperature change, since the sensor data has the tendency to jitter
          return previousTemp + 0.2 * delta;
          //return Math.round((previousTemp + 0.2 * delta) * 100) / 100;
        }));

        if (chart == null) {
          initChart();
        } else {
          chart.data = data;
          chart.update();
        }
      }
    }).fail(function() {
      console.error("Referesh failed.");
    });
  }

  function formatTemp(value) {
    // Dampen the temperature change, since the sensor data has the tendency to jitter
    return value + '&nbsp;&deg;C';
    //return (Math.round(value * 10) / 10) + '&nbsp;&deg;C';
  }

  function toLocalDate (timestamp) {
    var inDate = new Date(timestamp);
    var localDate = new Date();
    localDate.setTime(inDate.valueOf() + 60000 * inDate.getTimezoneOffset());
    return localDate;
  }

  // Let's put a sequence number aside so we can use it in the event callbacks
  var seq = 0;
  var delays = 80;
  var durations = 500;

  var initChart = function() {
    chart = new Chartist.Line('.ct-chart', data, options, responsiveOptions);

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
      } else if (chartAnimate && data.type === 'point') {
        data.element.animate({
          x1: {
            begin: seq * delays,
            dur: durations,
            from: data.x - 10,
            to: data.x,
            easing: 'easeOutQuart'
          },
          x2: {
            begin: seq * delays,
            dur: durations,
            from: data.x - 10,
            to: data.x,
            easing: 'easeOutQuart'
          },
          opacity: {
            begin: seq * delays,
            dur: durations,
            from: 0,
            to: 1,
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
});