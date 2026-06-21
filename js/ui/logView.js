export function renderLog(state, elements, formatEntry) {
  elements.turnLog.innerHTML = "";

  state.log
    .filter((entry) => !isShopLogEntry(entry))
    .slice(0, 30)
    .forEach((entry) => {
    const row = document.createElement("div");
    row.className = "log-row";
    row.textContent = formatEntry
      ? formatEntry(entry)
      : (typeof entry === "string" ? entry : "");
    elements.turnLog.appendChild(row);
    });
}

function isShopLogEntry(entry) {
  if (!entry) {
    return false;
  }

  if (typeof entry === "object") {
    return Boolean(entry.shop);
  }

  return (
    entry === "Shop phase started." ||
    entry.startsWith("Shop turn passed to ") ||
    entry.includes(" from shop offer.") ||
    entry.includes(" shop effect ") ||
    entry.includes("returned it to their shop supply.") ||
    entry.includes("removed a Neutral rune. It returned to supply.") ||
    entry.includes("removed a Basic rune permanently.") ||
    entry.includes("combined two ")
  );
}
