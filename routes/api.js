var express = require('express');
var router = express.Router();
var db = require('../db.js');


db.createIndexIfNotExist();

// router.get('/test', function (req, res, next) {
//     console.log("testing");
//     db.createIndexIfNotExist();
// })
router.post('/:id', function (req, res) {
    db.addTweet(req.body, req.params.id)
        .then(function (resp) {
            res.json(resp)
        });
})
router.get('/', function (req, res) {
    db.getAllTweets().then(function (data) {
        res.json(data);
    }, function (err) {
        console.trace(err.message);
        res.json("[]");
    });
});
router.delete('/', function (req, res) {
    db.deleteAndCreateIndex().then(function (resp) {
        res.send(resp)
    });
})
router.get('/text/:toSearch', function (req, res) {
    db.searchByText(req.params.toSearch).then(function (data) {
        res.json(data);
    }, function (err) {
        console.trace(err.message);
        res.json("[]");
    });
});
router.get('/text/autocomplete/:toSearch', function (req, res) {
    // console.log(req.params.toSearch);
    db.searchByText(req.params.toSearch).then(function (data) {
        data = data.map(function (d) {
            return d.properties.text;
        })
        res.json(data);
    }, function (err) {
        console.trace(err.message);
        res.json("[]");
    });
})
module.exports = router;