window.addEventListener("unload", () => {
  const matchers = [];
  for (const meta of document.head.querySelectorAll('meta[name="webverify"]')) {
    const content = meta.getAttribute("content");
    const parts = content.split(" ", 2);
    switch (parts.length) {
      case 2: {
        const [prefix, keyId] = parts;
        matchers.push({ prefix, keyId });
        break;
      }
      case 3: {
        const [prefix, date, keyId] = parts;
        matchers.push({ prefix, date, keyId });
        break;
      }
      default: {
        console.warn("[webverify] invalid content", { content });
      }
    }
  }
  browser.runtime.sendMessage({
    type: "UNLOAD_MATCHERS",
    payload: {
      matchers,
    },
  });
});
