var app = require('flatiron').app,
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    ini = require('ini'),
    child_process = require('child_process'),

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

                            source.execGit = function(execOptions, command, options, args, callback) {
                                var execArgs = Array.prototype.slice.call(arguments);

                                if (typeof execOptions == 'string') {
                                    execOptions = {};
                                    execArgs.unshift(execOptions);
                                }

                                execOptions.git = execOptions.git || {};
                                execOptions.git['git-dir'] = source.gitDir;

                                return lib.execGit.apply(lib, execArgs);
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
            'getSourcesMap',
            'getMountFiles',
            function(callback, results) {
                var sourcesMap = results.getSourcesMap,
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
                            mount.mountpath = path.join(mountsBasePath, mount.mountpath);

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
 * @private
 * Get or create mktree cargo
 *
 * TODO: try to implement this using mktree's --batch option to handle multiple trees per process? Not clear how to match results to the callback for each task
 */
// var getMktreeCargo = function() {
//     return getMktreeCargo.cargo || (getMktreeCargo.cargo = async.cargo(function(treeContentPayload, callback) {
//         app.log.info('mktree', treeContentPayload);
//         //debugger;
//         callback(null, '123treehashhere');
//     }, 3));
// };

/**
 * @private
 * Get or create mktree queue
 */
var getMktreeQueue = function() {
    return getMktreeQueue.queue || (getMktreeQueue.queue = async.queue(function(treeContent, callback) {
        var mktree = lib.execGit({ spawn: true }, 'mktree'),
            output = '';

        mktree.stdout.on('data', function(data) {
            output += data;
        });

        mktree.stderr.on('data', function(data) {
            app.log.error('mktree:', data);
        });

        mktree.on('close', function(code) {
            callback(null, output.trim());
        });

        mktree.stdin.end(treeContent);
    }, 5));
};


/**
 * Write a tree to the objects db
 */
lib.writeTree = function(tree, callback) {
    var treeContent = '',
        mktreeQueue = getMktreeQueue();

    async.forEachOf(tree, function (object, objectName, callback) {
        if (typeof object == 'string') {
            treeContent += '100644 blob ' + object + '\t' + objectName + '\n';
            callback(null, object);
        } else {
            lib.writeTree(object, function(error, hash) {
                treeContent += '040000 tree ' + hash + '\t' + objectName + '\n';
                callback(null, hash);
            });
        }
    }, function(error) {
        mktreeQueue.push(treeContent, callback);
    });
};


/**
 * Convert an options object into CLI arguments string
 */
lib.cliOptionsToArgs = function(options) {
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

    return args;
};


/**
 * Execute git command and return trimmed output
 */
lib.execGit = function(execOptions, command, options, args, callback) {
    var execArgs = Array.prototype.slice.call(arguments),
        gitArgs = [];

    if (typeof execArgs[0] == 'object') {
        execOptions = execArgs.shift();
    } else {
        execOptions = {};
    }

    if (typeof execArgs[execArgs.length - 1] == 'function') {
        callback = execArgs.pop();
    } else {
        callback = null;
    }

    command = execArgs.shift();

    if (typeof command != 'string') {
        throw 'command required';
    }

    // git options must come first, before git command
    if (execOptions.git) {
        gitArgs.push.apply(gitArgs, lib.cliOptionsToArgs(execOptions.git));
    }

    // git command comes up next
    gitArgs.push(command);

    // append all remaining args
    // TODO: build args array instead, use push and push.apply. Join at end or pass independently to execFile
    while (execArgs.length) {
        args = execArgs.shift();

        switch (typeof args) {
            case 'number':
            case 'string':
                gitArgs.push(args.toString());
                break;
            case 'object':
                gitArgs.push.apply(gitArgs, Array.isArray(args) ? args : lib.cliOptionsToArgs(args));
                break;
            default:
                throw 'unhandled execGit argument'
        }
    }

    app.log.info('git', gitArgs.join(' '));

    if (execOptions.spawn) {
        if (typeof execOptions.spawn != 'object') {
            execOptions.spawn = {};
        }

        execOptions.spawn.shell = execOptions.shell;

        return child_process.spawn('git', gitArgs, execOptions.spawn);
    } else if(execOptions.shell) {
        return child_process.exec('git ' + gitArgs.join(' '), callback ? function (error, stdout, stderr) {
            gitArgs;
            callback(error, stdout.trim());
        } : null);
    } else {
        return child_process.execFile('git', gitArgs, callback ? function (error, stdout, stderr) {
            gitArgs;
            callback(error, stdout.trim());
        } : null);
    }
};


(function() {
    var doubleQuoteOrSpaceRe = /["\s]/,
        singleQuoteRe = /'/,
        anyQuoteOrSpaceRe = /["'\s]/,
        singleQuoteEscapablesRe = /(['\\])/g,
        doubleQuoteEscapablesRe = /(["\\$`!])/g,
        unquotedEscapablesRe = /([\\$`()!#&*|])/g;

    lib.shellQuote = function(arg) {
        if (typeof arg == 'string') {
            arg = [arg];
        }

        return arg.map(function(arg) {
            if (doubleQuoteOrSpaceRe.test(arg) && !singleQuoteRe.test(arg)) {
                return "'" + arg.replace(singleQuoteEscapablesRe, '\\$1') + "'";
            } else if (anyQuoteOrSpaceRe.test(arg)) {
                return '"' + arg.replace(doubleQuoteEscapablesRe, '\\$1') + '"';
            }

            return String(arg).replace(unquotedEscapablesRe, '\\$1');
        }).join(' ');
    };
})();