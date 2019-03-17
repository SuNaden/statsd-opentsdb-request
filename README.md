# statsd-opentsdb-request
Pluggable backend for [statsd](https://github.com/etsy/statsd) to send data to OpenTSDB via HTTP requests.
This backend expects the metrics to be submitted in a "dotted" format (e.g. `environment.hostname.metric_name`).

# Installation
If you do not have Statsd set up, follow [this link](https://github.com/etsy/statsd#installation-and-configuration)

Local node_modules installation\
`npm install statsd-opentsdb-request`\
\
If you perhaps prefer to install this globally then use\
`npm install -g statsd-opentsdb-request`

And then update your `backends` in the Statsd config file by adding `[statsd-opentsdb-request]` (more details [here](https://github.com/etsy/statsd/blob/master/docs/backend.md))

# Configuration
Inside your statsd config file (like [this one](https://github.com/etsy/statsd/blob/master/exampleConfig.js)) include following (the only required field is `opentsdbHost`)

**Note that the tags field of a metric sent to OpenTSDB is always autopopulated by `hostname` tag which contains the host who sent the metric.**

```
opentsdbHost: Address of your OpenTSDB server ,
opentsdbPort: Port of your OpenTSDB server ,
opentsdbPrefix: Prefix for all of the metrics sent to OpenTSDB ,
opentsdb: {
  prefixCounter : Prefix for all counter metrics ,
  prefixTimer : Prefix for all timer metrics ,
  prefixGauge : Prefix for all gauge metrics ,
  prefixSet : Prefix for all set metrics ,
  tags : Key/value store determining tags to be parsed, explained in detail below
}
```

Example configuration
```
opentsdbHost: 'localhost/opentsdb' ,
opentsdbPort: '4242' ,
opentsdbPrefix: 'localtest' ,
opentsdb: {
  prefixCounter : 'counters_test' ,
  prefixTimer : 'timers_test' ,
  prefixGauge : 'gauges_test' ,
  prefixSet : 'sets_test' ,
  tags : {
    ".*test" : "test_type",
    "AWS|localhost" : "host_name"
  }
}
```

# tags in detail
To support submitting to OpenTSDB with tags customisable by the user, we can specify them in the mentioned `tags` as an array of key/value or to be more precise in this case, regex/tag. The key is a regex matching the submitted name of the metric and the value would be the tag name to which it should be assigned. If this did not make a lot of sense please take a look at some examples below.

### Regex tags

There is a metric with name `statsd.frontendMachine.invalidArgumentException.exception`.

You want to aggregate all exceptions which should be sent to OpenTSDB, and you want the tags to be `exception_type` and `machine` which in this case are `invalidArgumentException` and `frontendMachine` and which would leave you with a metric name of `statsd.exception`. 

The `tags` config part would look something like this
```
tags : {
  ".*Machine" : "machine",
  ".*Exception" : "exception_type"
}
```
 
Generated Json object which will be sent to OpenTSDB server would look something like
```
name: statsd.exception,
timestamp : 1501513598,
value: 1,
tags: { machine : "frontendMachine", exception_type : "invalidArgumentException"}
```

### Regex tags with metric index

There are cases when you don't really have a control of a metric name (like it's sent from a 3rd party or simply it's dynamically generated), but you know that it will *always* be on a certain index (when split by '.' character). There is an easy solution, just suffix your regex with `_i_x`. That means that the given regexp can be only matched at the given index of a metric name (remember that we are splitting the metric name on dots and we index from 0).

```
tags : {
  ".*_i_1" : "endpoint",
  ".*Exception_i_3" : "exception_type"
}
```
So the `tags` above would match *anything* at the index 1 and save it under the tag `endpoint`. Next, we match anything what matches regex `.*Exception` and is indexed at 3. For example both of the rules would match a metric name
```
test.backend.this.InvalidException
```
because the `backend` is on index `1` and `InvalidException` matched the regex `.*Exception` AND is indexed at position `3`.

Just to make it clear, the `endpoint` rules will match the `backend` below, but nothing will happen to `InvalidException` because it is on index `2` and not `3`.
```
test.backend.InvalidException.this
```


