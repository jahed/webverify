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

const STATE_SUCCESS_ID = "SUCCESS";
const STATE_FAILURE_ID = "FAILURE";
const STATE_UNKNOWN_ID = "UNKNOWN";

const State = {
  [STATE_SUCCESS_ID]: {
    id: STATE_SUCCESS_ID,
    title: "Verified",
    icon: "icons/page-action-verified.svg",
  },
  [STATE_FAILURE_ID]: {
    id: STATE_FAILURE_ID,
    title: "Verification Failed",
    icon: "icons/page-action-blocked.svg",
  },
  [STATE_UNKNOWN_ID]: {
    id: STATE_UNKNOWN_ID,
    title: "Unverified",
    icon: "icons/page-action-unverified.svg",
  },
};

const setPageActionState = (tabId, stateId = "unknown") => {
  const { title, icon } = State[stateId];
  browser.pageAction.setTitle({ tabId, title });
  browser.pageAction.setIcon({ tabId, path: icon });
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
      browser.storage.local.set({ [storageKey]: STATE_SUCCESS_ID });
      setPageActionState(tabId, STATE_SUCCESS_ID);
    } catch (error) {
      console.error("verification failed", error);
      browser.storage.local.set({ [storageKey]: STATE_FAILURE_ID });
      setPageActionState(tabId, STATE_FAILURE_ID);
    }
  } else {
    console.log("no signature found");
    browser.storage.local.remove(storageKey);
    setPageActionState(tabId, STATE_UNKNOWN_ID);
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
        [storageKey]: result = STATE_UNKNOWN_ID,
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
