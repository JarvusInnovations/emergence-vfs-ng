#!/usr/bin/env node

var flatiron = require('flatiron'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    app = flatiron.app,
    git = app.git = new (require('git-wrapper'))();

// export app instance
module.exports = app;

// load environment into config
app.config.env();

// configure flatiron cli plugin
app.use(flatiron.plugins.cli, {
  source: path.join(__dirname, 'lib', 'commands'),
  usage: 'Empty Flatiron Application, please fill out commands'
});

// initialize environment from git
async.series([
    function(callback) {
        git.exec('rev-parse', {'git-dir': true}, [], function(error, output) {
            if (error) {
                return callback(error);
            }

            output = output.trim();

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
        git.exec('rev-parse', {'show-toplevel': true}, [], function(error, output) {
            if (error) {
                return callback(error);
            }

            output = output.trim();

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