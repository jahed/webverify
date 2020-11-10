const getPublicKeys = async (keyId) => {
  console.log("key id", { keyId });
  const storageKey = `keyId/${keyId}`;
  let { [storageKey]: publicKeyArmored } = await browser.storage.local.get(
    storageKey
  );

  if (!publicKeyArmored) {
    console.log("looking up key using hkp");
    const hkp = new openpgp.HKP("https://keys.openpgp.org");
    publicKeyArmored = await hkp.lookup({ keyId });

    await browser.storage.local.set({ [storageKey]: publicKeyArmored });
  }

  console.log("public key", { publicKeyArmored });

  const { keys } = await openpgp.key.readArmored(publicKeyArmored);
  return keys;
};

const getKeyId = async (signature) => {
  return openpgp.util
    .str_to_hex(signature.packets[0].issuerKeyId.bytes)
    .toUpperCase();
};

const getSignature = async (signatureUrl) => {
  const res = await fetch(signatureUrl);
  const armoredSignature = await res.text();
  console.log("signature", { armoredSignature });
  return await openpgp.signature.readArmored(armoredSignature);
};

const verifySignature = async (signatureUrl, content) => {
  const message = openpgp.message.fromText(content);
  const signature = await getSignature(signatureUrl);
  const keyId = await getKeyId(signature);
  const publicKeys = await getPublicKeys(keyId);
  const verified = await openpgp.verify({ message, signature, publicKeys });
  const { error } = verified.signatures[0];
  if (error) {
    throw error;
  }
};

const STATE_APPROVED_ID = "APPROVED";
const STATE_BLOCKED_ID = "BLOCKED";
const STATE_VERIFIED_ID = "VERIFIED";
const STATE_FAILURE_ID = "FAILURE";
const STATE_UNVERIFIED_ID = "UNVERIFIED";

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
};

const setPageActionState = (tabId, stateId = "unknown") => {
  const { title, icon, popup } = State[stateId];
  browser.pageAction.setTitle({ tabId, title });
  browser.pageAction.setIcon({ tabId, path: icon });
  browser.pageAction.setPopup({ tabId, popup });
};

const processDocument = async ({ tabId, url, data }) => {
  const storageKey = `result/${url}`;
  const blob = new Blob(data, { type: "text/html" });
  const htmlText = await blob.text();

  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  const sigLink = doc.querySelector('head link[rel="signature"]');
  const sigHref = sigLink ? sigLink.getAttribute("href") : undefined;
  if (sigHref) {
    console.log("signature detected");
    try {
      const sigUrl = new URL(sigHref, url).href;
      await verifySignature(sigUrl, htmlText);
      console.log("verification success");
      browser.storage.local.set({ [storageKey]: STATE_VERIFIED_ID });
      setPageActionState(tabId, STATE_VERIFIED_ID);
    } catch (error) {
      console.error("verification failed", error);
      browser.storage.local.set({ [storageKey]: STATE_FAILURE_ID });
      setPageActionState(tabId, STATE_FAILURE_ID);
    }
  } else {
    console.log("no signature found");
    browser.storage.local.remove(storageKey);
    setPageActionState(tabId, STATE_UNVERIFIED_ID);
  }
};

browser.webNavigation.onBeforeNavigate.addListener(async (navigateDetails) => {
  let requested = false;
  console.log("navigation detected");

  const beforeRequestListener = (requestDetails) => {
    console.log("request detected");
    requested = true;

    const data = [];
    const filter = browser.webRequest.filterResponseData(
      requestDetails.requestId
    );

    filter.ondata = (event) => {
      data.push(event.data);
      filter.write(event.data);
    };

    filter.onstop = () => {
      console.log("filter stop");
      filter.disconnect();
      processDocument({
        tabId: navigateDetails.tabId,
        url: navigateDetails.url,
        data,
      });
    };

    filter.onerror = () => {
      console.error("filter error", filter.error);
    };
  };

  const committedListener = async () => {
    console.log("navigation committed");
    browser.webRequest.onBeforeRequest.removeListener(beforeRequestListener);
    browser.webNavigation.onCommitted.removeListener(committedListener);

    if (!requested) {
      const storageKey = `result/${navigateDetails.url}`;
      const {
        [storageKey]: result = STATE_UNVERIFIED_ID,
      } = await browser.storage.local.get(storageKey);

      console.log("using cached result", { result });
      setPageActionState(navigateDetails.tabId, result);
    }
  };

  const requestFilter = {
    urls: [navigateDetails.url],
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
        urlEquals: navigateDetails.url,
      },
    ],
  };
  browser.webNavigation.onCommitted.addListener(committedListener, urlFilter);
});
