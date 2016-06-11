var app = require('../../server'),
    lib = require('../../lib'),

    http = require('http'),
    spawn = require('child_process').spawn,
    path = require('path'),
    backend = require('git-http-backend');

module.exports = function(callback) {
    app.log.info('starting server...');

    var server = http.createServer(function (req, res) {
        app.log.info('receiving request', req.method, req.url);

        var repo = req.url.split('/')[1];
        var dir = path.join(process.cwd(), repo);

        req.pipe(backend(req.url, function (err, service) {
            if (err) return res.end(err + '\n');

            res.setHeader('content-type', service.type);

            app.log.info('\taction:', service.action, repo, service.fields);

            app.log.info('\tspawing', service.cmd, service.args.concat(dir).join(' '));
            var ps = spawn(service.cmd, service.args.concat(dir));
            ps.stdout.pipe(service.createStream()).pipe(ps.stdin);

        })).pipe(res);
    });
    server.listen(5000);

    callback();
};

