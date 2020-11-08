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
  const signature = await getSignature(signatureUrl);
  const keyId = await getKeyId(signature);
  const publicKeys = await getPublicKeys(keyId);
  const message = openpgp.message.fromText(content);
  const verified = await openpgp.verify({ message, signature, publicKeys });
  const { error } = verified.signatures[0];
  if (error) {
    throw error;
  }
};

const processDocument = async ({ tabId, data }) => {
  browser.pageAction.setIcon({
    tabId,
    path: "icons/page-action-unknown.svg",
  });

  const blob = new Blob(data, { type: "text/html" });
  const htmlText = await blob.text();

  const doc = new DOMParser().parseFromString(htmlText, "text/html");
  const sigLink = doc.querySelector('head link[rel="signature"]');
  if (sigLink) {
    console.log("signature detected");
    try {
      const sigUrl = sigLink.getAttribute("href");
      await verifySignature(sigUrl, htmlText);
      console.log("verification success");
      browser.pageAction.setIcon({
        tabId,
        path: "icons/page-action-verified.svg",
      });
    } catch (error) {
      console.error("verification failed", error);
      browser.pageAction.setIcon({
        tabId,
        path: "icons/page-action-unverified.svg",
      });
    }
  } else {
    console.log("no signature found");
  }
};
browser.webNavigation.onBeforeNavigate.addListener(async (navigateDetails) => {
  console.log("navigation detected");

  const listener = (requestDetails) => {
    console.log("request detected");

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
        tabId: requestDetails.tabId,
        data,
      });
    };

    filter.onerror = () => {
      console.error("filter error", filter.error);
    };
  };

  browser.webRequest.onBeforeRequest.addListener(
    listener,
    {
      urls: [navigateDetails.url],
      types: ["main_frame"],
    },
    ["blocking"]
  );

  browser.webNavigation.onCommitted.addListener(() => {
    browser.webRequest.onBeforeRequest.removeListener(listener);
  });
});
