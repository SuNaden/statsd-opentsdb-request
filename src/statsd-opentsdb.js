/*
 * Flush stats to OpenTSDB (http://opentsdb.net/). Inspired by the
 * https://github.com/danslimmon/statsd-opentsdb-backend backend.
 *
 * To enable this backend, include 'statsd-opentsdb' in the backends
 * configuration array:
 *
 *   backends: ['statsd-opentsdb']
 *
 * This backend supports the following config options:
 *
 *   opentsdbHost: Hostname of opentsdb server.
 *   opentsdbPort: Port for your opentsdb.
 *   opentsdbPrefix: Prefix for all metrics, this can be left out.
 *
 *   Then there is an additional config file with name 'opentsdb' which
 *   may contain the following (each is optional) field
 *   prefixCounter: Prefix for each counter metric.
 *   prefixTimer: Prefix for each timer metric.
 *   prefixGauge: Prefix for each gauge metric.
 *   prefixSet: Prefix for each set metric.
 *   tags: Key/value store containing the metric rules
 */

var util = require('util');
    request = require('request');
    os = require('os');
    queryString = require('querystring');

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

// Sending of the constructed metrics via a request
var post_stats = function opentsdb_post_stats(statsCollection) {
  if (opentsdbHost) {
    try {
      for (statIndex in statsCollection) {
        var stat = statsCollection[statIndex];
        var parsedTags = queryString.parse(stat['tags']);
        parsedTags['hostname'] = os.hostname();
        if (stat['name'] && stat['ts']) {
          request.post(opentsdbHost,
            { json: { metric: stat['name'],
                      timestamp: stat['ts'],
                      value: stat['value'],
                      tags: parsedTags } },
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

// According to tags field in config, this creates key/value store for tags and
// their respective values
function parse_tags(metric_name) {
  var parts = metric_name.split('.');
  var tags = '';
  for (var i = 0; i < parts.length; i++) {
    var matched =  false;
    var part = parts[i];
    for (var tag in tagSet) {
      var regex = new RegExp(tag);
      if (part.match(regex)) {
        tags += tagSet[tag] + '=' + part + '&';
        matched = true;
        break;
      }
    }
    if (matched) {
      parts.splice(i, 1);
    }
  }

  return {name : parts.join('.') , tags : tags.slice(0, -1)};
}

// Parse the stats given by statsd, split the tags from the name and submit
var flush_stats = function opentsdb_flush(ts, metrics) {
  var statsCollection = [];
  var key;
  var timer_data_key;
  var counters = metrics.counters;
  var gauges = metrics.gauges;
  var sets = metrics.sets;
  var timer_data = metrics.timer_data;
  var statsd_metrics = metrics.statsd_metrics;

  for (key in counters) {
    var metric = {};
    var name_tags = parse_tags(key);
    metric['name'] = prefixCounter + name_tags['name'] + '.count';
    metric['ts'] = ts;
    metric['value'] = counters[key];
    metric['tags'] = name_tags['tags'];
    statsCollection.push(metric);
  }

  for (key in timer_data) {
    if (Object.keys(timer_data).length > 0) {
      for (timer_data_key in timer_data[key]) {
        var metric = {};
        var name_tags = parse_tags(key);
        metric['name'] = prefixTimer + name_tags['name'] + '.' + timer_data_key;
        metric['ts'] = ts;
        metric['value'] = timer_data[key][timer_data_key];
        metric['tags'] = name_tags['tags'];
        statsCollection.push(metric);
      }
    }
  }

  for (key in gauges) {
    var metric = {};
    var name_tags = parse_tags(key);
    metric['name'] = prefixGauge + name_tags['name'] + '.gauge';
    metric['ts'] = ts;
    metric['value'] = gauges[key];
    metric['tags'] = name_tags['tags'];
    statsCollection.push(metric);
  }

  for (key in sets) {
    var metric = {};
    var name_tags = parse_tags(key);
    metric['name'] = prefixSet + name_tags['name'] + '.count';
    metric['ts'] = ts;
    metric['value'] = sets[key].values().length;
    metric['tags'] = name_tags['tags'];
    statsCollection.push(metric);
  }

  for (key in statsd_metrics) {
    var metric = {};
    metric['name'] = opentsdbPrefix + key;
    metric['ts'] = ts;
    metric['value'] = statsd_metrics[key];
    metric['tags'] = {};
    statsCollection.push(metric);
  }

  post_stats(statsCollection);
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

  // Setting up correct prefixed for metrics
  if (opentsdbPrefix === undefined) {
    opentsdbPrefix = '';
  } else {
    opentsdbPrefix += '.';
  }

  prefixCounter = prefixCounter !== undefined ? opentsdbPrefix + prefixCounter + '.' : opentsdbPrefix;
  prefixTimer   = prefixTimer !== undefined ? opentsdbPrefix + prefixTimer + '.' : opentsdbPrefix;
  prefixGauge   = prefixGauge !== undefined ? opentsdbPrefix + prefixGauge + '.' : opentsdbPrefix;
  prefixSet     = prefixSet !== undefined ? opentsdbPrefix + prefixSet + '.' : opentsdbPrefix;

  flushInterval = config.flushInterval;

  events.on('flush', flush_stats);

  return true;
};
