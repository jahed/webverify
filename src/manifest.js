const packageJson = require("../package.json");

const manifest = {
  manifest_version: 2,
  name: "WebVerify",
  version: packageJson.version,
  author: packageJson.author,
  homepage_url: packageJson.homepage,
  description: packageJson.description,
  icons: {
    48: "icons/icon.svg",
    96: "icons/icon.svg",
  },
  permissions: [
    "<all_urls>",
    "webRequest",
    "webNavigation",
    "webRequestBlocking",
    "storage",
  ],
  background: {
    scripts: [
      "vendor/browser-polyfill.js",
      "vendor/openpgp.js",
      "scripts/background.js",
    ],
  },
  content_scripts: [
    {
      matches: ["<all_urls>"],
      js: ["vendor/browser-polyfill.js", "scripts/content.js"],
    },
  ],
  page_action: {
    default_icon: "icons/page-action-verified.svg",
    default_title: "WebVerify",
    show_matches: ["<all_urls>"],
  },
  browser_specific_settings: {
    gecko: {
      id: "webverify@jahed.dev",
    },
  },
};

console.log(JSON.stringify(manifest, null, 2));
