let state = {};

/**
 * https://developers.cloudflare.com/1.1.1.1/dns-over-https/json-format
 */
const getAvatarBaseUrl = async (domain) => {
  try {
    const res = await fetch(
      `https://cloudflare-dns.com/dns-query?ct=application/dns-json&name=_avatars-sec._tcp.${domain}&type=SRV`
    );
    const { Answer: answers } = await res.json();
    return `https://${answers[0].name}/avatar/`;
  } catch {
    return "https://cdn.libravatar.org/avatar/";
  }
};

const getAvatarDataUrl = async (email) => {
  try {
    const [, domain] = email.split("@");
    const baseUrl = await getAvatarBaseUrl(domain);
    const hash = md5.hex(email.trim().toLowerCase());
    const remoteUrl = `${baseUrl}${hash}?d=404`;
    const dataUrl = await getImageDataUrl(remoteUrl);
    return dataUrl;
  } catch (error) {
    console.warn("failed to get avatar data url", error);
    return "";
  }
};

/**
 * https://wiki.libravatar.org/api/
 */
const getAvatarUrl = async (email) => {
  const storageKey = `avatars/${email}`;
  const { [storageKey]: cachedUrl } = await browser.storage.local.get(
    storageKey
  );
  if (typeof cachedUrl === "string") {
    return cachedUrl;
  }

  const dataUrl = await getAvatarDataUrl(email);
  browser.storage.local.set({ [storageKey]: dataUrl });
  return dataUrl;
};

const getImageDataUrl = async (src) => {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      context.drawImage(image, 0, 0);
      resolve(canvas.toDataURL("image/jpeg", 0.5));
    };
    image.onerror = (error) => reject(error);
    image.src = src;
  });
};

const updateFingerprint = () => {
  const { author: { fingerprint, keyId } = {} } = state;
  const fingerprintEl = document.getElementById("AUTHOR_FINGERPRINT");
  if (fingerprintEl.dataset.showFingerprint === "true") {
    fingerprintEl.textContent = fingerprint || "";
  } else {
    fingerprintEl.textContent = keyId || "";
  }
};

const getStatusKey = () => {
  const { author: { keyId } = {} } = state;
  return `publicKeyStatus/${keyId}`;
};

const updateStatusActions = async () => {
  const { tabId } = state;
  const statusKey = getStatusKey();
  const { [statusKey]: status } = await browser.storage.local.get(statusKey);
  const approveEl = document.getElementById("APPROVE");
  const rejectEl = document.getElementById("REJECT");
  const forgetEl = document.getElementById("FORGET");
  const statusEl = document.getElementById("AUTHOR_STATUS");
  if (status) {
    approveEl.style.display = "none";
    rejectEl.style.display = "none";
    forgetEl.style.display = "block";
    if (status === "APPROVED") {
      statusEl.textContent = "(Approved)";
      statusEl.classList.add("Status--success");
      statusEl.classList.remove("Status--danger");
      browser.pageAction.setIcon({
        tabId,
        path: "../icons/page-action-approved.svg",
      });
    } else {
      statusEl.textContent = "(Rejected)";
      statusEl.classList.add("Status--danger");
      statusEl.classList.remove("Status--success");
      browser.pageAction.setIcon({
        tabId,
        path: "../icons/page-action-rejected.svg",
      });
    }
  } else {
    approveEl.style.display = "block";
    rejectEl.style.display = "block";
    forgetEl.style.display = "none";
    statusEl.textContent = "";
    browser.pageAction.setIcon({
      tabId,
      path: "../icons/page-action-verified.svg",
    });
  }
};

const update = async (nextState) => {
  state = nextState;
  const { author: { name, email, comment } = {} } = state;

  const nameEl = document.getElementById("AUTHOR_NAME");
  nameEl.textContent = name || "???";

  const emailEl = document.getElementById("AUTHOR_EMAIL");
  emailEl.textContent = email ? `<${email}>` : "";
  emailEl.href = email ? `mailto:${email}` : "";

  const commentEl = document.getElementById("AUTHOR_COMMENT");
  commentEl.textContent = comment || "";

  updateFingerprint();
  updateStatusActions();

  if (email) {
    const avatarUrl = await getAvatarUrl(email);
    const avatarEl = document.getElementById("AUTHOR_AVATAR");
    avatarEl.src = avatarUrl;
  }
};

const prepare = () => {
  const fingerprintEl = document.getElementById("AUTHOR_FINGERPRINT");
  fingerprintEl.addEventListener("dblclick", (event) => {
    event.target.dataset.showFingerprint = `${
      event.target.dataset.showFingerprint === "false"
    }`;
    updateFingerprint();
  });

  const approveEl = document.getElementById("APPROVE");
  approveEl.addEventListener("click", async () => {
    await browser.storage.local.set({ [getStatusKey()]: "APPROVED" });
    updateStatusActions();
  });

  const rejectEl = document.getElementById("REJECT");
  rejectEl.addEventListener("click", async () => {
    await browser.storage.local.set({ [getStatusKey()]: "REJECTED" });
    updateStatusActions();
  });

  const forgetEl = document.getElementById("FORGET");
  forgetEl.addEventListener("click", async () => {
    await browser.storage.local.remove(getStatusKey());
    updateStatusActions();
  });
};

prepare();
subscribe(update);
