#!/usr/bin/env -S bash -euo pipefail

echo
echo "Bumping"
yarn version

echo
echo "Building"
./build.sh

echo
echo "Linting"
yarn web-ext lint

echo
echo "Signing"
./sign.sh

echo
echo "Pushing"
git push --follow-tags

echo
echo 'Done.'
