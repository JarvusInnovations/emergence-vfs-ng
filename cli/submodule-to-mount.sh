#!/bin/bash

PACKAGE=$1

echo "Converting $PACKAGE"

git rm -r sencha-workspace/packages/$PACKAGE
echo -e "[source]\n    url = https://github.com/JarvusInnovations/$PACKAGE.git\n    branch = master" > .gitsources/$PACKAGE
echo -e "[mount]\n    sourcepath=/\n    mountpath=$PACKAGE" > sencha-workspace/packages/.gitmounts/$PACKAGE
git add .gitsources sencha-workspace/packages/.gitmounts