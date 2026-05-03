export function renderLog(state, elements) {
  elements.turnLog.innerHTML = "";

  state.log.slice(0, 30).forEach((entry) => {
    const row = document.createElement("div");
    row.className = "log-row";
    row.textContent = entry;
    elements.turnLog.appendChild(row);
  });
}
