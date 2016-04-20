var express = require('express');
var path = require('path');
// var favicon = require('serve-favicon');
// var logger = require('morgan');
var cookieParser = require('cookie-parser');
var bodyParser = require('body-parser');

var routes = require('./routes/index');
// var users = require('./routes/users');
var api = require('./routes/api');

var app = express();
var http = require('http');
var server = http.Server(app);

// var http = require('http').Server(app);

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(path.join(__dirname, 'public', 'favicon.ico')));
// app.use(logger('dev'));
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/', routes);
// app.use('/users', users);
app.use('/api', api);
app.set('port', process.env.PORT || 3000);

server.listen(app.get('port'), function () {
    console.log('Listening on port ' + app.get('port'))
});

// Socket.io
var io = require('socket.io')(server);
io.on('connection', function (socket) {
    console.log("connected");
});

// Twitter-Stream

var Twit = require('twit');
var turf = require('turf');
var fs = require("fs");

// read file
function readJsonFileSync(filepath, encoding) {

    if (typeof (encoding) == 'undefined') {
        encoding = 'utf8';
    }
    var file = fs.readFileSync(filepath, encoding);
    return JSON.parse(file);
}

function readJson(file) {

    var filepath = __dirname + '/' + file;
    return readJsonFileSync(filepath);
}

var manhattan = readJson('manhattan.geojson');


// Tweet stream
var T = new Twit({
    consumer_key: 'mkb4SJfnUDEtP5DuqdWl3sOWu',
    consumer_secret: 'JeYMNYqoQzX8kiHC33iTklgLcQ9upU2ftDvrKtFCrJFG8Cy8Th',
    access_token: '545857883-RV7drTvRsUVygHIPGto7ozhwNd54GTs3xSmOhQDa',
    access_token_secret: '16w3YvbvCjBxftVdVSncYLp9PmmnewlwCpr7Nw9oodrKi'
})

// getting stream from NYC
var stream = T.stream('statuses/filter', { locations: "-73.999730,40.752123,-73.975167,40.762188" })
// var stream = T.stream('statuses/sample')

stream.on('tweet', function (tweet) {
    // var regex = /[-a-zA-Z0-9@:%_\+.~#?&//=]{2,256}\.[a-z]{2,4}\b(\/[-a-zA-Z0-9@:%_\+.~#?&//=]*)?/gi;
    // console.log("loading");
    // if (tweet.text.match(regex)) {
    //     console.log("has url: " + tweet.text);
    // } else {

    console.log("loading");
    sendToDB(tweet);
    io.emit('chat message', tweet);
    // }
    // }
})


// Send to ElasticSearch
function sendToDB(tweet) {
    var id = tweet.id_str;
    var point;
    if (tweet.coordinates == null) {
        var box = tweet.place.bounding_box.coordinates[0]
        // generate a random point from bounding box
        point = turf.random('points', 1, {
            bbox: [box[0][0], box[0][1], box[2][0], box[2][1]]
        }).features[0];
    } else {
        point = {
            "type": "Feature",
            "geometry": tweet.coordinates
        }
    }
    var valid = manhattan.features.some(function (f) {
        if (turf.inside(point, f)) {
            return true;
        }
    })
    if (!valid) return;
    point.properties = {
        "text": tweet.text,
        "time": tweet.timestamp_ms
    }
    
    // send to front-end
    io.emit('tweet', point);

    var data = JSON.stringify(point);

    var post_options = {
        host: 'localhost',
        port: app.get('port'),
        path: '/api/' + id,
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': data.length
        }
    };

    // Set up the request
    var post_req = http.request(post_options, function (res) {
        res.setEncoding('utf8');
        res.on('data', function (chunk) {
            console.log('Response: ' + chunk);
        });
    }).on('error', function (e) {
        console.log(e)
    });
    // post the data
    // console.log(data);
    post_req.write(data);
    post_req.end();
}

// catch 404 and forward to error handler
app.use(function (req, res, next) {
    var err = new Error('Not Found');
    err.status = 404;
    next(err);
});



// error handlers

// development error handler
// will print stacktrace
if (app.get('env') === 'development') {
    app.use(function (err, req, res, next) {
        res.status(err.status || 500);
        res.render('error', {
            message: err.message,
            error: err
        });
    });
}

// production error handler
// no stacktraces leaked to user
app.use(function (err, req, res, next) {
    res.status(err.status || 500);
    res.render('error', {
        message: err.message,
        error: {}
    });
});

module.exports = app;


