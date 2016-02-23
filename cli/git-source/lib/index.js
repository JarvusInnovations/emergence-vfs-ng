var path = require('path'),
    fs = require('fs'),
    async = require('async'),
    ini = require('ini'),
    exec = require('child_process').exec,

    // container for exported library
    lib = module.exports = {},

    // internal caches
    cachedGitDir,
    cachedWorkTree,
    cachedSources,
    cachedSourcesMap,
    cachedSourcesOrder;


/**
 * Gets complete path to git directory
 */
lib.getGitDir = function(callback) {
    if (cachedGitDir) {
        return callback(null, cachedGitDir);
    }

    lib.execGit('rev-parse', { 'git-dir': true }, function(error, output) {
        if (error) {
            return callback(error);
        }

        fs.realpath(output, function(error, resolvedPath) {
            if (error) {
                return callback(error);
            }

            cachedGitDir = resolvedPath;

            callback(null, cachedGitDir);
        });
    });
};


/**
 * Gets complete path to working tree
 */
lib.getWorkTree = function(callback) {
    if (cachedWorkTree) {
        return callback(null, cachedWorkTree);
    }

    lib.execGit('rev-parse', { 'show-toplevel': true }, function(error, output) {
        if (error) {
            return callback(error);
        }

        fs.realpath(output, function(error, resolvedPath) {
            if (error) {
                return callback(error);
            }

            cachedWorkTree = resolvedPath;

            callback(null, cachedWorkTree);
        });
    });
};


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
                lib.getGitDir(function(error, gitDir) {
                    if (error) {
                        return callback(error);
                    }

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

                            source.gitDir = path.join(gitDir, 'sources', source.name);

                            source.execGit = function(command, options, args, callback) {
                                var execArgs = Array.prototype.slice.call(arguments);
                                execArgs.unshift(source);
                                lib.execGitForSource.apply(lib, execArgs);
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
 * Get list of sources in sorted order
 */
lib.getSourcesOrder = function(callback) {
    if (cachedSourcesOrder) {
        return callback(null, cachedSourcesOrder);
    }

    lib.getSources(function(error, sources) {
        if (error) {
            return callback(error);
        }

        var sourcesOrder = [],
            sourcesLength = sources.length,
            i = 0;

        for (; i < sourcesLength; i++) {
            sourcesOrder.push(sources[i].name);
        }

        cachedSourcesOrder = sourcesOrder;
        callback(null, sourcesOrder)
    });
};


/**
 * Sorts an array of mounts by their sources
 */
lib.sortMounts = function(mounts, callback) {
    mounts = mounts.concat(); // clone array to avoid modifying input

    lib.getSourcesOrder(function(error, sourcesOrder) {
        if (error) {
            return callback(error);
        }

        mounts.sort(function(a, b) {
            a = sourcesOrder.indexOf(a.source);
            b = sourcesOrder.indexOf(b.source);

            if (a == b) {
                return 0;
            }

            return a < b ? -1 : 1;
        });

        callback(null, mounts);
    });
};


/**
 * Gets an array of sources as defined in .gitsources/ at HEAD
 */
lib.getMounts = function(callback) {
    async.auto({
        getWorkTree: lib.getWorkTree,
        getSourcesMap: lib.getSourcesMap,

        getMountFiles: [
            'getWorkTree',
            function(callback, results) {
                var workTree = results.getWorkTree;

                lib.execGit(
                    'ls-files',
                    {
                        'full-name': true, // all paths relative to work tree root
                        'stage': true // include SHA1 in output
                    },
                    [
                        // prepend full path to working tree to prevent impact of CWD
                        workTree + '/.gitmounts/',
                        workTree + '/*/.gitmounts/*'
                    ],
                    function(error, output) {
                        if (error) {
                            return callback(error);
                        }

                        callback(null, output.split(/\n/).map(function(line) {
                            line = line.split(/\s/);
                            return {
                                mode: line[0],
                                hash: line[1],
                                stage: line[2],
                                path: line[3]
                            };
                        }));
                    }
                );
            }
        ],

        parseMounts: [
            'getWorkTree',
            'getSourcesMap',
            'getMountFiles',
            function(callback, results) {
                var workTree = results.getWorkTree,
                    sourcesMap = results.getSourcesMap,
                    files = results.getMountFiles,
                    mountSectionRe = /^mount\b/,
                    mounts = [];

                async.each(files, function(file, callback) {
                    lib.execGit('show', file.hash, function(error, data) {
                        if (error) {
                            return callback(error);
                        }

                        var mountsBasePath = path.dirname(file.path).replace(/(^|\/)\.gitmounts(\/|$)/, '$1'),
                            fileBaseName = path.basename(file.path),
                            section, mount;

                        file.data = ini.parse(data);

                        for (section in file.data) {
                            if (!mountSectionRe.test(section)) {
                                continue;
                            }

                            mount = file.data[section];
                            mount.name = section.length > 5 ? section.substr(5).trim() : fileBaseName; // TODO: make names unique?
                            mount.source = mount.source || fileBaseName;

                            mount.mountpath = mount.mountpath || mount.path || './';
                            mount.mountpath = path.join(workTree, mountsBasePath, mount.mountpath);

                            mount.sourcepath = mount.sourcepath || mount.path || './';
                            mount.sourcepath = mount.sourcepath[0] == '/' ? path.join(mount.sourcepath) : path.join('/', mountsBasePath, mount.sourcepath);

                            delete mount.path;

                            if (!(mount.source in sourcesMap)) {
                                return callback(new Error('undefined source "' + mount.source + '" in ' + file.path));
                            }

                            mounts.push(mount);
                        }

                        callback(null);
                    });
                }, function(error) {
                    if (error) {
                        return callback(error);
                    }

                    callback(null, mounts);
                });
            }
        ],

        sortMounts: [
            'parseMounts',
            function(callback, results) {
                lib.sortMounts(results.parseMounts, callback);
            }
        ]
    }, function(error, results) {
        if (error) {
            return callback(error);
        }

        callback(null, results.sortMounts);
    });
};


/**
 * Convert an options object into CLI arguments string
 */
lib.cliOptionsToString = function(options) {
    var args = [],
        k, val;

    for (k in options) {
        if (k[0] == '_') {
            continue;
        }

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
        case 2:
            throw 'source, command, callback required';
        case 3:
            // only minimum command and callback porvided
            options = {};
            args = [];
            break;
        case 4:
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