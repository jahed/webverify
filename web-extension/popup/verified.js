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
  const fingerprintEl = document.getElementById("AUTHOR_FINGERPRINT");
  if (fingerprintEl.dataset.showFingerprint === "true") {
    fingerprintEl.textContent = state.fingerprint || "";
  } else {
    fingerprintEl.textContent = state.keyId || "";
  }
};

const update = async (nextState) => {
  state = nextState;
  const nameEl = document.getElementById("AUTHOR_NAME");
  nameEl.textContent = state.name || "Anonymous";

  const emailEl = document.getElementById("AUTHOR_EMAIL");
  emailEl.textContent = state.email ? `<${state.email}>` : "";

  const commentEl = document.getElementById("AUTHOR_COMMENT");
  commentEl.textContent = state.comment || "";

  updateFingerprint();

  if (state.email) {
    const avatarUrl = await getAvatarUrl(state.email);
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
};

prepare();
subscribe(update);
