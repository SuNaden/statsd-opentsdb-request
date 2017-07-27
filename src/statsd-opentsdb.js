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

var debug;
var flushInterval;
var opentsdbHost;
var opentsdbPort;
var opentsdbPrefix;

// prefix configuration
var prefixPersecond;
var prefixCounter;
var prefixTimer;
var prefixGauge;
var prefixSet;

// set up namespaces
var counterNamespace = [];
var timerNamespace   = [];
var gaugesNamespace  = [];
var setsNamespace     = [];

var opentsdbStats = {};

var post_stats = function opentsdb_post_stats(statString) {
  var last_flush = opentsdbStats.last_flush || 0;
  var last_exception = opentsdbStats.last_exception || 0;
  if (opentsdbHost) {
    try {
      var opentsdb = net.createConnection(opentsdbPort, opentsdbHost);
      opentsdb.addListener('error', function(connectionException){
        if (debug) {
          util.log(connectionException);
        }
      });
      opentsdb.on('connect', function() {
        var ts = Math.round(new Date().getTime() / 1000);
        statString += opentsdbPrefix + '.opentsdbStats.last_exception ' + last_exception + ' ' + ts + "\n";
        statString += opentsdbPrefix + '.opentsdbStats.last_flush ' + last_flush + ' ' + ts + "\n";
		if (debug) {
			util.log(statString)
		}
        this.write(statString);
        this.end();
        opentsdbStats.last_flush = Math.round(new Date().getTime() / 1000);
      });
    } catch(e){
      if (debug) {
        util.log(e);
      }
      opentsdbStats.last_exception = Math.round(new Date().getTime() / 1000);
    }
  }
}

// Returns a list of "tagname=tagvalue" strings from the given metric name.
function parse_tags(metric_name) {
  var parts = metric_name.split(".");
  var tags = [];
  var current_tag_name = "";
  for (i in parts) {
    var p = parts[i]
    if (p.indexOf(opentsdbPrefix) == 0) {
      var tag_name = p.split(opentsdbPrefix)[1];
      current_tag_name = tag_name
    } else if (current_tag_name != "") {
      tags.push(current_tag_name + "=" + p);
      current_tag_name = "";
    }
  }

  return tags;
}

// Strips out all tag information from the given metric name
function strip_tags(metric_name) {
  var parts = metric_name.split(".");
  var rslt_parts = [];
  while (parts.length > 0) {
    if (parts[0].indexOf(opentsdbPrefix) == 0) {
      parts.shift();
      parts.shift();
      continue;
    }
    rslt_parts.push(parts.shift());
  }

  return rslt_parts.join(".");
}


var flush_stats = function opentsdb_flush(ts, metrics) {
  var starttime = Date.now();
  var statString = '';
  var numStats = 0;
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

    var namespace = counterNamespace.concat(stripped_key);
    var value = counters[key];

    statString += namespace.concat('count').join(".") + ' ' + ts + ' ' + value + ' ' + tags.join(' ');
    numStats += 1;
  }

  for (key in timer_data) {
    if (Object.keys(timer_data).length > 0) {
      for (timer_data_key in timer_data[key]) {
        var tags = parse_tags(key);
        var stripped_key = strip_tags(key)

        var the_key = opentsdbPrefix + "." +prefixTimer + "." + stripped_key;
        statString += the_key + '.' + timer_data_key + ' ' + ts + ' ' + timer_data[key][timer_data_key] + ' ' + tags.join(' ');
      }

      numStats += 1;
    }
  }

  for (key in gauges) {
    var tags = parse_tags(key);
    var stripped_key = strip_tags(key)

    statString += opentsdbPrefix + '.' + prefixGauge + '.gauge ' + ts + ' ' + gauges[key] + ' ' + tags.join(' ');
    numStats += 1;
  }

  for (key in sets) {
    var tags = parse_tags(key);
    var stripped_key = strip_tags(key)
    statString += opentsdbPrefix + '.' + prefixSet + '.count ' + ts + ' ' + sets[key].values().length + ' ' + tags.join(' ');
    numStats += 1;
  }

  statString += opentsdbPrefix + '.numStats ' + ts + ' ' + numStats;
  statString += opentsdbPrefix + '.opentsdbStats.calculationtime ' + ts + ' ' + (Date.now() - starttime);
  for (key in statsd_metrics) {
    var the_key = opentsdbPrefix + "." + key;
    statString += the_key + ' ' + ts + ' ' + statsd_metrics[key];
  }

  post_stats(statString);
};

var backend_status = function opentsdb_status(writeCb) {
  for (stat in opentsdbStats) {
    writeCb(null, 'opentsdb', stat, opentsdbStats[stat]);
  }
};

exports.init = function opentsdb_init(startup_time, config, events) {
  debug = config.debug;
  opentsdbHost      = config.opentsdbHost;
  opentsdbPort      = config.opentsdbPort;
  opentsdbPrefix    = config.opentsdbPrefix

  config.opentsdb = config.opentsdb || {};
  prefixCounter     = config.opentsdb.prefixCounter;
  prefixTimer       = config.opentsdb.prefixTimer;
  prefixGauge       = config.opentsdb.prefixGauge;
  prefixSet         = config.opentsdb.prefixSet;

  // set defaults for prefixes
  prefixCounter = prefixCounter !== undefined ? prefixCounter : "";
  prefixTimer   = prefixTimer !== undefined ? prefixTimer : "";
  prefixGauge   = prefixGauge !== undefined ? prefixGauge : "";
  prefixSet     = prefixSet !== undefined ? prefixSet : "";

  opentsdbStats.last_flush = startup_time;
  opentsdbStats.last_exception = startup_time;

  flushInterval = config.flushInterval;

  events.on('flush', flush_stats);
  events.on('status', backend_status);

  return true;
};
