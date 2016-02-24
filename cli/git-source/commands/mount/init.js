var app = require('../../mount'),
    lib = require('../../lib'),
    util = require('util'),
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
            'verifyWorkTreeClean',
            lib.getMounts
        ],

        writeMounts: [
            'getSourcesMap',
            'getMounts',
            'verifyWorkTreeClean',
            // 'verifyWorkTreeEmpty',
            function(callback, results) {
                var sourcesMap = results.getSourcesMap;

                async.eachSeries(results.getMounts, function(mount, callback) {
                    var source = sourcesMap[mount.source],
                        quotedSourceRef = lib.shellQuote(source.branch + ':' + mount.sourcepath.substr(1)),
                        quotedMountPath = lib.shellQuote(mount.mountpath);

                    source.execGit(
                        'cat-file',
                        ['-t', quotedSourceRef],
                        function(error, output) {
                            if (error) {
                                return callback(error);
                            }

                            // TODO: apply excludes?
                            if (output == 'tree') {
                                source.execGit(
                                    'archive',
                                    [
                                        quotedSourceRef,
                                        '|', util.format('(mkdir -p %s && tar -xC %s)', quotedMountPath, quotedMountPath)
                                    ],
                                callback);
                            } else if (output == 'blob') {
                                // automatically append filename if mount path is explicitly a directory
                                if (mount.mountpath.substr(-1) == '/') {
                                    quotedMountPath += lib.shellQuote(path.basename(mount.sourcepath));
                                }

                                source.execGit(
                                    'show',
                                    [
                                        quotedSourceRef,
                                        '>', quotedMountPath
                                    ],
                                callback);
                            } else {
                                app.log.error();
                                callback(new Error('mount source must be blob or tree'));
                            }
                        }
                    );
                }, callback);
            }
        ]
    }, function(error, results) {
        if (error) {
            app.log.error('mount init failed:', error);
            return callback(error, false);
        }

        app.log.info('mount init finished');
        callback(null, true);
    });
};