window.addEventListener("unload", () => {
  const matchers = [];
  for (const meta of document.head.querySelectorAll('meta[name="webverify"]')) {
    const [prefix, keyId] = meta.getAttribute("content").split(" ", 2);
    matchers.push({ prefix, keyId });
  }
  browser.runtime.sendMessage({
    type: "UNLOAD_MATCHERS",
    payload: {
      matchers,
    },
  });
});
