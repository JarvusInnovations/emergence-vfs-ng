#!/usr/bin/env node

var flatiron = require('flatiron'),
    path = require('path'),
    app = flatiron.app;

// export app instance
module.exports = app;

// load environment into config
app.config.env();

app.use(flatiron.plugins.cli, {
  source: path.join(__dirname, 'lib', 'commands'),
  usage: 'Empty Flatiron Application, please fill out commands'
});

app.start();
