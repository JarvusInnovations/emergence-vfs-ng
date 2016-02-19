# Providing a git command

`git mycommand` can be implemented by creating a script called `git-mycommand` in the user's path. For an npm
package, this means adding something like this to `package.json`:

```
  "bin": {
    "git-mycommand": "./mycommand.js"
  }
```

If the `--git-dir` or `--work-tree` options are provided to the git command when invoking your command, git will
pass these on to your script via environment variables, because [git loves the enivorment](https://git-scm.com/blog/2010/04/11/environment.html)
and your command should too:

```javascript
console.log("Git directory:", process.env.GIT_DIR);
console.log("Working tree:", process.env.GIT_WORK_TREE);
```

```
$ git --git-dir=./Repositories/my-repository/.git --work-tree=./Repositories/my-repository mycommand
Git directory: ./Repositories/my-repository/.git
Working tree: ./Repositories/my-repository
```

These environment variables should be passed down to any git commands you invoke automatically so you shouldn't have to
worry about them, unless you're building paths to any of these things yourself. A more robust way to get the git
directory path or working tree path would be to ask git via shell, which will consider both environment variables
and following all the rules git can be made to follow for automatically detected them:

```javascript
var shell = require('shelljs');
console.log("Git directory:", shell.exec('git rev-parse --git-dir', {silent:true}).stdout.trim());
console.log("Working tree:", shell.exec('git rev-parse --show-toplevel', {silent:true}).stdout.trim());
```