var app = require('../../source'),
    lib = require('../../lib'),
    Table = require('easy-table');

module.exports = function(callback) {
    lib.getSources(function(error, sources) {
        if (error) {
            app.log.error('Failed got get sources', error.message);
            return callback(error);
        }

        console.log(Table.print(sources.map(function(source) {
            return {
                name: source.name,
                branch: source.branch,
                url: source.url
            };
        })));

        callback();
    });
};