var lib = require('../../lib');

module.exports = function(callback) {
    lib.getSources(function(error, sources) {
        if (error) {
            return callback(error);
        }

        console.log(sources.map(function(source) {
            return source.name;
        }).join('\n'));

        callback();
    });
};