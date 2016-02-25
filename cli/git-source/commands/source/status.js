var app = require('../../source'),
    lib = require('../../lib'),
    fs = require('fs'),
    path = require('path'),
    async = require('async'),
    Table = require('easy-table');

module.exports = function(callback) {
    lib.getSources(function(error, sources) {
        if (error) {
            app.log.error('Failed got get sources', error.message);
            return callback(error);
        }

        async.each(sources, function(source, callback) {
            async.auto({
                initialized: function(callback) {
                    if ('initialized' in source) {
                        return callback();
                    }

                    fs.exists(source.gitDir, function(exists) {
                        source.initialized = exists;
                        callback();
                    });
                },

                shallow: [
                    'initialized',
                    function(callback) {
                        if ('shallow' in source) {
                            return callback();
                        }

                        if (!source.initialized) {
                            source.shallow = null;
                            return callback();
                        }

                        source.execGit('rev-parse', 'shallow', function(error, shallow) {
                            source.shallow = shallow == 'shallow' ? false : shallow;
                            callback();
                        });
                    }
                ],

                shallowTag: [
                    'shallow',
                    function(callback, results) {
                        if ('shallowTag' in source) {
                            return callback();
                        }

                        if (!source.shallow) {
                            source.shallowTag = null;
                            return callback();
                        }

                        source.execGit('describe', { tags: true }, source.shallow, function(error, output) {
                            source.shallowTag = output || false;
                            callback();
                        });
                    }
                ]
            }, callback);
        }, function(error) {
            if (error) {
                app.log.error('Failed to check source status', error.message);
                return callback(error);
            }

            console.log(Table.print(sources.map(function(source) {
                return {
                    name: source.name,
                    initialized: source.initialized ? '\033[32myes\033[0m' : '\033[31mno\033[0m',
                    shallow: source.shallow === null ? '' : source.shallow === false ? '\033[31mno\033[0m' : source.shallowTag ? '\033[32m' + source.shallowTag + '\033[0m' : source.shallow.substr(0, 6)
                };
            })));

            callback();
        });
    });
};