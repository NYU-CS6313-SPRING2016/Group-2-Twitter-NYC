var express = require('express'),
	app = express(),
	server = require('http').createServer(app),
    io = require('socket.io').listen(server),
    mongoose = require('mongoose'),
    twitter = require('twitter'),
    turf = require('turf'),
    stemmer = require('porter-stemmer').stemmer;

var cacheDateTime = 86400*1000;
var clearFrequency = 60*1000;

//("hash" -> map(key, array)
//("mention" -> map(key, array))
var pastDataCache = new Object(); //array of sorted [time, content obj]

var locationBound;

var twittSchema = mongoose.Schema({
    keyword: String,
    type: String,
    time: Number,
    user: String,
    location: Array,
    text: String,
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

function readJson(file) {
	// read file
	function readJsonFileSync(filepath, encoding) {
		var fs = require("fs");
		if (typeof (encoding) == 'undefined') {
			encoding = 'utf8';
		}
		var file = fs.readFileSync(filepath, encoding);
		return JSON.parse(file);
	}
    var filepath = __dirname + '/' + file;
    return readJsonFileSync(filepath);
}

function writeToJson(file, data, encoding) {
    var filepath = __dirname + '/' + file;
    var fs = require("fs");
    fs.writeFileSync(filepath, JSON.stringify(data) , 'utf-8'); 
}

function loadCacheData(pastHrs, callback) {
	getPastDataFromMongoDB(pastHrs, callback);
}

function refreshCacheData() {

	function clearOutdateData(target) {
		var now = Date.now();
		for (var key in target) {
			for (var time in target[key]) {
				if (now > time && now -  time > cacheDateTime) {
					//console.log("clear_time: " + time);
					//console.log(target[key]);
					delete target[key][time];
					//console.log(target[key]);
				}
			}
			var empty = true;
			for (var time in target[key]) {
				if (target[key].hasOwnProperty(time)) {
					empty = false;
					break;
				}
			}
			if (empty) {
				//console.log("clear_key: " + key);
				delete target[key];
			}
		}
	}
	clearOutdateData(pastDataCache["hashtag"]);	
	clearOutdateData(pastDataCache["mention"]);
}

function newTweet2Cache(obj, type) {
	var tmp = {
		"type": "Feature",
		"geometry": {
			"type": "Point",
			"coordinates": obj.location
		},
		"properties": {
			"type": type,
			"keyword": obj.keyword,
			"time": obj.time,
			"user": obj.user,
			"text": obj.text
		}
	};
	
	var mapTarget = pastDataCache[type];
	var keyTarget;
	if (!mapTarget.hasOwnProperty(obj.keyword)) {
		keyTarget = new Object();
		mapTarget[obj.keyword] = keyTarget;
	}
	keyTarget = mapTarget[obj.keyword];
	
	if (!keyTarget.hasOwnProperty(obj.time)) {
		keyTarget[obj.time] = [];
	}
	keyTarget[obj.time].push(tmp);
}

function processRealtimeTweet(tweet) {
	
	var user = tweet.user.screen_name;
	var text = tweet.text;
	var coord;
	var time = Date.now();
	
	function saveRecord(obj) {
		var newTwit = new twittHandle(obj);
		newTwit.save(function(err) {
			if (err) throw err;
		});
	}
	
	function storeHashtag(tweet) {
		var length = tweet.entities.hashtags.length;
		for (var i = 0; i < length; i++) {
			//var tag = stemmer(tweet.entities.hashtags[i].text.toLowerCase());
            var tag = tweet.entities.hashtags[i].text.toUpperCase();
			var obj = {
				"keyword": tag,
				"type": "hashtag", 
				"time": time, 
				"user": user, 
				"location": coord, 
				"text":text
			};
			newTweet2Cache(obj, "hashtag");
			saveRecord(obj);
		}
	}

	function storeMention(tweet) {
		var length = tweet.entities.user_mentions.length;
		for (var i = 0; i < length; i++) {
			var name = tweet.entities.user_mentions[i].screen_name.toUpperCase();
			var obj = {
				"keyword":name, 
				"type":"mention", 
				"time":time, 
				"user":user,
				"location": coord, 
				"text":text
			};
			newTweet2Cache(obj, "mention");
			saveRecord(obj);
		}
	}

	function storeKeywords(tweet) {
		storeHashtag(tweet);
		storeMention(tweet);
	}
	
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
	var valid = locationBound.features.some(function (f) {
		if (turf.inside(point, f)) {
			return true;
		}
	})
	
	if (!valid) return;
	
	point["properties"] = {
		"text":text
	};
	var content = {
		"user":user,
		"text":text,
		"coord":coord,
		"point": point
	}

	//console.log(content);
	storeKeywords(tweet);
	io.sockets.emit('new tweets', content);
}

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

function getPastDataFromMongoDB(pastHrs, callback) {
    var end = Date.now();
    var start;
    if (pastHrs === undefined) {
        start = end - cacheDateTime;
    } else {
        var tmp = parseInt(pastHrs);
        if (tmp > 7 * 24 || tmp < 1) {
            start = end - cacheDateTime;
        } else {
            start = end - tmp*3600*1000;
        }
    }
    var query = twittHandle.find(shcemaGetData(start, end));
    query.select({"keyword":1, "_id":0, "type":1, "location":1, "time":1, "user":1, "text":1});
    query.exec(function(err, docs) {
		var hashMapObj;
		var mentionMapObj;
		if (!pastDataCache.hasOwnProperty("hashtag")) {
			hashMapObj = new Object();
			pastDataCache["hashtag"] = hashMapObj;
		} 
		if (!pastDataCache.hasOwnProperty("mention")) {
			mentionMapObj = new Object();
			pastDataCache["mention"] = mentionMapObj;
		}
		
		hashMapObj = pastDataCache["hashtag"];
		mentionMapObj = pastDataCache["mention"];
		
		for (var i = 0; i < docs.length; i++) {
			var mapTarget = (docs[i].type == "hashtag") ?hashMapObj :mentionMapObj;
			var keyTarget;
			if (!mapTarget.hasOwnProperty(docs[i].keyword)) {
				keyTarget = new Object();
				mapTarget[docs[i].keyword] = keyTarget;
			}
			keyTarget = mapTarget[docs[i].keyword];

			var tmp = {
				"type": "Feature",
				"geometry": {
					"type": "Point",
					"coordinates": docs[i].location
				},
				"properties": {
					"type": docs[i].type,
					"keyword": docs[i].keyword,
					"time": docs[i].time,
					"user": docs[i].user,
					"text": docs[i].text
				}
			};
			
			if (!keyTarget.hasOwnProperty(docs[i].time)) {
				keyTarget[docs[i].time] = [];
			}
			keyTarget[docs[i].time].push(tmp);
		}
		console.log("Finish Loading history data to cache...");
		callback();
	});	
}

function sendPastData(socket, pastHrs) {
	var data = [];
	var now = Date.now();
	function collectData(target, pastHrs) {
		for (var key in target) {
			for (var time in target[key]) {
				//unlikely now < time
				if (now <= time || (now > time && now - time < pastHrs * 3600 * 1000)) {
					//console.log(target[key][time]);
					data = data.concat(target[key][time]);
                    //console.log(data.length);
				}
			}
		}
	}
	collectData(pastDataCache["hashtag"], pastHrs);
	collectData(pastDataCache["mention"], pastHrs);
	socket.emit('past data', data);
	//console.log(data.length);
    //writeToJson("data.json", data, 'utf-8');
}

function systemInit() {
	//connect to MongoDB
	mongoose.connect('mongodb://localhost/twitter', function(err) {
		if (err) {
			console.log(err);
		} else {
			console.log('Connected to mongodb!');
			step2();
		}
	});
	
	function step2() {
		//load past 24hrs data as cache to speed up client reqs
		console.log("Load history data...")
		loadCacheData(24, step3);
	}

	function step3() {
		//set timer to polling cache data delete outdated cache;
		var refreshId = setInterval(refreshCacheData, clearFrequency);
		
		//read location filtering file
		locationBound = readJson('new-york-city-boroughs.geojson');
		
		//start server listening
		console.log("Listen on port: " + 80);
		server.listen(80);
		
		step4();
	}
	
	function step4() {
		twittClient.stream('statuses/filter', {locations: '-74,40,-73,41'}, function(stream) {
			stream.on('data', function(tweet) {
				processRealtimeTweet(tweet);
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
		app.get('/classie.js', function(req, rsp) {
			rsp.sendfile(__dirname + '/classie.js');
		});
		app.get('/style.css', function(req, rsp) {
			rsp.sendfile(__dirname + '/style.css');
		});

		io.sockets.on('connection', function(socket) {
			//socket io cmd format
			//console.log("new conn");
			socket.on('past data', function(pastHrs) {
				//console.log("past data");
				sendPastData(socket, pastHrs);
			});
		});
	}
}

systemInit();

