var app = require('../../source'),
    path = require('path'),
    fs = require('fs'),
    async = require('async'),
    lib = require('../../lib');

module.exports = function(callback) {

    // 1) get keyed collection of sources
    lib.getSourcesMap(function(error, sourcesMap) {
        if (error) {
            return callback(error);
        }

        async.series([

            // 2) ensure each is initialized as a git repository
            function(callback) {
                async.each(sourcesMap, function(source, callback) {
                    lib.execGit('init', { bare: true }, source.gitDir, function(error, output) {
                        if (error) {
                            return callback(error);
                        }

                        app.log.info('git:', output);

                        callback();
                    });
                }, callback);
            },

            // 3) add sources to alternates file for objects
            function(callback) {
                lib.getGitDir(function(error, gitDir) {
                    if (error) {
                        return callback(error);
                    }

                    var alternatesFilePath = path.join(gitDir, 'objects/info/alternates'),
                        neededLines = Object.keys(sourcesMap).map(function(sourceName) {
                            return '../sources/' + sourceName + '/objects';
                        });

                    fs.readFile(alternatesFilePath, 'utf8', function(error, alternatesFileContents) {
                        var isSourceRe = /^\.\.\/sources\/.+\/objects$/,
                            alternatesFileLines = alternatesFileContents ? alternatesFileContents.trim().split(/\n/) : [],
                            alternatesFileLinesLength = alternatesFileLines.length,
                            i, line, neededIndex,
                            neededLinesLength,
                            linesToWrite = [],
                            contentsToWrite;

                        for (i = 0; i < alternatesFileLinesLength; i++) {
                            line = alternatesFileLines[i];
                            neededIndex = neededLines.indexOf(line);

                            // keep lines that match a needed one or don't look like one added by git-source
                            if (neededIndex != -1 || !isSourceRe.test(line)) {
                                linesToWrite.push(line);

                                // remove matched line from needed lines
                                if (neededIndex != -1) {
                                    neededLines.splice(neededIndex, 1);
                                }
                            }
                        }

                        neededLinesLength = neededLines.length;
                        for (i = 0; i < neededLinesLength; i++) {
                            linesToWrite.push(neededLines[i]);
                        }

                        contentsToWrite = linesToWrite.join('\n') + '\n';

                        if (contentsToWrite == alternatesFileContents) {
                            return callback();
                        }

                        app.log.info('Updating source object paths in', alternatesFilePath);
                        fs.writeFile(alternatesFilePath, contentsToWrite, 'utf8', callback);
                    });
                });
            },

            // 4) ensure origin is set to correct url
            function(callback) {
                async.each(sourcesMap, function(source, callback) {
                    source.execGit('remote', function(error, remoteOutput) {
                        if (error) {
                            return callback(error);
                        }

                        if (remoteOutput && remoteOutput.split('\n').indexOf('origin') != -1) {
                            app.log.info('Updating origin for', source.name, 'to', source.url);
                            source.execGit('remote set-url', ['origin', source.url], callback);
                        } else {
                            app.log.info('Adding origin for', source.name, 'to', source.url);
                            source.execGit('remote add', ['origin', source.url], callback);
                        }
                    });
                }, callback);
            },

            // 5) fetch needed branch for each source
            function(callback) {
                async.each(sourcesMap, function(source, callback) {
                    app.log.info('Fetching', source.branch, 'for', source.name);
                    source.execGit('fetch', ['origin', source.branch], callback);
                }, callback);
            }

        ], callback);

    });
};