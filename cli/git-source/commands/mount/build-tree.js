var app = require('../../mount'),
    lib = require('../../lib'),
    util = require('util'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    ini = require('ini'),
    regExpQuote = require('regexp-quote');

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
        getPathLayers: [
            'getSourcesMap',
            'getMounts',
            function(callback, results) {
                var sourcesMap = results.getSourcesMap,
                    pathLayers = {};

                async.eachSeries(results.getMounts, function(mount, callback) {
                    var source = sourcesMap[mount.source],
                        quotedSourceRef = lib.shellQuote(source.branch + ':' + mount.sourcepath.substr(1));

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
                                        i = 0, treeBlob, mountPath, mountPathLayers;

                                    for (; i < treeBlobsLength; i++) {
                                        treeBlob = lineRe.exec(treeBlobs[i]);
                                        mountPath = path.join(mount.mountpath, treeBlob[4]);

                                        // get layers array for path
                                        mountPathLayers = pathLayers[mountPath];
                                        if (!mountPathLayers) {
                                            mountPathLayers = pathLayers[mountPath] = [];
                                        }

                                        // push layer for this source
                                        mountPathLayers.push({
                                            source: source,
                                            hash: treeBlob[3]
                                        });
                                    }

                                    callback();
                                });
                            } else if (sourceObjectType == 'blob') {
                                source.execGit('ls-tree', lib.shellQuote(source.branch + ':' + path.dirname(mount.sourcepath.substr(1))), function(error, treeBlobs) {
                                    var blobName = path.basename(mount.sourcepath),
                                        blobMatch = (new RegExp('[^ ]+ blob ([^\t]+)\t' + regExpQuote(blobName))).exec(treeBlobs),
                                        mountPath = mount.mountpath,
                                        mountPathLayers;

                                    if (!blobMatch) {
                                        return callback(new Error('mount source not found: ' + mount.sourcepath));
                                    }

                                    // automatically append filename if mount path is explicitly a directory
                                    if (mountPath.substr(-1) == '/') {
                                        mountPath += blobName;
                                    }

                                    // get layers array for path
                                    mountPathLayers = pathLayers[mountPath];
                                    if (!mountPathLayers) {
                                        mountPathLayers = pathLayers[mountPath] = [];
                                    }

                                        // push layer for this source
                                    mountPathLayers.push({
                                        source: source,
                                        hash: blobMatch[1]
                                    });

                                    callback();
                                });
                            } else {
                                app.log.error();
                                callback(new Error('mount source must be blob or tree: ' + quotedSourceRef));
                            }
                        }
                    );
                }, function(error) {
                    callback(error, pathLayers);
                });
            }
        ],

        compileTree: [
            'getPathLayers',
            function(callback, results) {
                var pathLayers = results.getPathLayers,
                    mountPath, mountPathLayers,
                    rootTree = {},
                    parentTree, slashIndex, pathParentIndex, treeName, tree;

                for (mountPath in pathLayers) {
                    mountPathLayers = pathLayers[mountPath];
                    parentTree = rootTree;
                    pathParentIndex = 0;

                    while ((slashIndex = mountPath.indexOf('/', pathParentIndex)) > 0) {
                        treeName = mountPath.substring(pathParentIndex, slashIndex);

                        tree = parentTree[treeName];
                        if (!tree) {
                            tree = parentTree[treeName] = {};
                        }

                        parentTree = tree;
                        pathParentIndex = slashIndex + 1;
                    }

                    // set last source in array as version
                    parentTree[mountPath.substring(pathParentIndex)] = mountPathLayers[mountPathLayers.length - 1].hash;
                }

                callback(null, rootTree);
            }
        ],

        writeTree: [
            'compileTree',
            function(callback, results) {
                var rootTree = results.compileTree;
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