var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    mongoose = require('mongoose'),
    twitter = require('twitter'),
    turf = require('turf'),
    stemmer = require('porter-stemmer').stemmer,
    users = {};

server.listen(80);

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

var manhattanLoc = readJson('new-york-city-boroughs.geojson');

mongoose.connect('mongodb://localhost/twitter', function(err) {
    if (err) {
        console.log(err);
    } else {
        console.log('Connected to mongodb!');
    }
});

var twittSchema = mongoose.Schema({
    keyword: String,
    type: String,
    time: Number,
    user: String,
    location: Array,
    createDate:  {
        type: Date, expires: 60*60*24*5, default:Date.now
    },
});

var twittHandle = mongoose.model('Twitters', twittSchema);

var twittClient = new twitter({
  consumer_key: 'h8sDwoPDJPOCb0AudnnGuqMFH',
  consumer_secret: 'awvIHfK9xKuNMYitksINlTk8jHgEivop3dPT8eiUIATTlrB7wE',
  access_token_key: '714502742715277312-TcimPtQmCliSdyLl9loFkgacRyAT0Vg',
  access_token_secret: '3KJc4uG2HjXM3dwL9vZk0110PzlpmJcDwOisobliiQKhe'
});

twittClient.stream('statuses/filter', {locations: '-74,40,-73,41'}, function(stream) {
    stream.on('data', function(tweet) {
        var user = tweet.user.screen_name;
        var text = tweet.text;
        var coord;// = tweet.place.bounding_box.coordinates[0];
        var point;
        if (tweet.coordinates == null) {
            var box = tweet.place.bounding_box.coordinates[0]
            point = turf.random('points', 1, {
                    bbox: [box[0][0], box[0][1], box[2][0], box[2][1]]
                }).features[0];
            coord = point.geometry.coordinates;
        } else {
            point = {
                "type": "Feature",
                "geometry": {
                    "type" : "Point",
                    "coordinates": tweet.coordinates
                }
            }
            coord = tweet.coordinates.coordinates;
        }
        //console.log(coord);
        var valid = manhattanLoc.features.some(function (f) {
            if (turf.inside(point, f)) {
                return true;
            }
        })
        if (!valid) return;
        var time = parseInt(tweet.timestamp_ms);
		point["properties"] = {
			"text":text
		};
        var content = {
            "user":user,
            "text":text,
            "coord":coord,
            "point": point
        }
    	function storeHashtag(tweet) {
            var hashtag = [];
            var length = tweet.entities.hashtags.length;
            if(length != 0) {
                for (var i = 0; i < length; i++) {
                    var tag = stemmer(tweet.entities.hashtags[i].text.toLowerCase());
                    var newTwit = new twittHandle({keyword:tag.toUpperCase(), type:"hashtag", time:time, user:user, location: coord});
                    newTwit.save(function(err) {
                        if (err) throw err;
                    });
                }
            }
        }

        function storeMention(tweet) {
            var length = tweet.entities.user_mentions.length;
            if(length != 0) {
                for (var i = 0; i < length; i++) {
                    var name = stemmer(tweet.entities.user_mentions[i].screen_name.toLowerCase());
                    var newTwit = new twittHandle({keyword:name.toUpperCase(), type:"mention", time:time, user:user, location: coord});
                    newTwit.save(function(err) {
                        if (err) throw err;
                    });
                }
            }
        }

        function storeKeywords(tweet) {
            storeHashtag(tweet);
            storeMention(tweet);
        }
        //console.log(content);
        storeKeywords(tweet);
        io.sockets.emit('new tweets', content);
    });

    stream.on('error', function(error) {
        throw error;
    });
});

app.get('/', function(req, rsp) {
    rsp.sendfile(__dirname + '/index.html');
});

app.get('/func.js', function(req, rsp) {
    rsp.sendfile(__dirname + '/func.js');
});

function schemaGetFirstNBetween(start, end, N) {
    var schema = [
        { $match: {"time": {$gt:start, $lt:end}}},
        { $group: {_id: "$keyword", "count": {$sum:1}}},
        { $sort: {count: -1}},
        { $limit: N}
    ];
    return schema;
}

function schemaGetKeyTrendBetween(keyword, start, end) {
    var schema = [
        { $match: {"time": {$gt:start, $lt:end}, "keyword":keyword}},
        { $sort: {time: 1}}
    ];
    return schema;
}

function shcemaGetData(start, end) {
    var schema = {
        "time": {$gt:start, $lt:end}
    };
    return schema;
}

io.sockets.on('connection', function(socket) {
    //respond keywords list on connection

    function updateKeywordList() {
        var end = Date.now();
        var start = end - 7200*1000;
        twittHandle.aggregate(schemaGetFirstNBetween(start, end, 10), function(err, docs) {
            socket.emit('keyword sorted list', docs);
            //console.log(docs);
        });
    }

    function getPastData(pastHrs) {
        var end = Date.now();
        var start;
		if (pastHrs === undefined) {
			start = end - 86400*1000;
		} else {
			var tmp = parseInt(pastHrs);
			if (tmp > 7 * 24 || tmp < 1) {
				start = end - 86400*1000;
			} else {
				start = end - tmp*3600*1000;
			}
		}
        var query = twittHandle.find(shcemaGetData(start, end));
        query.select({"keyword":1, "_id":0, "type":1, "location":1, "time":1});
        query.exec(function(err, docs) {
            var data = [];
            for (var i = 0; i < docs.length; i++) {
                var tmp = {
                    "type": "Feature",
                    "geometry": {
                        "type": "Point",
                        "coordinates": docs[i].location
                    },
                    "properties": {
                        "type": docs[i].type,
                        "keyword": docs[i].keyword,
                        "time": docs[i].time
                    }
                };
                data.push(tmp);
            }
            socket.emit('past data', data);
        });
    }

    //updateKeywordList();
    //getLast24HoursData();

    socket.on('update keyword list', function() {
        updateKeywordList();
    });

    //req and rsp of keyword trend
    socket.on('keyword trend', function(data, pastHrs, callback) {
        var end = Date.now();
        var start;
		if (pastHrs === undefined) {
			start = end - 86400*1000;
		} else {
			var tmp = parseInt(pastHrs);
			if (tmp > 7 * 24 || tmp < 1) {
				start = end - 86400*1000;
			} else {
				start = end - pastHrs*3600*1000;
			}
		}
		if (data == undefined) {
			return;
		}
        twittHandle.aggregate(schemaGetKeyTrendBetween(data.trim().toUpperCase(), start, end), function(err, docs) {
            //console.log(docs);
			if (docs.length == 0) {
				if (callback != undefined) callback("No Data");
				return;
			}
            var result = [];
            var cnt = parseInt((end - start) / (600*1000));
            for (var i = 0; i < cnt; i++) {
                result[i] = 0;
            }
            for (var i = 0; i < docs.length; i++) {
                var time = docs[i].time;
                var id = parseInt((time - start) / (600*1000));
                if (result[id] == undefined) {
                    result[id] = 1;
                } else {
                    result[id] ++;
                }
            }
            //console.log(result);
            var content = {
                "key": data,
                "result": result
            }
            socket.emit('keyword trend', content);
        });
    });

    //socket io cmd format
    socket.on('past data', function(pastHrs) {
        getPastData(pastHrs);
    });
});
