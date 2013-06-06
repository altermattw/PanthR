// Db module performance test
var PubSub = require('../libs/pubsub.js').async()
,   _ = require('underscore')
,   realMongo = require('mongodb')
,   Db = require('../libs/db.js')
,   server = {host: 'localhost', port: 27017, dbName: 'testingdb'};

PubSub.subscribe('db/initialized', _performTests);
PubSub.subscribe('db/user/created', _recordCreated);
PubSub.subscribe('db/user/updated', _recordUpdated);
PubSub.subscribe('db/user/deleted', _recordDeleted);
PubSub.subscribe('error/db', _errorFound);


nobjects = 5;
nbatches = 1000;
ninterval = 40;
ntotal = nbatches * nobjects;
objects = Array(nobjects);
results = {};
var i;
for (i=ntotal;i--;) objects[i] = { email: _randomString(50), name: i };
for (i=ntotal;i--;) results[objects[i].email] = [];

function _randomString(length) {
    length = length || Math.round(1000*Math.random());
    var buf = Buffer(length), i;
    for (i=length; i--;) buf[i] = Math.round(92*Math.random()) + 32;
    return buf.toString();
}


function _performTests() {
    console.log("Db initialized")
    for (i=nbatches; i--;) {
        // _addEntry();
        // process.nextTick(
        setTimeout(
            function() { 
            for (var j=nobjects;j--;) {
                _addEntry(); 
            }
        }, ninterval);
    }
}
function _addEntry() {
    var entry = objects[index++];
    results[entry.email][0] = new Date();
    PubSub.publish('db/create/user', [entry]);
}
function _recordCreated(user) {
    // console.log("Getting here!")
    results[user.email][1] = new Date();
    PubSub.publish('db/update/user', [{email: user.email}, {$set: {foo: 'bar'}}]);
}
function _recordUpdated(user) {
    results[user.email][2] = new Date();
    PubSub.publish('db/delete/user',[user]);
}
function _recordDeleted(user) {
    results[user.email][3] = new Date();
    _done();
}
function _errorFound(err) {
    console.log("We're in trouble now!", err);
}

function _getStats(vec) {
    var n = vec.length
    ,   sum = _(vec).reduce(function(memo, x) {return memo + x}, 0)
    ,   sumSq = _(vec).reduce(function(memo, x) {return memo + x*x}, 0)
    ,   mean = sum / n
    ,   sd = Math.sqrt(sumSq / n - mean * mean);
    return { mean: mean, sd: sd };
}

function _processResults() {
    var differences = _.chain(results).values().map(function(x) {return [x[1]-x[0], x[2]-x[1], x[3]-x[1]]}).value();
    var createTimes = _(differences).map(function(x) {return x[0]});
    var updateTimes = _(differences).map(function(x) {return x[1]});
    var deleteTimes = _(differences).map(function(x) {return x[2]});
    console.log("Create Times:", _getStats(createTimes));
    console.log("Update Times:", _getStats(updateTimes));
    console.log("Delete Times:", _getStats(deleteTimes));
    if (callback) {
        callback();
    }
}

// First, we measure PubSub timings by faking the db messages
index = 0;
handlers = [];
handlers.push(PubSub.subscribe('db/create/user', function(user) {PubSub.publish('db/user/created', [user])}));
handlers.push(PubSub.subscribe('db/update/user', function(user) {PubSub.publish('db/user/updated', [user])}));
handlers.push(PubSub.subscribe('db/delete/user', function(email) {PubSub.publish('db/user/deleted', [email])}));

_done = _.after(ntotal, function() {
    console.log("Done! Processing");
    _processResults();
});
callback = function() {
    // This is called after the dry run is completed
    _done = _.after(ntotal, function() {
        console.log("Done! Processing");
        _processResults();
    });
    _(handlers).each(function(h) {PubSub.unsubscribe(h)});
    index = 0;
    for (i=ntotal;i--;) results[objects[i].email] = [];
    callback = function() { process.exit(0); };
    new Db(server);
}
PubSub.publish('db/initialized');

