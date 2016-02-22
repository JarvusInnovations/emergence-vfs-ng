var lib = require('../');

module.exports = function(callback) {
    lib.getDefinedSources(function(error, sources) {
        if (error) {
            return callback(error);
        }

        console.log(sources.map(function(source) {
            return source.name;
        }).join('\n'));

        callback();
    });
};