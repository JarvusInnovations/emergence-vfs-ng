#!/usr/bin/env node

var flatiron = require('flatiron'),
    path = require('path'),
    app = flatiron.app,
    shell = require('shelljs');

// export app instance
module.exports = app;

// load environment into config
app.config.env();

// ensure GIT_DIR and GIT_WORK_TREE are set to what git resolves
app.config.set('GIT_DIR', shell.exec('git rev-parse --git-dir', {silent:true}).stdout.trim());
app.config.set('GIT_WORK_TREE', shell.exec('git rev-parse --show-toplevel', {silent:true}).stdout.trim());

console.log('App setup:', app.config.get('GIT_WORK_TREE'));

app.use(flatiron.plugins.cli, {
  source: path.join(__dirname, 'lib', 'commands'),
  usage: 'Empty Flatiron Application, please fill out commands'
});

app.start();
