let state = {};

const updateFingerprint = () => {
  const fingerprintEl = document.getElementById("AUTHOR_FINGERPRINT");
  if (fingerprintEl.dataset.showFingerprint === "true") {
    fingerprintEl.textContent = state.fingerprint || "";
  } else {
    fingerprintEl.textContent = state.keyId || "";
  }
};

const update = (nextState) => {
  state = nextState;
  console.log("verified popup", { state });
  const nameEl = document.getElementById("AUTHOR_NAME");
  nameEl.textContent = state.name || "Anonymous";

  const emailEl = document.getElementById("AUTHOR_EMAIL");
  emailEl.textContent = state.email ? `<${state.email}>` : "";

  const commentEl = document.getElementById("AUTHOR_COMMENT");
  commentEl.textContent = state.comment || "";

  updateFingerprint();
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

const prepare = () => {
  const fingerprintEl = document.getElementById("AUTHOR_FINGERPRINT");
  fingerprintEl.addEventListener("dblclick", (event) => {
    event.target.dataset.showFingerprint = `${
      event.target.dataset.showFingerprint === "false"
    }`;
    updateFingerprint();
  });
};

prepare();
subscribe();
