#!/usr/bin/env -S bash -euo pipefail

echo 'Copying vendor scripts'
cp node_modules/openpgp/dist/openpgp.js web-extension/vendor/

echo 'Building web extension'
yarn web-ext build

echo 'Done.'
