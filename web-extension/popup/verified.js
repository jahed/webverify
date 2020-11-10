const update = (state) => {
  const nameEl = document.getElementById("AUTHOR_NAME");
  nameEl.textContent = state.authorName || "Anonymous";

  const emailEl = document.getElementById("AUTHOR_EMAIL");
  emailEl.textContent = state.authorEmail ? `<${state.authorEmail}>` : "";

  const commentEl = document.getElementById("AUTHOR_COMMENT");
  commentEl.textContent = state.authorComment || "";
};

const subscribe = () => {
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

subscribe();
