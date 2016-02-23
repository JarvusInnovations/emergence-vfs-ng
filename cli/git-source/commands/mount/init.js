var app = require('../../mount'),
    lib = require('../../lib'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    ini = require('ini');

module.exports = function(callback) {
    app.log.info('in `git mount init`');

    async.auto({
        getWorkTree: lib.getWorkTree,
        getSourcesMap: lib.getSourcesMap,

        verifyWorkTreeClean: function(callback, results) {
            lib.execGit('status', { porcelain: true }, function(error, output) {
                if (error) {
                    return callback(error);
                }

                // any output means working tree is dirty
                if (output) {
                    app.log.error('Working tree is dirty. Commit, stash, or reset changes before proceeding.');
                    return callback(new Error('working tree is dirty'), false);
                }

                callback(null, true);
            });
        },

        // // TODO: remove this once composite tree is being built in git so git can handle getting rid of old content
        // verifyWorkTreeEmpty: [
        //     'getWorkTree',
        //     function(callback, results) {
        //         fs.readdir(results.getWorkTree, function(error, files) {
        //             if (error) {
        //                 return callback(error);
        //             }

        //             var gitFileRe = /^\.git[^\.]*$/;
        //             files = files.filter(function(file) {
        //                 return !gitFileRe.test(file);
        //             });

        //             if (files.length) {
        //                 app.log.error('Working tree has content. Current implementation only supports starting from an empty tree');
        //                 return callback(new Error('working tree has content'), false);
        //             }

        //             callback(null, true);
        //         });
        //     }
        // ],

        getMounts: [
            'getWorkTree',
            'getSourcesMap',
            'verifyWorkTreeClean',
            function(callback, results) {
                var workTree = results.getWorkTree,
                    sourcesMap = results.getSourcesMap;

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

                        var mounts = [],
                            mountSectionRe = /^mount\b/,
                            files = output.split(/\n/).map(function(line) {
                                line = line.split(/\s/);
                                return {
                                    mode: line[0],
                                    hash: line[1],
                                    stage: line[2],
                                    path: line[3]
                                };
                            });

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
                                        app.log.error('Undefined source "%s" in %s', mount.source, file.path);
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

                            lib.sortMounts(mounts, callback);
                        });
                    }
                );
            }
        ],

        writeMounts: [
            'getWorkTree',
            'getMounts',
            'verifyWorkTreeClean',
            // 'verifyWorkTreeEmpty',
            function(callback, results) {
                app.log.info('writeMounts');
                callback(null, 'ABCDEF0123456789');
            }
        ]
    }, function(error, results) {
        app.log.info('mount init finished');
        callback(error);
    });
};