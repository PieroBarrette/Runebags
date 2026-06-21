// Minimal i18n: a dictionary + t() with {param} substitution, plus DOM
// application via data-i18n / data-i18n-html / data-i18n-attr attributes.
const LANG_STORAGE_KEY = "runebags-lang-v1";
const SUPPORTED = ["en", "fr"];

const translations = {
  en: {
    "home.tagline": "Runic tactics, hidden hands, and evolving rounds.",
    "home.playAi": "Play Against AI",
    "home.passplay": "Pass & Play",
    "home.online": "Play Online",
    "home.install": "Install app",
    "home.runesTitle": "24 runes, each with a unique power",
    "home.footerGithub": "View on GitHub",
    "home.resumeBtn": "Resume game",
    "pillar.tactics.title": "Pure tactics",
    "pillar.tactics.desc": "Connect four of your runes in a line to take the point from the shared supply.",
    "pillar.hands.title": "Hidden hands",
    "pillar.hands.desc": "A pass-the-device prompt keeps each player's hand secret in local play.",
    "pillar.bag.title": "Evolving bag",
    "pillar.bag.desc": "Shop between rounds to add, remove, and combine your runes into stronger ones.",
    "nav.rules": "Rules",
    "nav.settings": "Settings",
    "nav.back": "Back",
    "settings.title": "Settings",
    "settings.theme": "Theme Mode",
    "settings.themeLight": "Light",
    "settings.themeDark": "Dark",
    "settings.animations": "Animations",
    "settings.sound": "Sound Effects",
    "settings.volume": "SFX Volume",
    "settings.tutorial": "Tutorial",
    "settings.language": "Language",
    "settings.tutorialNote": "Guided tutorial dialogs appear while you play local games. It turns itself off once every tip has been shown.",
    "settings.runesHeading": "Runes in Local Games",
    "settings.runesHint": "Choose which rune symbols are included for AI and Pass & Play. Online always uses all runes.",
    "ai.title": "Play Against AI",
    "ai.side": "AI Side",
    "ai.depth": "AI Depth",
    "ai.easy": "Easy",
    "ai.medium": "Medium",
    "ai.hard": "Hard",
    "ai.harder": "Harder",
    "ai.continue": "Continue Game",
    "ai.start": "Start New Game",
    "side.black": "Black",
    "side.white": "White",
    "topbar.menu": "Main Menu",
    "topbar.newGame": "New Game",
    "passDevice.title": "Pass the device",
    "passDevice.reveal": "Reveal hand",
    "endgame.eyebrow": "Game over",
    "endgame.playAgain": "Play again",
    "endgame.share": "Share result",
    "endgame.mainMenu": "Main menu",
    "endgame.viewBoard": "View board",
    "tutorial.promptTitle": "Tutorial",
    "tutorial.promptText": "New to RuneBags? Would you like a guided tutorial with quick tips while you play?",
    "tutorial.sure": "Sure",
    "tutorial.skip": "Skip tutorial",
    "tutorial.dialogHint": "Click once to finish the text, click again to close.",
    "common.close": "Close",
    "status.choice": "Round {round} - {player} choice",
    "status.gameWinner": "Game Winner: {player}",
    "status.gameDraw": "Game End: Draw",
    "status.winsGame": "{player} wins the game.",
    "status.fullTie": "Game ended in a full tie.",
    "status.roundWinner": "Round Winner: {player}",
    "status.roundWonBy": "Round {round} won by {player}. Click Phase Action for shop.",
    "status.roundDrawPill": "Round {round}: Draw",
    "status.roundDraw": "Round draw. Click Phase Action for shop.",
    "status.shopSimultaneous": "Shop Phase - Simultaneous",
    "status.shopPlayer": "Shop Phase - {player}",
    "status.shopPhase": "Shop phase.",
    "status.turnPill": "Round {round} - Turn: {player}",
    "status.nauthiz": "{player}: choose any highlighted empty cell for Nauthiz.",
    "status.forced": "{player}: forced to play adjacent columns ({cols}).",
    "status.chooseRune": "{player}: choose a rune, then click a column.",
    "game.points": "Points",
    "game.bag": "Bag: {n}",
    "game.neutralSupply": "Neutral Supply: {n}",
    "game.discardedThisRound": "Discarded this round: {n}",
    "endgame.wins": "{player} wins!",
    "endgame.draw": "It's a draw",
    "endgame.endedLevel": "The game ended level.",
    "endgame.bag": "Bag {n}",
    "endgame.record": "Record: {w}W {l}L {d}D · current streak {s}",
    "reason.majority": "Won the majority of the available points.",
    "reason.supplyEmpty": "Held the most points when the supply ran out.",
    "reason.fewestBag": "Points tied — won with fewer runes left in the bag.",
    "reason.fullTie": "Dead even, down to the last rune.",
    "stats.gamesPlayed": "{n} games played",
    "stats.recordSuffix": " · {w}W {l}L {d}D · streak {s} (best {b})",
    "home.resumeText": "Resume your {mode} game — round {round}",
    "share.wins": "{player} wins",
    "share.draw": "Draw",
    "share.line": "Round {round} · Black {b} – White {w}",
    "share.legend": "\u{1F535} Black  ⚪ White  \u{1F7EB} Neutral",
    "game.levelPrefix": "L",
    "game.ethereal": "Ethereal",
    "rune.levels": "Levels 1–{max}",
    "rune.shopEffect": "When picked from shop, add a neutral rune to owner bag.",
  },
  fr: {
    "home.tagline": "Tactique runique, mains cachées, manches qui évoluent.",
    "home.playAi": "Jouer contre l'IA",
    "home.passplay": "Jeu à tour de rôle",
    "home.online": "Jouer en ligne",
    "home.install": "Installer l'app",
    "home.runesTitle": "24 runes, chacune avec un pouvoir unique",
    "home.footerGithub": "Voir sur GitHub",
    "home.resumeBtn": "Reprendre",
    "pillar.tactics.title": "Tactique pure",
    "pillar.tactics.desc": "Alignez quatre de vos runes pour prendre un point de la réserve commune.",
    "pillar.hands.title": "Mains cachées",
    "pillar.hands.desc": "Une invite « passez l'appareil » garde la main de chaque joueur secrète en local.",
    "pillar.bag.title": "Sac évolutif",
    "pillar.bag.desc": "Faites vos emplettes entre les manches pour ajouter, retirer et combiner vos runes.",
    "nav.rules": "Règles",
    "nav.settings": "Paramètres",
    "nav.back": "Retour",
    "settings.title": "Paramètres",
    "settings.theme": "Thème",
    "settings.themeLight": "Clair",
    "settings.themeDark": "Sombre",
    "settings.animations": "Animations",
    "settings.sound": "Effets sonores",
    "settings.volume": "Volume des effets",
    "settings.tutorial": "Tutoriel",
    "settings.language": "Langue",
    "settings.tutorialNote": "Des dialogues de tutoriel apparaissent pendant vos parties locales. Il se désactive une fois tous les conseils affichés.",
    "settings.runesHeading": "Runes dans les parties locales",
    "settings.runesHint": "Choisissez les runes incluses pour l'IA et le jeu à tour de rôle. En ligne utilise toujours toutes les runes.",
    "ai.title": "Jouer contre l'IA",
    "ai.side": "Camp de l'IA",
    "ai.depth": "Niveau de l'IA",
    "ai.easy": "Facile",
    "ai.medium": "Moyen",
    "ai.hard": "Difficile",
    "ai.harder": "Très difficile",
    "ai.continue": "Reprendre la partie",
    "ai.start": "Nouvelle partie",
    "side.black": "Noir",
    "side.white": "Blanc",
    "topbar.menu": "Menu principal",
    "topbar.newGame": "Nouvelle partie",
    "passDevice.title": "Passez l'appareil",
    "passDevice.reveal": "Révéler la main",
    "endgame.eyebrow": "Partie terminée",
    "endgame.playAgain": "Rejouer",
    "endgame.share": "Partager le résultat",
    "endgame.mainMenu": "Menu principal",
    "endgame.viewBoard": "Voir le plateau",
    "tutorial.promptTitle": "Tutoriel",
    "tutorial.promptText": "Nouveau sur RuneBags ? Voulez-vous un tutoriel guidé avec des astuces pendant que vous jouez ?",
    "tutorial.sure": "D'accord",
    "tutorial.skip": "Passer le tutoriel",
    "tutorial.dialogHint": "Cliquez une fois pour terminer le texte, encore une fois pour fermer.",
    "common.close": "Fermer",
    "status.choice": "Manche {round} - choix de {player}",
    "status.gameWinner": "Vainqueur : {player}",
    "status.gameDraw": "Fin de partie : nul",
    "status.winsGame": "{player} remporte la partie.",
    "status.fullTie": "Partie terminée sur une égalité parfaite.",
    "status.roundWinner": "Manche gagnée : {player}",
    "status.roundWonBy": "Manche {round} gagnée par {player}. Cliquez sur Action de phase pour la boutique.",
    "status.roundDrawPill": "Manche {round} : nul",
    "status.roundDraw": "Manche nulle. Cliquez sur Action de phase pour la boutique.",
    "status.shopSimultaneous": "Boutique - Simultané",
    "status.shopPlayer": "Boutique - {player}",
    "status.shopPhase": "Phase de boutique.",
    "status.turnPill": "Manche {round} - Tour : {player}",
    "status.nauthiz": "{player} : choisissez une case vide en surbrillance pour Nauthiz.",
    "status.forced": "{player} : doit jouer dans les colonnes adjacentes ({cols}).",
    "status.chooseRune": "{player} : choisissez une rune, puis cliquez sur une colonne.",
    "game.points": "Points",
    "game.bag": "Sac : {n}",
    "game.neutralSupply": "Réserve neutre : {n}",
    "game.discardedThisRound": "Défaussé cette manche : {n}",
    "endgame.wins": "{player} gagne !",
    "endgame.draw": "Match nul",
    "endgame.endedLevel": "La partie se termine à égalité.",
    "endgame.bag": "Sac {n}",
    "endgame.record": "Bilan : {w}V {l}D {d}N · série actuelle {s}",
    "reason.majority": "A remporté la majorité des points disponibles.",
    "reason.supplyEmpty": "Avait le plus de points à l'épuisement de la réserve.",
    "reason.fewestBag": "Points à égalité — gagne avec moins de runes dans le sac.",
    "reason.fullTie": "Parfaite égalité, jusqu'à la dernière rune.",
    "stats.gamesPlayed": "{n} parties jouées",
    "stats.recordSuffix": " · {w}V {l}D {d}N · série {s} (record {b})",
    "home.resumeText": "Reprendre votre partie {mode} — manche {round}",
    "share.wins": "{player} gagne",
    "share.draw": "Nul",
    "share.line": "Manche {round} · Noir {b} – Blanc {w}",
    "share.legend": "\u{1F535} Noir  ⚪ Blanc  \u{1F7EB} Neutre",
    "game.levelPrefix": "N",
    "game.ethereal": "Éthérée",
    "rune.levels": "Niveaux 1–{max}",
    "rune.shopEffect": "Quand prise en boutique, ajoute une rune neutre au sac du propriétaire.",
    "rune.basic.desc": "Aucun effet spécial.",
    "rune.neutral.desc": "Bloque les deux joueurs et ne peut pas créer de ligne gagnante seule.",
    "rune.inguz.desc": "Ne peut être jouée que dans la colonne centrale.",
    "rune.jera.desc": "Ne peut être jouée que dans la colonne la plus à gauche ou la plus à droite.",
    "rune.kenaz.desc": "Un seul Kenaz ne fait rien. Quand votre deuxième Kenaz entre en jeu, détruit définitivement 1 rune du plateau.",
    "rune.laguz.desc": "Ne peut être ni déplacée ni retirée.",
    "rune.wunjo.desc": "Si isolée des runes alliées en fin de manche, accorde +1 ajout et +1 retrait à la prochaine boutique.",
    "rune.algiz.desc": "Insérée au bas d'une colonne, poussant les runes vers le haut.",
    "rune.ansuz.desc": "Renvoie la rune juste en dessous dans le sac de son propriétaire.",
    "rune.berkana.desc": "Si dans une ligne gagnante de son propriétaire, accorde +1 point bonus une fois par manche.",
    "rune.dagaz.desc": "Copie l'effet de la rune juste en dessous (sauf Kenaz). À chaque pose, ajoute 1 rune neutre au sac du propriétaire.",
    "rune.ehwaz.desc": "Augmente la limite de main du propriétaire tant qu'elle est sur le plateau. (N1 : 3 runes en main, N2 : 4 runes en main)",
    "rune.eihwaz.desc": "Si défaussée ou retirée pour la manche, son propriétaire gagne 1 point.",
    "rune.fehu.desc": "Récupère des runes défaussées dans votre sac (N1 : 1 rune, N2 : 2 runes).",
    "rune.gebo.desc": "Retire des runes du plateau pour la manche (N1 : rune en dessous, N2 : rune adjacente).",
    "rune.hagalz.desc": "Une rune neutre adjacente peut compter dans votre ligne gagnante.",
    "rune.isa.desc": "Reste sur le plateau entre les manches.",
    "rune.mannaz.desc": "Ajoute des runes neutres au sac de l'adversaire (N1 : 1, N2 : 2).",
    "rune.nauthiz.desc": "Flotte sur n'importe quelle case libre. Éthérée.",
    "rune.odal.desc": "Si jouée sur la rangée du haut, gagne 1 point sans terminer la manche.",
    "rune.perth.desc": "Restreint le prochain tour de l'adversaire aux colonnes adjacentes. (N1 : l'adversaire choisit, N2 : vous choisissez)",
    "rune.raido.desc": "Accorde immédiatement un tour supplémentaire. (N1 : éthérée, N2 : non éthérée)",
    "rune.sowelu.desc": "L'adversaire perd des runes aléatoires de son sac pour la manche. (N1 : 1 rune aléatoire, N2 : 2 runes aléatoires)",
    "rune.teiwaz.desc": "Déplace les runes du sommet entre colonnes. (N1 : vers une colonne adjacente, N2 : vers n'importe quelle colonne)",
    "rune.thurisa.desc": "Ajoute des runes neutres de la réserve sur le plateau. (N1 : 1 rune, N2 : 2 runes)",
    "rune.uruz.desc": "L'adversaire ne peut plus cacher sa main tant que cette rune est sur le plateau.",
  },
};

function detectInitialLang() {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (stored && SUPPORTED.includes(stored)) {
      return stored;
    }
  } catch (error) {
    // ignore
  }
  const nav = (navigator.language || "en").toLowerCase();
  return nav.startsWith("fr") ? "fr" : "en";
}

let currentLang = detectInitialLang();

export function getLang() {
  return currentLang;
}

export function setLang(lang) {
  currentLang = SUPPORTED.includes(lang) ? lang : "en";
  try {
    localStorage.setItem(LANG_STORAGE_KEY, currentLang);
  } catch (error) {
    // ignore
  }
  if (typeof document !== "undefined") {
    document.documentElement.lang = currentLang;
  }
}

export function t(key, params) {
  const dict = translations[currentLang] || translations.en;
  let str = dict[key];
  if (str == null) {
    str = translations.en[key];
  }
  if (str == null) {
    return key;
  }
  if (params) {
    str = str.replace(/\{(\w+)\}/g, (match, name) => (params[name] != null ? String(params[name]) : match));
  }
  return str;
}

export function runeDescription(rune) {
  if (!rune) {
    return "";
  }
  const key = `rune.${rune.id}.desc`;
  const localized = t(key);
  return localized === key ? (rune.description || "") : localized;
}

export function applyTranslations(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => {
    const value = t(el.getAttribute("data-i18n"));
    if (value != null) {
      el.textContent = value;
    }
  });
  root.querySelectorAll("[data-i18n-html]").forEach((el) => {
    const value = t(el.getAttribute("data-i18n-html"));
    if (value != null) {
      el.innerHTML = value;
    }
  });
  root.querySelectorAll("[data-i18n-attr]").forEach((el) => {
    el.getAttribute("data-i18n-attr").split(";").forEach((pair) => {
      const [attr, key] = pair.split(":");
      if (attr && key) {
        const value = t(key.trim());
        if (value != null) {
          el.setAttribute(attr.trim(), value);
        }
      }
    });
  });
}
