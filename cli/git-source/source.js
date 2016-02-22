#!/usr/bin/env node

var flatiron = require('flatiron'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    app = flatiron.app,
    lib;

// export app instance
module.exports = app;

// load lib
lib = app.lib = require('./lib');

// load environment into config
app.config.env();

// configure flatiron cli plugin
app.use(flatiron.plugins.cli, {
  source: path.join(__dirname, 'commands', 'source'),
  usage: 'Empty Flatiron Application, please fill out commands'
});

// initialize environment from git
async.series([
    function(callback) {
        lib.execGit('rev-parse', { 'git-dir': true }, function(error, output) {
            if (error) {
                return callback(error);
            }

            fs.realpath(output, function(error, resolvedPath) {
                if (error) {
                    return callback(error);
                }

                app.config.set('GIT_DIR', resolvedPath);

                callback(null, resolvedPath);
            });
        });
    },
    function(callback) {
        lib.execGit('rev-parse', { 'show-toplevel': true }, function(error, output) {
            if (error) {
                return callback(error);
            }

            fs.realpath(output, function(error, resolvedPath) {
                if (error) {
                    return callback(error);
                }

                app.config.set('GIT_WORK_TREE', resolvedPath);

                callback(null, resolvedPath);
            });
        });
    }
], function(error, results) {
    if (error) {
        throw error;
    }

    // start app
    app.start();
});