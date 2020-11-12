const getPublicKeys = async (keyId) => {
  const storageKey = `publicKeys/${keyId}`;
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

const STATE_VERIFIED_ID = "VERIFIED";
const STATE_FAILURE_ID = "FAILURE";
const STATE_UNVERIFIED_ID = "UNVERIFIED";
const STATE_CACHE_MISS_ID = "CACHE_MISS";
const STATE_UNSUPPORTED_BROWSER_ID = "UNSUPPORTED_BROWSER";

const State = {
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
  const matchers = matchersByTabId.get(tabId);
  matchersByTabId.delete(tabId);
  return matchers || [];
};

const setMatchersForTabId = (tabId, matchers = []) => {
  console.log("storing matchers", { tabId, matchers });
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

const getUrlCacheKey = (url) => `urls/${url}`;

const setUrlCache = async (url, value) => {
  await browser.storage.local.set({ [getUrlCacheKey(url)]: value });
};

const getUrlCache = async (url) => {
  const key = getUrlCacheKey(url);
  const result = await browser.storage.local.get(key);
  return (
    result[key] || {
      stateId: STATE_CACHE_MISS_ID,
    }
  );
};

const publicKeyStatusToIcon = {
  APPROVED: "icons/page-action-approved.svg",
  REJECTED: "icons/page-action-rejected.svg",
};

const setPageActionIcon = async ({ tabId, stateId, keyId, icon }) => {
  if (stateId === STATE_VERIFIED_ID) {
    const statusKey = `publicKeyStatus/${keyId}`;
    const { [statusKey]: status } = await browser.storage.local.get(statusKey);
    const statusIcon = publicKeyStatusToIcon[status];
    if (statusIcon) {
      browser.pageAction.setIcon({ tabId, path: statusIcon });
      return;
    }
  }
  browser.pageAction.setIcon({ tabId, path: icon });
};

const updatePageAction = ({
  tabId,
  url,
  cache = false,
  stateId,
  author,
  errorMessage,
}) => {
  const { title, icon, popup } = State[stateId];
  browser.pageAction.setTitle({ tabId, title });
  browser.pageAction.setPopup({ tabId, popup });
  setPageActionIcon({ tabId, stateId, keyId: author && author.keyId, icon });

  setPopupStateForTabId(tabId, {
    cache,
    tabId,
    stateId,
    author,
    errorMessage,
  });

  if (!cache) {
    setUrlCache(url, {
      stateId,
      author,
      errorMessage,
    });
  }
};

const verifyResponseBody = async ({ tabId, url, data }) => {
  console.log("verifyResponseBody", { tabId, url });
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
      console.warn("verification failed", error);
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

const getExpectedMatcher = ({ referringTabId, url }) => {
  for (const matcher of getMatchersForTabId(referringTabId)) {
    if (url.startsWith(matcher.prefix)) {
      return matcher;
    }
  }
  return null;
};

/**
 * referringTabId is the tabId from which the new navigation was triggered.
 * It can be the same tabId. This is used to match and enforce expected authors.
 */
const referringTabIdMap = new Map();

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

const getResponseBody = async ({ requestId }) => {
  console.log("getResponseBody", { requestId });
  if (!("filterResponseData" in browser.webRequest)) {
    throw new Error("Browser does not allow access to response body.");
  }

  return new Promise((resolve, reject) => {
    const data = [];
    const filter = browser.webRequest.filterResponseData(requestId);

    filter.ondata = (event) => {
      filter.write(event.data);
      data.push(event.data);
    };

    filter.onstop = () => {
      filter.disconnect();
      resolve(data);
    };

    filter.onerror = () => {
      reject(new Error(filter.error));
    };
  });
};

const usePageActionFromCache = async ({ tabId, url }) => {
  console.log("using cache", { tabId, url });
  const urlCache = await getUrlCache(url);
  updatePageAction({ tabId, url, cache: true, ...urlCache });
};

const verifyResponse = async ({ tabId, url }) => {
  return new Promise((resolve, reject) => {
    console.log("verifyResponse", { tabId, url });
    const beforeRequestListener = (details) => {
      const { tabId: requestTabId, requestId } = details;
      if (requestTabId !== tabId) {
        return;
      }
      console.log("verifyResponse beforeRequest", { details });
      browser.webRequest.onBeforeRequest.removeListener(beforeRequestListener);

      getResponseBody({ requestId })
        .then((data) => verifyResponseBody({ tabId, url, data }))
        .then(resolve, (error) => {
          console.warn(error);
          return usePageActionFromCache({ tabId, url });
        })
        .catch(reject);

      // Do not return blocking promise.
    };

    const committedListener = async (details) => {
      const { tabId: committedTabId } = details;
      if (committedTabId !== tabId) {
        return;
      }

      console.log("verifyResponse committed", { details });
      browser.webNavigation.onCommitted.removeListener(committedListener);
      if (
        browser.webRequest.onBeforeRequest.hasListener(beforeRequestListener)
      ) {
        browser.webRequest.onBeforeRequest.removeListener(
          beforeRequestListener
        );
        usePageActionFromCache({ tabId, url }).then(resolve, reject);
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
};

const verifyLinkTransition = async ({ tabId, url, verifyResponsePromise }) => {
  await verifyResponsePromise;
  const referringTabId = getReferringTabId(tabId);
  const { author } = getPopupStateForTabId(tabId);
  const keyId = author && author.keyId;
  const matcher = getExpectedMatcher({ referringTabId, url });
  if (matcher && matcher.keyId && matcher.keyId !== keyId) {
    console.warn("link verification failed", { tabId, url, keyId, matcher });
    const searchParams = new URLSearchParams();
    searchParams.set("url", url);
    if (matcher.date) {
      searchParams.set("date", matcher.date);
    }
    browser.tabs.update(tabId, {
      url: `/pages/unverified-link.html?${searchParams.toString()}`,
      loadReplace: true,
    });
  }
};

const verifyNavigation = async ({ tabId, url, verifyResponsePromise }) => {
  return new Promise((resolve, reject) => {
    const committedListener = (details) => {
      const { tabId: comittedTabId, transitionType } = details;
      if (comittedTabId !== tabId) {
        return;
      }

      browser.webNavigation.onCommitted.removeListener(committedListener);
      if (transitionType !== "link") {
        resolve();
        return;
      }

      verifyLinkTransition({ tabId, url, verifyResponsePromise }).then(
        resolve,
        reject
      );
    };

    browser.webNavigation.onCommitted.addListener(committedListener, {
      url: [
        {
          urlEquals: url,
        },
      ],
    });
  });
};

browser.webNavigation.onBeforeNavigate.addListener((details) => {
  console.log("beforeNavigate", { details });
  const { tabId, url } = details;
  const verifyResponsePromise = verifyResponse({ tabId, url });
  verifyNavigation({ tabId, url, verifyResponsePromise });
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
