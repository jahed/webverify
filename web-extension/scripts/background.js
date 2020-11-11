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

const getAuthor = (publicKey) => {
  const keyId = parseKeyId(publicKey.keyPacket.keyid);
  const fingerprint = parseFingerprint(publicKey.keyPacket.fingerprint);
  const { name, email, comment } = publicKey.users[0].userId;
  return {
    name,
    email,
    comment,
    fingerprint,
    keyId,
  };
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
  return getAuthor(publicKeys[0]);
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

const matchersByTabId = new Map();

const getMatchersForTabId = (tabId) => {
  let matchers = matchersByTabId.get(tabId);
  if (!matchers) {
    matchers = [];
    matchersByTabId.set(tabId, matchers);
  }
  return matchers;
};

const setMatchersForTabId = (tabId, matchers = []) => {
  matchersByTabId.set(tabId, matchers);
};

browser.runtime.onMessage.addListener((message, sender) => {
  const tabId = sender.tab.id;
  switch (message.type) {
    case "UNLOAD_MATCHERS": {
      setMatchersForTabId(tabId, message.payload.matchers);
      return;
    }
    default: {
      console.warn("Unknown message", { message });
      return;
    }
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  popupStateByTabId.delete(tabId);
  matchersByTabId.delete(tabId);
});

const getUrlCacheKey = url => `urls/${url}`

const setUrlCache = async (url, value) => {
  await browser.storage.local.set({ [getUrlCacheKey(url)]: value });
}

const getUrlCache = async (url) => {
  const key = getUrlCacheKey(url)
  const result = await browser.storage.local.get(key);
  return result[key] || {
    stateId: STATE_CACHE_MISS_ID
  }
}

const updatePageAction = ({
  tabId,
  url,
  cache,
  stateId,
  author,
  errorMessage,
}) => {
  const { title, icon, popup } = State[stateId];
  browser.pageAction.setTitle({ tabId, title });
  browser.pageAction.setIcon({ tabId, path: icon });
  browser.pageAction.setPopup({ tabId, popup });

  setPopupStateForTabId(tabId, {
    cache,
    stateId,
    author,
    errorMessage,
  });

  setUrlCache(url, {
    stateId,
    author,
    errorMessage,
  })
};

const processDocument = async ({ tabId, url, data }) => {
  const blob = new Blob(data, { type: "text/html" });
  const htmlText = await blob.text();

  const document = new DOMParser().parseFromString(htmlText, "text/html");
  const sigLink = document.head.querySelector('link[rel="signature"]');
  const sigHref = sigLink ? sigLink.getAttribute("href") : undefined;
  if (sigHref) {
    try {
      const sigUrl = new URL(sigHref, url).href;
      const author = await verifySignature(sigUrl, htmlText);
      updatePageAction({ tabId, url, stateId: STATE_VERIFIED_ID, author });
    } catch (error) {
      console.error("verification failed", error);
      updatePageAction({
        tabId,
        url,
        stateId: STATE_FAILURE_ID,
        errorMessage: error.message,
      });
    }
  } else {
    updatePageAction({ tabId, url, stateId: STATE_UNVERIFIED_ID });
  }
};

const getExpectedKeyId = ({ referringTabId, url }) => {
  for (const matcher of getMatchersForTabId(referringTabId)) {
    if (url.startsWith(matcher.prefix)) {
      return matcher.keyId;
    }
  }
  return null;
};

const referringTabIdMap = new Map();

/**
 * referringTabId is the tabId from which the new navigation was triggered.
 * It can be the same tabId. This is used to match and enforce expected authors.
 */
const getReferringTabId = (tabId) => {
  const referringTabId = referringTabIdMap.get(tabId);
  if (referringTabId) {
    referringTabIdMap.delete(tabId);
    return referringTabId;
  }
  return tabId;
};

browser.webNavigation.onCreatedNavigationTarget.addListener((details) => {
  const { sourceTabId, tabId } = details;
  referringTabIdMap.set(tabId, sourceTabId);
});

browser.webNavigation.onBeforeNavigate.addListener(async (navigateDetails) => {
  const { tabId, url } = navigateDetails;
  const referringTabId = getReferringTabId(tabId);
  let requested = false;

  let processDocumentResolve;
  let processDocumentReject;
  let processDocumentPromise = new Promise((resolve, reject) => {
    processDocumentResolve = resolve;
    processDocumentReject = reject;
  });

  const beforeRequestListener = (requestDetails) => {
    const { requestId } = requestDetails;
    requested = true;

    if (!("filterResponseData" in browser.webRequest)) {
      updatePageAction({
        tabId,
        url,
        stateId: STATE_UNSUPPORTED_BROWSER_ID,
      });
      processDocumentResolve();
      return;
    }

    const data = [];
    const filter = browser.webRequest.filterResponseData(requestId);

    filter.ondata = (event) => {
      data.push(event.data);
      filter.write(event.data);
    };

    filter.onstop = async () => {
      filter.disconnect();
      processDocument({ tabId, url, data }).then(
        processDocumentResolve,
        processDocumentReject
      );
    };

    filter.onerror = () => {
      processDocumentReject(filter.error);
    };
  };

  const committedListener = async (committedDetails) => {
    const { transitionType } = committedDetails;

    browser.webRequest.onBeforeRequest.removeListener(beforeRequestListener);
    browser.webNavigation.onCommitted.removeListener(committedListener);

    if (!requested) {
      const urlCache = await getUrlCache(url)
      console.warn("using cached result", { url, urlCache });
      updatePageAction({ tabId, url, cache: true, ...urlCache });
    }

    if (transitionType === "link") {
      if (requested) {
        await processDocumentPromise;
      }
      const { author } = getPopupStateForTabId(tabId);
      const keyId = author && author.keyId
      const expectedKeyId = getExpectedKeyId({ referringTabId, url });
      if (expectedKeyId && expectedKeyId !== keyId) {
        console.warn(
          `The link you followed expected a different author. Expected ${expectedKeyId} but got ${keyId}.`
        );
        return;
      }
    }
  };

  browser.webRequest.onBeforeRequest.addListener(
    beforeRequestListener,
    {
      urls: [url],
      types: ["main_frame"],
    },
    ["blocking"]
  );

  browser.webNavigation.onCommitted.addListener(committedListener, {
    url: [
      {
        urlEquals: url,
      },
    ],
  });
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
