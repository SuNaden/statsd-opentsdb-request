/*
 * Flush stats to OpenTSDB (http://opentsdb.net/).
 *
 * To enable this backend, include 'statsd-opentsdb' in the backends
 * configuration array:
 *
 *   backends: ['statsd-opentsdb']
 *
 * This backend supports the following config options:
 *
 *   opentsdbHost: Hostname of opentsdb server.
 *   opentsdbPort: Port to contact opentsdb server at.
 */

var net = require('net'),
    util = require('util');
    request = require('request');
    os = require("os");


var debug;
var flushInterval;
var opentsdbHost;
var opentsdbPort;
var opentsdbPrefix;

// prefix configuration
var prefixCounter;
var prefixTimer;
var prefixGauge;
var prefixSet;

var tagSet;

var opentsdbStats = {};

var post_stats = function opentsdb_post_stats(statString) {
  if (opentsdbHost) {
    try {
      var ts = Math.round(new Date().getTime() / 1000);
      var metrics = statString.split("\n");
      for (var i = 0; i < metrics.length; i++) {
        console.log(metrics[i]);
        var metric = metrics[i].split(" ");
        if (metric[1] && metric[2]) {
          request.post(opentsdbHost,
            { json: { metric: metric[0],
                      timestamp: metric[1],
                      value: metric[2],
                      tags: {hostname: os.hostname()} } },
              function (error, response, body) {
                util.log(error);
              }
          );
        }
      }
    } catch(e) {
      if (debug) {
        util.log(e);
      }
    }
  }
}

// Returns a list of "tagname=tagvalue" strings from the given metric name.
function parse_tags(metric_name) {
  var parts = metric_name.split('.');
  var tags = [];
  var current_tag_name = '';
  for (i in parts) {
    for (var tag in tagSet) {
      console.log(i + " " + tag);
      if (i === tag) {
        console.log(tagSet[tag]);
      }
    }
  }

  return tags;
}

// Strips out all tag information from the given metric name
function strip_tags(metric_name) {
  var parts = metric_name.split('.');
  var rslt_parts = [];
  while (parts.length > 0) {
    if (parts[0].indexOf(opentsdbPrefix) == 0) {
      parts.shift();
      parts.shift();
      continue;
    }
    rslt_parts.push(parts.shift());
  }

  return rslt_parts.join('.');
}


var flush_stats = function opentsdb_flush(ts, metrics) {
  var suffix = "\n";
  var starttime = Date.now();
  var statString = '';
  var key;
  var timer_data_key;
  var counters = metrics.counters;
  var gauges = metrics.gauges;
  var timers = metrics.timers;
  var sets = metrics.sets;
  var timer_data = metrics.timer_data;
  var statsd_metrics = metrics.statsd_metrics;

  for (key in counters) {
    var tags = parse_tags(key);
    var stripped_key = strip_tags(key)
    var value = counters[key];
    statString += opentsdbPrefix + '.' + prefixCounter + '.' + stripped_key + '.count' + ' ' + ts + ' ' + value + ' ' + tags.join(' ') + suffix;
  }

  for (key in timer_data) {
    if (Object.keys(timer_data).length > 0) {
      for (timer_data_key in timer_data[key]) {
        var tags = parse_tags(key);
        var stripped_key = strip_tags(key)
        var the_key = opentsdbPrefix + '.' + prefixTimer + '.' + stripped_key;
        statString += the_key + '.' + timer_data_key + ' ' + ts + ' ' + timer_data[key][timer_data_key] + ' ' + tags.join(' ') + suffix;
      }
    }
  }

  for (key in gauges) {
    var tags = parse_tags(key);
    var stripped_key = strip_tags(key)
    statString += opentsdbPrefix + '.' + prefixGauge + '.' + stripped_key + '.gauge ' + ts + ' ' + gauges[key] + ' ' + tags.join(' ') + suffix;
  }

  for (key in sets) {
    var stripped_key = strip_tags(key)
    var tags = parse_tags(key);
    var name = opentsdbPrefix + '.' + prefixSet + '.' + stripped_key
    statString += name + '.count ' + ts + ' ' + sets[key].values().length + ' ' + tags.join(' ') + suffix;
  }

  for (key in statsd_metrics) {
    statString += opentsdbPrefix + '.' + key + ' ' + ts + ' ' + statsd_metrics[key];
  }

  post_stats(statString);
};

var backend_status = function opentsdb_status(writeCb) {
  for (stat in opentsdbStats) {
    writeCb(null, 'opentsdb', stat, opentsdbStats[stat]);
  }
};

exports.init = function opentsdb_init(startup_time, config, events) {
  // Opentsdb configurations
  debug = config.debug;
  opentsdbHost      = config.opentsdbHost;
  opentsdbPort      = config.opentsdbPort;
  opentsdbPrefix    = config.opentsdbPrefix;

  // Extra parameters for statsd metrics
  config.opentsdb   = config.opentsdb || {};
  prefixCounter     = config.opentsdb.prefixCounter;
  prefixTimer       = config.opentsdb.prefixTimer;
  prefixGauge       = config.opentsdb.prefixGauge;
  prefixSet         = config.opentsdb.prefixSet;
  tagSet            = config.opentsdb.tags;

  prefixCounter = prefixCounter !== undefined ? prefixCounter : '';
  prefixTimer   = prefixTimer !== undefined ? prefixTimer : '';
  prefixGauge   = prefixGauge !== undefined ? prefixGauge : '';
  prefixSet     = prefixSet !== undefined ? prefixSet : '';

  flushInterval = config.flushInterval;

  events.on('flush', flush_stats);
  events.on('status', backend_status);

  return true;
};
