#!/usr/bin/env -S bash -euo pipefail

echo 'Installing dependencies'
yarn install

echo 'Copying vendor scripts'
vendor_dir='web-extension/vendor'
rm -r "${vendor_dir}"
mkdir -p "${vendor_dir}"
cp node_modules/openpgp/dist/openpgp.min.js "${vendor_dir}/openpgp.js"
cp node_modules/webextension-polyfill/dist/browser-polyfill.min.js "${vendor_dir}/browser-polyfill.js"
cp node_modules/js-md5/build/md5.min.js "${vendor_dir}/md5.js"

echo 'Writing manifest'
node src/manifest.js > web-extension/manifest.json

echo 'Building web extension'
yarn web-ext build

echo 'Done.'
