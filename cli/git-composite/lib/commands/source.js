var app = require('../../app'),
    fs = require('fs'),
    async = require('async'),
    ini = require('ini');

module.exports = function(command, source, callback) {
    if (!command) {
        app.log.error('command required');
        return callback(new Error('command required'));
    }

    if (command == 'sort') {
        app.git.exec(
            'ls-tree',
            {
                r: true, // recursive
            },
            [
                'master', // tree

                // paths:
                '.gitsources'
            ],
            function(error, output) {
                if (error) {
                    return callback(error);
                }

                var files = output.trim().split(/\n/).map(function(line) {
                        line = line.split(/\s/);
                        return {
                            mode: line[0],
                            type: line[1],
                            hash: line[2],
                            path: line[3]
                        };
                    });

                // TODO: more async
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

                    var sources = [];

                    files.forEach(function(file) {
                        if (file.data.source) {
                            file.data.source.name = file.path.substr(12);
                            sources.push(file.data.source);
                        }
                    });

                    sources.sort(function(a, b) {
                        if (a.before == 'all' || a.before == b.name) {
                            return -1;
                        }

                        if (a.after == 'all' || a.after == b.name) {
                            return 1;
                        }

                        return 0;
                    });

                    console.log(sources.map(function(source) {
                        return source.name;
                    }).join('\n'));

                    callback();
                });

            }
        );
    } else {
        app.log.error("Unknown command %s", command);
        callback();
    }
};