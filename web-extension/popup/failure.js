const update = (state) => {
  const errorEl = document.getElementById("ERROR_MESSAGE");
  errorEl.textContent = state.errorMessage || "No reason given";
};

subscribe(update);
