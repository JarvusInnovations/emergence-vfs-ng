var app = require('../../mount'),
    lib = require('../../lib'),
    async = require('async'),
    fs = require('fs');

module.exports = function(callback) {
    app.log.info('in `git mount init`');

    async.auto({
        getWorkTree: lib.getWorkTree,
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

        // TODO: remove this once composite tree is being built in git so git can handle getting rid of old content
        verifyWorkTreeEmpty: [
            'getWorkTree',
            function(callback, results) {
                fs.readdir(results.getWorkTree, function(error, files) {
                    if (error) {
                        return callback(error);
                    }

                    var gitFileRe = /^\.git[^\.]*$/;
                    files = files.filter(function(file) {
                        return !gitFileRe.test(file);
                    });

                    if (files.length) {
                        app.log.error('Working tree has content. Current implementation only supports starting from an empty tree');
                        return callback(new Error('working tree has content'), false);
                    }

                    callback(null, true);
                });
            }
        ],
        getMounts: [
            'verifyWorkTreeClean',
            function(callback) {
                app.log.info('getMounts');
                callback(null, [{mount: 1}, {mount: 2}]);
            }
        ],
        writeMounts: [
            'getWorkTree',
            'getMounts',
            'verifyWorkTreeClean',
            'verifyWorkTreeEmpty',
            function(callback, results) {
                app.log.info('writeMounts', results.getMounts);
                callback(null, 'ABCDEF0123456789');
            }
        ]
    }, function(error, results) {
        app.log.info('mount init finished, results:', results);
        callback(error);
    });
};