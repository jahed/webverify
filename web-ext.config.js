const path = require("path");

module.exports = {
  sourceDir: path.resolve(__dirname, "web-extension"),
  artifactsDir: path.resolve(__dirname, "build"),
  build: {
    overwriteDest: true,
  },
  run: {
    firefoxProfile: "web-ext",
  },
};
