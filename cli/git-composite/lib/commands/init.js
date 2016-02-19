var app = require('../../app'),
    git = require('git-wrapper'),
    Repo = require('git').Repo;

module.exports = function(callback) {
    console.log('init.js!');
    // console.log(app.log);
    console.log('init.js! working tree=', app.config.get('GIT_WORK_TREE'));

    console.log(arguments);
    callback(null);
};