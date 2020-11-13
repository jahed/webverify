(() => {
  const params = new URLSearchParams(location.search);
  const url = params.get("url");
  const keyId = params.get("keyId");

  const back = document.getElementById("BACK");
  back.addEventListener("click", () => {
    history.back();
  });

  const ignore = document.getElementById("IGNORE");
  ignore.setAttribute("href", url);
  ignore.addEventListener("click", (event) => {
    event.preventDefault();
    browser.runtime.sendMessage({
      type: "IGNORE_PUBLIC_KEY_STATUS",
      payload: {
        keyId,
      },
    });
    const tabId = browser.tabs.getCurrent().id;
    browser.tabs.update(tabId, {
      url,
      loadReplace: true,
    });
  });
})();
