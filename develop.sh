#!/usr/bin/env -S bash -euo pipefail

echo
echo "Building"
./build.sh

echo
echo "Starting"
yarn web-ext run

echo
echo 'Done.'
