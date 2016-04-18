$(function() {
  
  var animate = true;
  var optimalTemp = 36.5;
  var timeWindow = 'now -2 hour';
  var endpointUrl = 'https://data.sparkfun.com/output/OG62ZDJ65VC3x9jmWbK0.json';
  
  var options = {
    showLine: true,
    axisX: {
      labelInterpolationFnc: function(value, index) {
        return index % 10 === 0 ? getLabel(value) : null;
      }
    }
  };

  var getLabel = function(value) {
    return value.getHours() + ':' + (Math.floor(value.getMinutes() / 10) * 10); 
  }
  
  var responsiveOptions = [
    ['screen and (min-width: 640px)', {
      axisX: {
        labelInterpolationFnc: function(value, index) {
          return index % 10 === 0 ? getLabel(value) : null;
        }
      }
    }]
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
          return Math.round((previousTemp + 0.2 * delta) * 100) / 100;
        }));
        
        if (chart == null) {
          initChart();
        } else {
          chart.data = data;
          chart.update();
        }
      }
    }).fail(function() {
      console.log("Referesh failed.");
    });
  }
  
  function toLocalDate (timestamp) {
    var inDate = new Date(timestamp);
    var localDate = new Date();
    localDate.setTime(inDate.valueOf() + 60000 * inDate.getTimezoneOffset());
    return localDate;
  }
  
  // Let's put a sequence number aside so we can use it in the event callbacks
  var seq = 0,
    delays = 80,
    durations = 500;

  var initChart = function () {
    chart = new Chartist.Line('.ct-chart', data, options, responsiveOptions);
    
    // Once the chart is fully created we reset the sequence
    chart.on('created', function() {
      seq = 0;
    });

    // On each drawn element by Chartist we use the Chartist.Svg API to trigger SMIL animations
    chart.on('draw', function(data) {

      if (data.type === 'line') {
        // If the drawn element is a line we do a simple opacity fade in. This could also be achieved using CSS3 animations.
        data.element.animate({
          opacity: {
            // The delay when we like to start the animation
            begin: seq * delays + 1000,
            // Duration of the animation
            dur: durations,
            // The value where the animation should start
            from: 0,
            // The value where it should end
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
      } else if (animate && data.type === 'point') {
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
      } else if (animate && data.type === 'grid') {
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
  }
});