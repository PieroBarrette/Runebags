export function renderHands(state, elements, handVisibility, forcedVisible) {
  renderPlayerHand(state, 1, elements, handVisibility[1], forcedVisible[1]);
  renderPlayerHand(state, 2, elements, handVisibility[2], forcedVisible[2]);

  elements.player1Panel.classList.toggle("active-player", state.currentPlayer === 1);
  elements.player2Panel.classList.toggle("active-player", state.currentPlayer === 2);
}

function renderPlayerHand(state, playerId, elements, isVisible, isForcedVisible) {
  const player = state.players[playerId];
  const handEl = playerId === 1 ? elements.player1Hand : elements.player2Hand;
  const toggleEl = playerId === 1 ? elements.player1Toggle : elements.player2Toggle;

  handEl.innerHTML = "";
  handEl.classList.toggle("hidden-hand", !isVisible);
  toggleEl.textContent = isForcedVisible ? "Forced Visible (Uruz)" : isVisible ? "Hide Hand" : "Reveal Hand";
  toggleEl.disabled = isForcedVisible;

  player.hand.forEach((rune) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "rune-card";
    button.classList.add(playerId === 1 ? "player-1" : "player-2");
    button.dataset.playerId = String(playerId);
    button.dataset.runeInstanceId = rune.instanceId;
    button.disabled = state.phase !== "round" || state.currentPlayer !== playerId || state.gameWinner;

    if (rune.level >= 2) {
      button.classList.add("level-2");
    }

    if ((rune.etherealAtLevels || []).includes(rune.level)) {
      button.classList.add("ethereal");
    }

    if (player.selectedRuneInstanceId === rune.instanceId) {
      button.classList.add("selected");
    }

    const icon = document.createElement("div");
    icon.className = "rune-chip";
    if (rune.id === "neutral") {
      icon.classList.add("neutral");
    } else {
      icon.classList.add(playerId === 1 ? "black" : "white");
    }

    if (rune.icon) {
      const symbol = document.createElement("img");
      symbol.src = rune.icon;
      symbol.alt = rune.name;
      symbol.className = "rune-chip-symbol";
      icon.appendChild(symbol);
    }

    const textWrap = document.createElement("div");
    const title = document.createElement("strong");
    title.textContent = rune.name;

    const subtitle = document.createElement("small");
    subtitle.textContent = `L${rune.level} - ${rune.description}`;

    textWrap.appendChild(title);
    textWrap.appendChild(subtitle);

    button.appendChild(icon);
    button.appendChild(textWrap);
    handEl.appendChild(button);
  });
}
