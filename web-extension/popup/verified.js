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
  console.log("verified popup update", { state, nextState });
  state = nextState;
  const nameEl = document.getElementById("AUTHOR_NAME");
  nameEl.textContent = state.name || "Anonymous";

  const emailEl = document.getElementById("AUTHOR_EMAIL");
  emailEl.textContent = state.email ? `<${state.email}>` : "";

  const commentEl = document.getElementById("AUTHOR_COMMENT");
  commentEl.textContent = state.comment || "";

  updateFingerprint();
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
subscribe(update);
