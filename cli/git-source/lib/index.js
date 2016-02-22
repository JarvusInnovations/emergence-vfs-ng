var app = require('../app'),
    path = require('path'),
    async = require('async'),
    ini = require('ini'),
    exec = require('child_process').exec,

    // container for exported library
    lib = module.exports = {},

    // internal caches
    cachedSources,
    cachedSourcesMap;


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
    if (cachedSources) {
        return callback(null, cachedSources);
    }

    // 1) get deep list of files from .gitsources for HEAD
    lib.execGit(
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
            var files = output.split(/\n/).map(function(line) {
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
                lib.execGit('show', file.hash, function(error, data) {
                    if (error) {
                        return callback(error);
                    }

                    file.data = ini.parse(data);

                    callback(null);
                });
            }, function(error) {
                if (error) {
                    return callback(error);
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

                        source.gitDir = path.join(app.config.get('GIT_DIR'), 'sources', source.name);

                        source.execGit = function(command, options, args, callback) {
                            lib.execGitForSource(source, command, options, args, callback);
                        };

                        sources.push(source);
                    }
                });

                // 5) sort sources
                lib.sortSources(sources, function(error, sortedSources) {
                    // save in lib cache
                    cachedSources = sortedSources;

                    // 6) finish operation passing results to callback
                    callback(null, sortedSources);
                });
            });

        }
    );
};


/**
 * Get object mapping sources to their names
 */
lib.getSourcesMap = function(callback) {
    if (cachedSourcesMap) {
        return callback(null, cachedSourcesMap);
    }

    lib.getSources(function(error, sources) {
        if (error) {
            return callback(error);
        }

        var sourcesMap = {},
            sourcesLength = sources.length,
            i = 0, source;

        for (; i < sourcesLength; i++) {
            source = sources[i];
            sourcesMap[source.name] = source;
        }

        cachedSourcesMap = sourcesMap;
        callback(null, sourcesMap)
    });
};


/**
 * Convert an options object into CLI arguments string
 */
lib.cliOptionsToString = function(options) {
    var args = [],
        k, val;

    for (k in options) {
        val = options[k];

        if (k.length == 1) {
            if (val === true) {
                args.push('-'+k);
            } else if (val !== false) {
                args.push('-'+k+' '+val);
            }
        } else {
            if (val === true) {
                args.push('--'+k);
            } else if (val !== false) {
                args.push('--'+k+'='+val);
            }
        }
    }

    return args.join(' ');
};

/**
 * Execute git command and return trimmed output
 */
lib.execGit = function(command, options, args, callback) {
    callback = arguments[arguments.length - 1];

    switch (arguments.length) {
        case 1:
            throw 'command and callback required';
        case 2:
            // only minimum command and callback porvided
            options = {};
            args = [];
            break;
        case 3:
            // middle one is args or options
            if (Array.isArray(options) || typeof options == 'string') {
                args = options;
                options = {};
            } else {
                args = [];
            }
            break;
    }

    // prefix command with git and gitOptions
    if (options._git) {
        command = lib.cliOptionsToString(options._git) +  ' ' + command;
    }

    command = 'git ' + command;

    // append options
    command += ' ' + lib.cliOptionsToString(options);

    // append arguments
    command += ' ' + (typeof args == 'string' ? args : args.join(' '));

    exec(command, function (error, stdout, stderr) {
        callback(error, stdout ? stdout.trim() : null);
    });
};

/**
 * Execute git command and return trimmed output for a given source
 */
lib.execGitForSource = function(source, command, options, args, callback) {
    callback = arguments[arguments.length - 1];

    switch (arguments.length) {
        case 1:
            throw 'command and callback required';
        case 2:
            // only minimum command and callback porvided
            options = {};
            args = [];
            break;
        case 3:
            // middle one is args or options
            if (Array.isArray(options) || typeof options == 'string') {
                args = options;
                options = {};
            } else {
                args = [];
            }
            break;
    }

    options._git = options._git || {};
    options._git['git-dir'] = source.gitDir;

    lib.execGit(command, options, args, callback);
};