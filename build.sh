#!/usr/bin/env -S bash -euo pipefail

echo 'Copying vendor scripts'
vendor_dir='web-extension/vendor/'
mkdir -p "${vendor_dir}"
cp node_modules/openpgp/dist/openpgp.js "${vendor_dir}"
cp node_modules/webextension-polyfill/dist/browser-polyfill.js "${vendor_dir}"

echo 'Building web extension'
yarn web-ext build

echo 'Done.'
