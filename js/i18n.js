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
