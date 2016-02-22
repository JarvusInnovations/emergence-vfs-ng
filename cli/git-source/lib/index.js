var app = require('../app'),
    async = require('async'),
    ini = require('ini'),

    // container for exported library
    lib = module.exports = {},

    // internal caches
    definedSources;


/**
 * Sorts an array of sources by their before/after constraints
 */
lib.sortSources = function(sources, callback) {
    sources = sources.concat(); // clone array to avoid modifying input

    sources.sort(function(a, b) {
        if (
            a.before.indexOf('all') != -1 ||
            a.before.indexOf(b.name) != -1 ||
            b.after.indexOf('all') != -1 ||
            b.after.indexOf(a.name) != -1
        ) {
            return -1;
        }

        if (
            a.after.indexOf('all') != -1 ||
            a.after.indexOf(b.name) != -1 ||
            b.before.indexOf('all') != -1 ||
            b.before.indexOf(a.name) != -1
        ) {
            return 1;
        }

        return 0;
    });

    callback(null, sources);
};


/**
 * Gets an array of sources as defined in .gitsources/ at HEAD
 */
lib.getSources = function(callback) {
    if (definedSources) {
        return callback(null, definedSources);
    }

    // 1) get deep list of files from .gitsources for HEAD
    app.git.exec(
        'ls-tree',
        {
            r: true, // recursive
        },
        [
            'HEAD', // tree

            // paths:
            '.gitsources'
        ],
        function(error, output) {
            if (error) {
                return callback(error);
            }

            // 2) parse array of file objects out of multiline output string
            var files = output.trim().split(/\n/).map(function(line) {
                line = line.split(/\s/);
                return {
                    mode: line[0],
                    type: line[1],
                    hash: line[2],
                    path: line[3]
                };
            });

            // 3) load contents of all .gitsources files and parse with ini package
            async.each(files, function(file, callback) {
                app.git.exec('show', [file.hash], function(error, data) {
                    if (error) {
                        return callback(error);
                    }

                    file.data = ini.parse(data);

                    callback(null);
                });
            }, function(error) {
                if (error) {
                    throw error;
                }

                // 4) compile sources from files
                var sources = [];

                files.forEach(function(file) {
                    var source = file.data.source;

                    if (source) {
                        source.name = file.path.substr(12);

                        source.before = source.before ? source.before.trim().split(/\s*,\s*/) : [];
                        source.after = source.after ? source.after.trim().split(/\s*,\s*/) : [];

                        if (!source.branch) {
                            source.branch = 'master';
                        }

                        sources.push(source);
                    }
                });

                // 5) sort sources
                lib.sortSources(sources, function(error, sortedSources) {
                    // save in lib cache
                    definedSources = sortedSources;

                    // 6) finish operation passing results to callback
                    callback(null, sortedSources);
                });
            });

        }
    );
};