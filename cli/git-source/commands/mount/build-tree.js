var app = require('../../mount'),
    lib = require('../../lib'),
    util = require('util'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    ini = require('ini');

module.exports = function(callback) {
    app.log.info('in `git mount build-tree`');

    async.auto({
        getSourcesMap: lib.getSourcesMap,
        getMounts: lib.getMounts,

        /**
         * Build up a map of all paths across all mounts.
         *
         * Is this step even useful for the build-tree operation or should we go directly to the composite tree built by compileTree?
         */
        mapTree: [
            'getSourcesMap',
            'getMounts',
            function(callback, results) {
                var sourcesMap = results.getSourcesMap,
                    tree = {};

                async.eachSeries(results.getMounts, function(mount, callback) {
                    var source = sourcesMap[mount.source],
                        quotedSourceRef = lib.shellQuote(source.branch + ':' + mount.sourcepath.substr(1)),
                        quotedMountPath = lib.shellQuote(mount.mountpath);

                    source.execGit(
                        'cat-file',
                        ['-t', quotedSourceRef],
                        function(error, sourceObjectType) {
                            if (error) {
                                return callback(error);
                            }

                            // TODO: apply excludes?
                            if (sourceObjectType == 'tree') {
                                source.execGit('ls-tree', { r: true }, quotedSourceRef, function(error, treeBlobs) {
                                    treeBlobs = treeBlobs.split(/\n/); // it would probably be better to stream through the output and never capture+split the whole thing

                                    var lineRe = /^([^ ]+) ([^ ]+) ([^\t]+)\t(.*)/,
                                        treeBlobsLength = treeBlobs.length,
                                        i = 0, treeBlob, path, treePathFiles;

                                    for (; i < treeBlobsLength; i++) {
                                        treeBlob = lineRe.exec(treeBlobs[i]);
                                        path = treeBlob[4];
                                        treePathFiles = tree[path];

                                        if (!treePathFiles) {
                                            treePathFiles = tree[path] = [];
                                        }

                                        treePathFiles.push({
                                            source: source,
                                            hash: treeBlob[3]
                                        });
                                    }

                                    callback();
                                });
                            } else if (sourceObjectType == 'blob') {
                                // automatically append filename if mount path is explicitly a directory
                                if (mount.mountpath.substr(-1) == '/') {
                                    quotedMountPath += lib.shellQuote(path.basename(mount.sourcepath));
                                }
                                app.log.warn('TODO: handle blob mount', quotedSourceRef);
                                //debugger;
                                callback();
                                // source.execGit(
                                //     'show',
                                //     [
                                //         quotedSourceRef,
                                //         '>', quotedMountPath
                                //     ],
                                // callback);
                            } else {
                                app.log.error();
                                callback(new Error('mount source must be blob or tree'));
                            }
                        }
                    );
                }, function(error) {
                    callback(error, tree);
                });
            }
        ],

        compileTree: [
            'mapTree',
            function(callback, results) {
                app.log.warn('TODO: compileTree');
                // TODO: build up a new tree from map where objects are trees and blobs are strings:
                /**
                 *  {
                 *      'php-classes': {
                 *          'Person.class.php': 'ABCDEF123...',
                 *          'Emergence': {
                 *              'People': {
                 *                  'Person.php': 'ABCDEF123...'
                 *              }
                 *          }
                 *      }
                 *  }
                 */

                callback();
            }
        ],

        writeTree: [
            'compileTree',
            function(callback, results) {
                app.log.warn('TODO: writeTree');
                // TODO: apply mktree recursively to compileTree output

                callback();
            }
        ]
    }, function(error, results) {
        if (error) {
            app.log.error('mount build-tree failed:', error);
            return callback(error, false);
        }
        var tree = results.mapTree,
            path, treePath;

        for (path in tree) {
            treePath = tree[path];
            console.log('%s\t%s\t%s', treePath.length, treePath.map(function(object) { return object.source.name; }).join(','), path);
        }

        app.log.info('mount build-tree finished');
        callback(null, true);
    });
};