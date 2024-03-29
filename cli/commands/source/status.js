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

                        source.execGit('rev-parse', 'shallow', function(error, output) {
                            source.shallow = output == 'shallow' ? false : output;
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
                ],

                fetchHead: [
                    'initialized',
                    function(callback) {
                        if ('fetchHead' in source) {
                            return callback();
                        }

                        if (!source.initialized) {
                            source.fetchHead = null;
                            return callback();
                        }

                        source.execGit('rev-parse', 'FETCH_HEAD', function(error, output) {
                            source.fetchHead = output == 'FETCH_HEAD' ? false : output;
                            callback();
                        });
                    }
                ],

                fetchHeadTag: [
                    'fetchHead',
                    function(callback, results) {
                        if ('fetchHeadTag' in source) {
                            return callback();
                        }

                        if (!source.fetchHead) {
                            source.fetchHeadTag = null;
                            return callback();
                        }

                        source.execGit('describe', { tags: true }, source.fetchHead, function(error, output) {
                            source.fetchHeadTag = output || false;
                            callback();
                        });
                    }
                ],

                objectStats: [
                    'initialized',
                    function(callback) {
                        if ('objectStats' in source) {
                            return callback();
                        }

                        if (!source.initialized) {
                            source.objectStats = null;
                            return callback();
                        }

                        source.execGit('count-objects', { v: true }, function(error, output) {
                            var objectStats = {};

                            output.split(/\n/).forEach(function(line) {
                                line = line.split(/\s*:\s*/);
                                objectStats[line[0]] = parseInt(line[1]);
                            });

                            source.objectStats = objectStats;
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

            // TODO: implement --porcelain output

            console.log(Table.print(sources.map(function(source) {
                // TODO: add composite head and date
                // TODO: show behind/ahead stats vs remote
                return {
                    name: source.name,
                    initialized: source.initialized ? '\033[32myes\033[0m' : '\033[31mno\033[0m',
                    shallow: source.shallow === null ? '' : source.shallow === false ? '\033[31mno\033[0m' : source.shallowTag ? '\033[32m' + source.shallowTag + '\033[0m' : source.shallow.substr(0, 6),
                    fetchHead: source.fetchHead === null ? '' : source.fetchHead === false ? '\033[31mno\033[0m' : source.fetchHeadTag ? '\033[32m' + source.fetchHeadTag + '\033[0m' : source.fetchHead.substr(0, 6),
                    looseObjects: source.objectStats.count,
                    looseBytes: source.objectStats.size,
                    packedObjects: source.objectStats['in-pack'],
                    packedBytes: source.objectStats['size-pack']
                };
            }), {
                fetchHead: {
                    name: 'fetch'
                },
                looseObjects: {
                    name: 'loose ob',
                    printer: Table.number()
                },
                looseBytes: {
                    name: 'loose KiB',
                    printer: Table.number()
                },
                packedObjects: {
                    name: 'packed ob',
                    printer: Table.number()
                },
                packedBytes: {
                    name: 'packed KiB',
                    printer: Table.number()
                },
            }));

            callback();
        });
    });
};