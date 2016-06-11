#!/usr/bin/env node

var flatiron = require('flatiron'),
    path = require('path'),
    app = flatiron.app;

// export app instance
module.exports = app;

// load lib
app.lib = require('./lib');

// load environment into config
app.config.env();

// configure flatiron cli plugin
app.use(flatiron.plugins.cli, {
    source: path.join(__dirname, 'commands', 'server'),
    usage: 'Empty Flatiron Application, please fill out commands',
    argv: {
        debug: {
            alias: 'd',
            description: 'Show debug output',
            boolean: true
        }
    }
});

// start app
app.start({
    log: {
        level: app.argv.debug ? 'debug' : 'info'
    }
});