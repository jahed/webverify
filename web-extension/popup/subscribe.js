const subscribe = (update) => {
  const port = browser.runtime.connect({ name: "page-action-popup" });
  port.onMessage.addListener((message) => {
    switch (message.type) {
      case "UPDATE": {
        update(message.payload);
        return;
      }
      default: {
        console.warn("Unknown message", { message });
        return;
      }
    }
  });

  browser.tabs
    .query({ active: true, currentWindow: true })
    .then((tabs) => tabs[0].id)
    .then((tabId) => {
      port.postMessage({
        type: "SUBSCRIBE",
        payload: { tabId },
      });
    });
};
