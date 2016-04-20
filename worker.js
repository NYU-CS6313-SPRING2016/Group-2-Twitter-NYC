
// Twitter-Stream

var http = require('http');
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

//assume that config.json is in application root


var manhattan = readJson('manhattan.geojson');


// Tweet stream
var T = new Twit({
    consumer_key: 'NEcFV7WwVNlgt2PGzcLAd9yHs',
    consumer_secret: 'yrDRbggUfbWOkjHYDYHsfckBy9FLKX8f43340WVHgaTterodMJ',
    access_token: '545857883-mIGQyyOKbK0gLmjLE1WWchK4PfpaRittFiBb5irj',
    access_token_secret: 'dr0pOppvO8mONnRozgFDGTobuNfkQeYJKGJ6yx9Nn8Ega'
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
    console.log("loading")
    sendToDB(tweet);
    // }
    // }
    // io.emit('chat message', tweet);
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
        "id": tweet.id,
        "text": tweet.text,
        "time": tweet.timestamp_ms
    }
    console.log(point);
    var data = JSON.stringify(point);

    // An object of options to indicate where to post to
    var post_options = {
        // host: '127.0.0.1',
        // port: '9200',
        hostname: 'dori-us-east-1.searchly.com',
        path: '/twitter/tweet/' + id,
        method: 'POST',
        auth: 'paas:8fa0549c7855701ee173a9dbe37cbfd3'
        // headers: {
        //     'Content-Type': 'application/json',
        //     'Content-Length': Buffer.byteLength(data)
        // }
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
    post_req.write(data);
    post_req.end();
}



