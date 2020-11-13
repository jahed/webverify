(() => {
  const getArchiveDate = (date) => {
    if (!date) {
      return "*";
    }

    return [
      `${date.getFullYear()}`.padStart(4, "0"),
      `${date.getMonth() + 1}`.padStart(2, "0"),
      `${date.getDate()}`.padStart(2, "0"),
      `${date.getHours()}`.padStart(2, "0"),
      `${date.getMinutes()}`.padStart(2, "0"),
      `${date.getSeconds()}`.padStart(2, "0"),
    ].join("");
  };

  const params = new URLSearchParams(location.search);
  const url = params.get("url");
  const dateString = params.get("date");

  const back = document.getElementById("BACK");
  back.addEventListener("click", () => {
    history.back();
  });

  const date = new Date(dateString);
  const archive = document.getElementById("ARCHIVE");
  archive.setAttribute(
    "href",
    `https://web.archive.org/web/${getArchiveDate(date)}/${url}`
  );

  const ignore = document.getElementById("IGNORE");
  ignore.setAttribute("href", url);
  ignore.addEventListener("click", (event) => {
    event.preventDefault();
    const tabId = browser.tabs.getCurrent().id;
    browser.tabs.update(tabId, {
      url,
      loadReplace: true,
    });
  });
})();
