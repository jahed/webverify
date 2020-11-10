const getPublicKeys = async (keyId) => {
  const storageKey = `keyId/${keyId}`;
  let { [storageKey]: publicKeyArmored } = await browser.storage.local.get(
    storageKey
  );

  if (!publicKeyArmored) {
    console.warn("looking up key using hkp");
    const hkp = new openpgp.HKP("https://keys.openpgp.org");
    publicKeyArmored = await hkp.lookup({ keyId });

    await browser.storage.local.set({ [storageKey]: publicKeyArmored });
  }

  const { keys } = await openpgp.key.readArmored(publicKeyArmored);
  return keys;
};

const parseFingerprint = (fingerprint) => {
  return openpgp.util.Uint8Array_to_hex(fingerprint).toUpperCase();
};

const parseKeyId = (keyId) => {
  return keyId.toHex().toUpperCase();
};

const getSignature = async (signatureUrl) => {
  const res = await fetch(signatureUrl);
  const armoredSignature = await res.text();
  return await openpgp.signature.readArmored(armoredSignature);
};

const verifySignature = async (signatureUrl, content) => {
  const message = openpgp.message.fromText(content);
  const signature = await getSignature(signatureUrl);
  const keyId = parseKeyId(signature.packets[0].issuerKeyId);
  const publicKeys = await getPublicKeys(keyId);
  const verified = await openpgp.verify({ message, signature, publicKeys });
  const { error } = verified.signatures[0];
  if (error) {
    throw error;
  }
  return publicKeys[0];
};

const STATE_APPROVED_ID = "APPROVED";
const STATE_BLOCKED_ID = "BLOCKED";
const STATE_VERIFIED_ID = "VERIFIED";
const STATE_FAILURE_ID = "FAILURE";
const STATE_UNVERIFIED_ID = "UNVERIFIED";
const STATE_CACHE_MISS_ID = "CACHE_MISS";
const STATE_UNSUPPORTED_BROWSER_ID = "UNSUPPORTED_BROWSER";

const State = {
  [STATE_APPROVED_ID]: {
    id: STATE_APPROVED_ID,
    title: "Author approved",
    icon: "icons/page-action-approved.svg",
    popup: "popup/approved.html",
  },
  [STATE_BLOCKED_ID]: {
    id: STATE_BLOCKED_ID,
    title: "Author blocked",
    icon: "icons/page-action-blocked.svg",
    popup: "popup/blocked.html",
  },
  [STATE_VERIFIED_ID]: {
    id: STATE_VERIFIED_ID,
    title: "Page is verified",
    icon: "icons/page-action-verified.svg",
    popup: "popup/verified.html",
  },
  [STATE_FAILURE_ID]: {
    id: STATE_FAILURE_ID,
    title: "Page verification failed.",
    icon: "icons/page-action-failure.svg",
    popup: "popup/failure.html",
  },
  [STATE_UNVERIFIED_ID]: {
    id: STATE_UNVERIFIED_ID,
    title: "Page is not verified",
    icon: "icons/page-action-unverified.svg",
    popup: "popup/unverified.html",
  },
  [STATE_CACHE_MISS_ID]: {
    id: STATE_CACHE_MISS_ID,
    title: "Page cannot be verified",
    icon: "icons/page-action-unverified.svg",
    popup: "popup/cache-miss.html",
  },
  [STATE_UNSUPPORTED_BROWSER_ID]: {
    id: STATE_UNSUPPORTED_BROWSER_ID,
    title: "Browser cannot verify this page.",
    icon: "icons/page-action-unverified.svg",
    popup: "popup/unsupported-browser.html",
  },
};

const popupStateByTabId = new Map();

const getPopupStateForTabId = (tabId) => {
  let state = popupStateByTabId.get(tabId);
  if (!state) {
    state = {};
    popupStateByTabId.set(tabId, state);
  }
  return state;
};
const setPopupStateForTabId = (tabId, state) => {
  popupStateByTabId.set(tabId, state);
};

browser.tabs.onRemoved.addListener((tabId) => {
  popupStateByTabId.delete(tabId);
});

const updatePageAction = ({
  tabId,
  stateId = "unknown",
  publicKey,
  errorMessage,
}) => {
  const { title, icon, popup } = State[stateId];
  browser.pageAction.setTitle({ tabId, title });
  browser.pageAction.setIcon({ tabId, path: icon });
  browser.pageAction.setPopup({ tabId, popup });

  let popupState = {};
  if (publicKey) {
    const keyId = parseKeyId(publicKey.keyPacket.keyid);
    const fingerprint = parseFingerprint(publicKey.keyPacket.fingerprint);
    const { name, email, comment } = publicKey.users[0].userId;
    popupState = {
      name,
      email,
      comment,
      fingerprint,
      keyId,
    };
  } else if (errorMessage) {
    popupState = { errorMessage };
  }

  setPopupStateForTabId(tabId, popupState);
};

const processDocument = async ({ tabId, url, data }) => {
  const storageKey = `result/${url}`;
  const blob = new Blob(data, { type: "text/html" });
  const htmlText = await blob.text();

  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  const sigLink = doc.querySelector('head link[rel="signature"]');
  const sigHref = sigLink ? sigLink.getAttribute("href") : undefined;
  if (sigHref) {
    try {
      const sigUrl = new URL(sigHref, url).href;
      const publicKey = await verifySignature(sigUrl, htmlText);
      updatePageAction({ tabId, stateId: STATE_VERIFIED_ID, publicKey });
      browser.storage.local.set({ [storageKey]: STATE_VERIFIED_ID });
    } catch (error) {
      console.error("verification failed", error);
      updatePageAction({
        tabId,
        stateId: STATE_FAILURE_ID,
        errorMessage: error.message,
      });
      browser.storage.local.set({ [storageKey]: STATE_FAILURE_ID });
    }
  } else {
    updatePageAction({ tabId, stateId: STATE_UNVERIFIED_ID });
    browser.storage.local.set({ [storageKey]: STATE_UNVERIFIED_ID });
  }
};

browser.webNavigation.onBeforeNavigate.addListener(async (navigateDetails) => {
  const { tabId, url } = navigateDetails;
  const storageKey = `result/${url}`;
  let requested = false;

  const beforeRequestListener = (requestDetails) => {
    const { requestId } = requestDetails;
    requested = true;

    if (!("filterResponseData" in browser.webRequest)) {
      updatePageAction({
        tabId,
        stateId: STATE_UNSUPPORTED_BROWSER_ID,
      });
      browser.storage.local.set({ [storageKey]: STATE_UNSUPPORTED_BROWSER_ID });
      return;
    }

    const data = [];
    const filter = browser.webRequest.filterResponseData(requestId);

    filter.ondata = (event) => {
      data.push(event.data);
      filter.write(event.data);
    };

    filter.onstop = () => {
      filter.disconnect();
      processDocument({ tabId, url, data });
    };

    filter.onerror = () => {
      console.error("filter error", filter.error);
    };
  };

  const committedListener = async () => {
    browser.webRequest.onBeforeRequest.removeListener(beforeRequestListener);
    browser.webNavigation.onCommitted.removeListener(committedListener);

    if (!requested) {
      const {
        [storageKey]: stateId = STATE_CACHE_MISS_ID,
      } = await browser.storage.local.get(storageKey);
      console.warn("using cached result", { stateId });
      updatePageAction({ tabId, stateId });
    }
  };

  const requestFilter = {
    urls: [url],
    types: ["main_frame"],
  };
  const extraInfoSpec = ["blocking"];
  browser.webRequest.onBeforeRequest.addListener(
    beforeRequestListener,
    requestFilter,
    extraInfoSpec
  );

  const urlFilter = {
    url: [
      {
        urlEquals: url,
      },
    ],
  };
  browser.webNavigation.onCommitted.addListener(committedListener, urlFilter);
});

const connectListener = (port) => {
  port.onMessage.addListener((message) => {
    switch (message.type) {
      case "SUBSCRIBE": {
        port.postMessage({
          type: "UPDATE",
          payload: getPopupStateForTabId(message.payload.tabId),
        });
        return;
      }
      default: {
        console.warn("Unknown message", { message });
        return;
      }
    }
  });
};

browser.runtime.onConnect.addListener(connectListener);
