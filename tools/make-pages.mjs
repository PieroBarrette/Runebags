// Builds the site's static pages — about, rules, guide, runes, FAQ and print &
// play, in English and French — plus sitemap.xml, llms.txt and the route table
// the server reads (pages/routes.json). The pages are plain HTML, readable
// without JavaScript, so search engines and link previews see the real words.
//
// Everything a page states comes from the game itself: the rules and rune texts
// from js/i18n.js and js/runes/runeCatalog.js, the numbers and rune sets from
// the engine, the diagrams from js/ui/rulesFigures.js. Only the prose around
// them lives in tools/pages/content.mjs.
//
//   node tools/make-pages.mjs           write the files
//   node tools/make-pages.mjs --check   exit 1 if a committed file is stale
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runeDescription, runeName, setLang, t } from "../js/i18n.js";
import { INITIAL_SHOP_COUNTS, RUNE_CATALOG, createStarterBag } from "../js/runes/runeCatalog.js";
import {
  CORRUPTED_RUNES,
  CURSED_RUNES,
  NON_COMBINABLE_RUNES,
  POINT_POOL_TOTAL,
  STARTING_NEUTRAL_SUPPLY,
  getMajorityThreshold,
} from "../js/core/gameState.js";
import { NAMED_FIGURES, RUNE_FIGURES } from "../js/ui/rulesFigures.js";
import { START_RATING } from "../server/elo.mjs";
import { SITE } from "./pages/content.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE_URL = "https://runebags.ca";
const LANGS = ["en", "fr"];
const PAGE_KEYS = ["play", "rules", "guide", "runes", "faq", "print"];
const ROUTES = {
  play: { en: "/play/", fr: "/fr/jouer/" },
  rules: { en: "/rules/", fr: "/fr/regles/" },
  guide: { en: "/guide/", fr: "/fr/guide/" },
  runes: { en: "/runes/", fr: "/fr/runes/" },
  faq: { en: "/faq/", fr: "/fr/faq/" },
  print: { en: "/print-and-play/", fr: "/fr/imprimer/" },
};
const LEGAL = {
  privacy: { en: "/privacy/", fr: "/confidentialite/" },
  terms: { en: "/terms/", fr: "/conditions/" },
};
// The game opens in the page's language, whatever the browser's.
const GAME_URL = { en: "/?lang=en", fr: "/?lang=fr" };
const PRINT_FILES = [
  { key: "plateau", file: "runebags-plateau.pdf", lang: "fr" },
  { key: "aideMemoire", file: "runebags-aide-memoire.pdf", lang: "fr" },
  { key: "board", file: "runebags-board.pdf", lang: "en" },
  { key: "quickRef", file: "runebags-quick-reference.pdf", lang: "en" },
  { key: "labels", file: "runebags-etiquettes-avery-2309.pdf", lang: null },
];

const SPECIAL_RUNES = RUNE_CATALOG
  .filter((rune) => rune.type === "special")
  .sort((a, b) => a.name.localeCompare(b.name));
const AUTHOR = { "@type": "Person", name: "Piero Barrette" };

/* ------------------------------------------------------------------ build */

const outputs = await buildAll();

if (process.argv.includes("--check")) {
  const stale = [];
  for (const [file, content] of outputs) {
    const current = await fs.readFile(path.join(ROOT, file), "utf8").catch(() => null);
    if (current === null || normalize(current) !== normalize(content)) {
      stale.push(file);
    }
  }
  if (stale.length > 0) {
    console.error(`Stale or missing — run node tools/make-pages.mjs:\n  ${stale.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`All ${outputs.size} generated files are up to date.`);
} else {
  for (const [file, content] of outputs) {
    await fs.mkdir(path.dirname(path.join(ROOT, file)), { recursive: true });
    await fs.writeFile(path.join(ROOT, file), content);
  }
  console.log(`Wrote ${outputs.size} files.`);
}

async function buildAll() {
  const files = new Map();
  const routes = {};
  const printFiles = await describePrintFiles();

  for (const lang of LANGS) {
    for (const key of PAGE_KEYS) {
      const html = renderPage(lang, key, printFiles);
      const file = `pages/site${ROUTES[key][lang]}index.html`;
      files.set(file, html);
      routes[ROUTES[key][lang]] = file;
    }
  }

  files.set("pages/routes.json", `${JSON.stringify(routes, null, 2)}\n`);
  files.set("sitemap.xml", renderSitemap());
  files.set("llms.txt", renderLlms());
  return files;
}

/* ------------------------------------------------------------------ facts */

// The numbers and names the prose quotes, read from the engine.
function facts(lang) {
  setLang(lang);
  const starter = countById(createStarterBag());
  const shopTotal = Object.values(INITIAL_SHOP_COUNTS).reduce((sum, n) => sum + n, 0);
  const starterTotal = Object.values(starter).reduce((sum, n) => sum + n, 0);
  return {
    pool: POINT_POOL_TOTAL,
    goal: getMajorityThreshold({ tieRemovedPoints: 0 }),
    poolAfterDraw: POINT_POOL_TOTAL - 1,
    goalAfterDraw: getMajorityThreshold({ tieRemovedPoints: 1 }),
    neutrals: STARTING_NEUTRAL_SUPPLY,
    points: POINT_POOL_TOTAL,
    startRating: START_RATING,
    specialCount: SPECIAL_RUNES.length,
    cursed: listNames(lang, SPECIAL_RUNES.filter((rune) => CURSED_RUNES.has(rune.id))),
    corrupted: listNames(lang, SPECIAL_RUNES.filter((rune) => CORRUPTED_RUNES.has(rune.id))),
    level2: listNames(lang, SPECIAL_RUNES.filter((rune) => (rune.maxLevel || 1) >= 2)),
    starter: describeCounts(lang, starter),
    shopTotal,
    perPlayer: starterTotal + shopTotal,
    printUrl: ROUTES.print[lang],
    rulesUrl: ROUTES.rules[lang],
    guideUrl: ROUTES.guide[lang],
    runesUrl: ROUTES.runes[lang],
    privacyUrl: LEGAL.privacy[lang],
  };
}

function countById(runes) {
  const counts = {};
  runes.forEach((rune) => {
    counts[rune.id] = (counts[rune.id] || 0) + 1;
  });
  return counts;
}

// "6 basic runes, 2 Inguz and 2 Jera" / "6 runes de base, 2 Inguz et 2 Jera"
function describeCounts(lang, counts) {
  const parts = Object.entries(counts).map(([id, n]) => {
    if (id === "basic") {
      return lang === "fr" ? `${n} runes de base` : `${n} basic runes`;
    }
    return `${n} ${runeName(findRune(id))}`;
  });
  return joinList(lang, parts);
}

function listNames(lang, runes) {
  return joinList(lang, runes.map((rune) => runeName(rune)));
}

function joinList(lang, items) {
  if (items.length <= 1) {
    return items.join("");
  }
  return `${items.slice(0, -1).join(", ")} ${lang === "fr" ? "et" : "and"} ${items[items.length - 1]}`;
}

function findRune(id) {
  return RUNE_CATALOG.find((rune) => rune.id === id);
}

async function describePrintFiles() {
  const described = {};
  for (const entry of PRINT_FILES) {
    const data = await fs.readFile(path.join(ROOT, "assets", "print", entry.file));
    const pages = (data.toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
    described[entry.key] = { ...entry, bytes: data.length, pages };
  }
  return described;
}

/* ------------------------------------------------------------------ pages */

function renderPage(lang, key, printFiles) {
  const site = SITE[lang];
  const page = site.pages[key];
  const vars = facts(lang);
  setLang(lang);

  let heading = page.heading;
  let body = "";
  let jsonLd = [];
  if (key === "play") {
    body = fill(page.body, { ...vars, winFigure: figureSvg(NAMED_FIGURES["win-line"], lang === "fr" ? "Une ligne gagnante de quatre runes" : "A winning line of four runes") });
    jsonLd = [videoGameLd(lang, page)];
  } else if (key === "rules") {
    heading = t("rules.title");
    body = rulesBody(lang, page, vars);
    jsonLd = [howToLd(lang, page)];
  } else if (key === "guide") {
    body = fill(page.body, vars);
    jsonLd = [articleLd(lang, page, ROUTES.guide[lang])];
  } else if (key === "runes") {
    body = runesBody(lang, page, vars);
    jsonLd = [runeListLd(lang, page)];
  } else if (key === "faq") {
    body = page.items.map(([question, answer]) => `
<section class="faq-item">
  <h2>${esc(question)}</h2>
  <p>${fill(answer, vars)}</p>
</section>`).join("");
    jsonLd = [faqLd(lang, page, vars)];
  } else if (key === "print") {
    body = printBody(lang, page, vars, printFiles);
    jsonLd = [printLd(lang, page, printFiles)];
  }

  return layout({
    lang,
    key,
    title: page.title,
    description: page.description,
    heading,
    lede: fill(page.lede, vars),
    body,
    jsonLd,
  });
}

function rulesBody(lang, page, vars) {
  const p = (k) => `<p>${esc(t(k))}</p>`;
  const item = (k) => `<li>${esc(t(k).replace(/^(\d+\.|-)\s*/, ""))}</li>`;
  const colon = lang === "fr" ? " : " : ": ";
  const runeLines = SPECIAL_RUNES.map((rune) => `
<div class="rule-rune" id="${rune.id}">
  <p><img class="rule-rune-glyph" src="/assets/runes/${rune.id}.svg" alt="" width="28" height="28"><strong>${esc(runeName(rune))}</strong>${colon}${esc(t(`rules.rune.${rune.id}`))}</p>
  ${RUNE_FIGURES[rune.id] ? figureSvg(RUNE_FIGURES[rune.id], runeName(rune)) : ""}
</div>`).join("");

  return `
<h2>${esc(t("rules.s1h"))}</h2>
${p("rules.s1p1")}
${figureSvg(NAMED_FIGURES["win-line"], lang === "fr" ? "Une ligne gagnante de quatre runes" : "A winning line of four runes")}

<h2>${esc(t("rules.s2h"))}</h2>
<ol>${item("rules.s2p1")}${item("rules.s2p2")}</ol>

<h2>${esc(t("rules.s3h"))}</h2>
${p("rules.s3p1")}
<ul>${item("rules.s3p2")}${item("rules.s3p3")}${item("rules.s3p4")}</ul>

<h2>${esc(t("rules.s4h"))}</h2>
${p("rules.s4p1")}
${p("rules.s4p2")}
<ol>${item("rules.s4p3")}${item("rules.s4p4")}</ol>
${["rules.s4p5", "rules.s4p6", "rules.s4p7", "rules.s4p8", "rules.s4p9"].map(p).join("\n")}

<h2>${esc(t("rules.s5h"))}</h2>
${p("rules.s5p1")}

<h2>${esc(t("rules.s6h"))}</h2>
${p("rules.s6p1")}
${p("rules.s6p2")}

<h2>${esc(t("rules.s7h"))}</h2>
${p("rules.s7p1")}

<h2>${esc(t("rules.s8h"))}</h2>
${p("rules.s8p1")}

<h2>${esc(t("rules.s9h"))}</h2>
${p("rules.s9p1")}

<h2>${esc(t("rules.s10h"))}</h2>
<p>${fill(page.runesLink, vars)}</p>
${runeLines}`;
}

function runesBody(lang, page, vars) {
  const tags = page.tags;
  const plain = ["basic", "neutral"].map((id) => {
    const rune = findRune(id);
    return `
<article class="rune-entry" id="${id}">
  <div class="rune-entry-head">
    <span class="rune-entry-chip rune-entry-chip-${id === "neutral" ? "neutral" : "plain"}" aria-hidden="true"></span>
    <h3>${esc(runeName(rune))}</h3>
  </div>
  <p>${esc(runeDescription(rune))}</p>
</article>`;
  }).join("");

  const special = SPECIAL_RUNES.map((rune) => {
    const labels = [];
    if (CURSED_RUNES.has(rune.id)) labels.push(tags.cursed);
    if (CORRUPTED_RUNES.has(rune.id)) labels.push(tags.corrupted);
    if (rune.etherealAtLevels) {
      labels.push((rune.maxLevel || 1) >= 2 && rune.etherealAtLevels.length === 1 ? tags.etherealLevel1 : tags.ethereal);
    }
    if ((rune.maxLevel || 1) >= 2) labels.push(tags.level2);
    if (NON_COMBINABLE_RUNES.has(rune.id)) labels.push(tags.notCombinable);
    if (rune.columnRule === "center-only") labels.push(tags.centre);
    if (rune.columnRule === "edge-only") labels.push(tags.edges);

    const starterCount = countById(createStarterBag())[rune.id];
    const supply = INITIAL_SHOP_COUNTS[rune.id]
      ? fill(page.inShop, { count: INITIAL_SHOP_COUNTS[rune.id] })
      : starterCount ? fill(page.inStarter, { count: starterCount }) : "";
    const shopEffect = CURSED_RUNES.has(rune.id)
      ? `<p class="rune-entry-note">${esc(t("rune.shopEffect"))}</p>`
      : "";

    return `
<article class="rune-entry" id="${rune.id}">
  <div class="rune-entry-head">
    <img class="rune-entry-glyph" src="/assets/runes/${rune.id}.svg" alt="" width="40" height="40">
    <h3>${esc(runeName(rune))}</h3>
  </div>
  ${labels.length > 0 ? `<ul class="rune-tags">${labels.map((label) => `<li>${esc(label)}</li>`).join("")}</ul>` : ""}
  <p>${esc(runeDescription(rune))}</p>
  ${shopEffect}
  ${supply ? `<p class="rune-entry-note">${esc(supply)}</p>` : ""}
  ${RUNE_FIGURES[rune.id] ? figureSvg(RUNE_FIGURES[rune.id], runeName(rune)) : ""}
</article>`;
  }).join("");

  const index = SPECIAL_RUNES.map((rune) => `<a href="#${rune.id}">${esc(runeName(rune))}</a>`).join(" ");
  return `
<nav class="rune-index" aria-label="${esc(page.heading)}">${index}</nav>
<h2>${esc(page.plainHeading)}</h2>
${plain}
<h2>${esc(fill(page.powersHeading, vars))}</h2>
${special}`;
}

function printBody(lang, page, vars, printFiles) {
  const order = [...PRINT_FILES].sort((a, b) => rank(a) - rank(b));
  function rank(entry) {
    if (entry.lang === lang) return 0;
    if (entry.lang === null) return 2;
    return 1;
  }
  const rows = order.map((entry) => {
    const info = printFiles[entry.key];
    const pages = info.pages === 1 ? page.page : fill(page.pages, { n: info.pages });
    return `<li><a href="/assets/print/${entry.file}" download>${esc(page.files[entry.key])}</a> <span class="file-meta">PDF · ${esc(pages)} · ${formatSize(lang, info.bytes)}</span></li>`;
  }).join("\n  ");

  const supply = Object.entries(INITIAL_SHOP_COUNTS)
    .map(([id, n]) => [runeName(findRune(id)), n])
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, n]) => `<li>${esc(name)} <span class="supply-count">× ${n}</span></li>`)
    .join("");

  return `
<h2>${esc(page.filesHeading)}</h2>
<ul class="file-list">
  ${rows}
</ul>

<h2>${esc(page.needHeading)}</h2>
${fill(page.need, vars)}

<h3>${esc(page.supplyHeading)}</h3>
<ul class="supply-list">${supply}</ul>

<h2>${esc(page.setupHeading)}</h2>
${fill(page.setup, vars)}`;
}

function formatSize(lang, bytes) {
  const kb = Math.round(bytes / 1024);
  return lang === "fr" ? `${kb} Ko` : `${kb} KB`;
}

/* --------------------------------------------------------------- diagrams */

// The rule diagrams as inline SVG: the same data the game's Rules screen
// draws with board cells, so the two can never disagree.
function figureSvg(spec, label) {
  const size = 40;
  const columns = 7;
  // The board is the game's engraved plate: a double rule round it, which
  // takes a margin.
  const pad = 6;
  const boardWidth = columns * size;
  const boardHeight = spec.rows * size;
  const width = boardWidth + pad * 2;
  const height = boardHeight + pad * 2;
  const parts = [
    `<rect class="fig-frame" x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="4"/>`,
    `<g transform="translate(${pad} ${pad})">`,
    `<rect class="fig-board" x="0" y="0" width="${boardWidth}" height="${boardHeight}" rx="2"/>`,
  ];

  (spec.forcedColumns || []).forEach((column) => {
    parts.push(`<rect class="fig-forced" x="${column * size}" y="0" width="${size}" height="${boardHeight}"/>`);
  });
  for (let column = 1; column < columns; column += 1) {
    parts.push(`<line class="fig-grid" x1="${column * size}" y1="0" x2="${column * size}" y2="${boardHeight}"/>`);
  }
  for (let row = 1; row < spec.rows; row += 1) {
    parts.push(`<line class="fig-grid" x1="0" y1="${row * size}" x2="${boardWidth}" y2="${row * size}"/>`);
  }

  spec.cells.forEach((cell) => {
    const cx = cell.c * size + size / 2;
    const cy = cell.r * size + size / 2;
    const owner = cell.owner === 1 ? "fig-black" : cell.owner === 2 ? "fig-white" : "fig-neutral";
    const classes = ["fig-piece", owner];
    if (cell.fading) classes.push("fig-fading");
    parts.push(`<circle class="${classes.join(" ")}" cx="${cx}" cy="${cy}" r="14"/>`);
    if (cell.win) {
      parts.push(`<circle class="fig-win" cx="${cx}" cy="${cy}" r="17.5"/>`);
    }
    if (cell.runeId) {
      const glyphClass = cell.owner === 1 ? "fig-glyph fig-glyph-light" : "fig-glyph";
      parts.push(`<image class="${glyphClass}" href="/assets/runes/${cell.runeId}.svg" x="${cx - 9}" y="${cy - 9}" width="18" height="18"/>`);
    }
  });
  parts.push("</g>");

  return `<figure class="rule-figure"><svg viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="${esc(label)}">${parts.join("")}</svg></figure>`;
}

/* ------------------------------------------------------------------ layout */

function layout({ lang, key, title, description, heading, lede, body, jsonLd }) {
  const site = SITE[lang];
  const other = lang === "fr" ? "en" : "fr";
  const url = `${SITE_URL}${ROUTES[key][lang]}`;
  const navLinks = PAGE_KEYS.map((pageKey) => {
    const current = pageKey === key ? ' aria-current="page"' : "";
    return `<a href="${ROUTES[pageKey][lang]}"${current}>${esc(site.nav[pageKey])}</a>`;
  }).join("\n      ");
  const readNext = PAGE_KEYS.filter((pageKey) => pageKey !== key)
    .map((pageKey) => `<li><a href="${ROUTES[pageKey][lang]}">${esc(site.nav[pageKey])}</a></li>`)
    .join("");
  const ldBlocks = jsonLd
    .map((data) => `  <script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n  </script>`)
    .join("\n");

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="theme-color" content="#eee4cd">
  <link rel="canonical" href="${url}">
  <link rel="alternate" hreflang="en" href="${SITE_URL}${ROUTES[key].en}">
  <link rel="alternate" hreflang="fr" href="${SITE_URL}${ROUTES[key].fr}">
  <link rel="alternate" hreflang="x-default" href="${SITE_URL}${ROUTES[key].en}">
  <meta property="og:type" content="${key === "play" ? "website" : "article"}">
  <meta property="og:site_name" content="RuneBags">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:locale" content="${site.locale}">
  <meta property="og:locale:alternate" content="${SITE[other].locale}">
  <meta property="og:image" content="${SITE_URL}/assets/og-image.jpg">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${SITE_URL}/assets/og-image.jpg">
  <link rel="icon" type="image/svg+xml" href="/assets/RuneBags_Logo.svg">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=Space+Grotesk:wght@400;600&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/styles/page.css">
  <script>
    // The theme chosen in the game, before first paint.
    try {
      if (localStorage.getItem("runebags-theme-v1") === "dark") {
        document.documentElement.setAttribute("data-theme", "dark");
      }
    } catch (e) { /* private mode: keep the parchment default */ }
  </script>
${ldBlocks}
</head>
<body>
  <header class="site-header">
    <a class="page-brand" href="${GAME_URL[lang]}"><img src="/assets/RuneBags_Logo.svg" alt="" width="40" height="40">RuneBags</a>
    <div class="site-header-actions">
      <a class="site-lang" href="${ROUTES[key][other]}" hreflang="${other}" lang="${other}">${esc(site.otherLanguage)}</a>
      <a class="page-cta site-play" href="${GAME_URL[lang]}">${esc(site.playNow)}</a>
    </div>
    <nav class="site-nav" aria-label="${esc(site.navLabel)}">
      ${navLinks}
    </nav>
  </header>

  <main class="page">
    <h1>${esc(heading)}</h1>
    <p class="page-lede">${lede}</p>
${body}
  </main>

  <section class="page page-cta-box">
    <h2>${esc(site.ctaTitle)}</h2>
    <p>${esc(site.ctaText)}</p>
    <a class="page-cta" href="${GAME_URL[lang]}">${esc(site.ctaButton)}</a>
    <h3>${esc(site.seeAlso)}</h3>
    <ul class="read-next">${readNext}</ul>
  </section>

  <footer class="page-footer">
    <nav aria-label="${esc(site.footerLabel)}">
      <a href="${LEGAL.privacy[lang]}">${esc(site.privacy)}</a>
      <a href="${LEGAL.terms[lang]}">${esc(site.terms)}</a>
      <a href="mailto:info@hexaequo.com">info@hexaequo.com</a>
      <a href="https://hexaequo.com/">${esc(site.sameCreator)}</a>
    </nav>
    <p>${esc(site.credit)}</p>
  </footer>
</body>
</html>
`;
}

/* -------------------------------------------------------- structured data */

function videoGameLd(lang, page) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "RuneBags",
    url: `${SITE_URL}/`,
    description: page.description,
    inLanguage: LANGS,
    genre: ["Board game", "Strategy game"],
    gamePlatform: "Web browser",
    applicationCategory: "Game",
    operatingSystem: "Any",
    playMode: ["SinglePlayer", "MultiPlayer"],
    numberOfPlayers: { "@type": "QuantitativeValue", minValue: 2, maxValue: 2 },
    image: `${SITE_URL}/assets/og-image.jpg`,
    author: AUTHOR,
    offers: { "@type": "Offer", price: 0, priceCurrency: "CAD" },
  };
}

// Every step is a whole sentence the reader can act on: a step cut short
// before its list is worse than no structured data at all.
function howToLd(lang, page) {
  setLang(lang);
  const strip = (key) => t(key).replace(/^(\d+\.|-)\s*/, "");
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    name: page.howToName,
    inLanguage: lang,
    step: [
      { "@type": "HowToStep", name: strip("rules.s1h"), text: t("rules.s1p1") },
      {
        "@type": "HowToStep",
        name: strip("rules.s3h"),
        text: [t("rules.s3p1"), strip("rules.s3p2"), strip("rules.s3p3"), strip("rules.s3p4")].join(" "),
      },
      {
        "@type": "HowToStep",
        name: strip("rules.s4h"),
        text: [t("rules.s4p1"), t("rules.s4p2"), strip("rules.s4p3"), strip("rules.s4p4"), t("rules.s4p9")].join(" "),
      },
      { "@type": "HowToStep", name: strip("rules.s5h"), text: t("rules.s5p1") },
    ],
  };
}

function articleLd(lang, page, route) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.heading,
    description: page.description,
    inLanguage: lang,
    url: `${SITE_URL}${route}`,
    author: AUTHOR,
    about: { "@type": "VideoGame", name: "RuneBags", url: `${SITE_URL}/` },
  };
}

function runeListLd(lang, page) {
  setLang(lang);
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: page.listName,
    numberOfItems: SPECIAL_RUNES.length,
    itemListElement: SPECIAL_RUNES.map((rune, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: runeName(rune),
      description: runeDescription(rune),
      url: `${SITE_URL}${ROUTES.runes[lang]}#${rune.id}`,
    })),
  };
}

function faqLd(lang, page, vars) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    inLanguage: lang,
    mainEntity: page.items.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: fill(answer, vars).replace(/<[^>]+>/g, "") },
    })),
  };
}

function printLd(lang, page, printFiles) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: page.heading,
    description: page.description,
    inLanguage: lang,
    url: `${SITE_URL}${ROUTES.print[lang]}`,
    author: AUTHOR,
    associatedMedia: PRINT_FILES.map((entry) => ({
      "@type": "MediaObject",
      name: page.files[entry.key],
      contentUrl: `${SITE_URL}/assets/print/${entry.file}`,
      encodingFormat: "application/pdf",
      contentSize: `${printFiles[entry.key].bytes}`,
    })),
  };
}

/* ---------------------------------------------------- sitemap and llms.txt */

function renderSitemap() {
  const entries = [`  <url>\n    <loc>${SITE_URL}/</loc>\n  </url>`];
  for (const key of PAGE_KEYS) {
    for (const lang of LANGS) {
      entries.push(`  <url>
    <loc>${SITE_URL}${ROUTES[key][lang]}</loc>
    <xhtml:link rel="alternate" hreflang="en" href="${SITE_URL}${ROUTES[key].en}"/>
    <xhtml:link rel="alternate" hreflang="fr" href="${SITE_URL}${ROUTES[key].fr}"/>
    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_URL}${ROUTES[key].en}"/>
  </url>`);
    }
  }
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${entries.join("\n")}
</urlset>
`;
}

function renderLlms() {
  const en = SITE.en;
  const vars = facts("en");
  const lines = PAGE_KEYS.map((key) => `- [${en.pages[key].title.replace(/ — RuneBags$/, "")}](${SITE_URL}${ROUTES[key].en}): ${en.pages[key].description}`);
  const french = PAGE_KEYS.map((key) => `- [${SITE.fr.pages[key].title.replace(/ — RuneBags$/, "")}](${SITE_URL}${ROUTES[key].fr})`);
  return `# RuneBags

> A free tactics board game for two players, played in a web browser. Players
> drop runes into a board of seven columns and six rows; four of a player's
> runes in a line win the round and a point. Between rounds, each player builds
> their own bag of runes in a shop. No account required, no advertising.

Each player draws two runes from their own bag; the opponent never sees them.
On a turn, a player drops one rune into a column, applies its power if it has
one, and draws back up. A line of four wins the round and one point from a
shared pool of ${vars.pool}; the first player to hold the majority of the points
still in play wins the game (${vars.goal} of ${vars.pool} at the start; a drawn
round takes a point out of play, so ${vars.goalAfterDraw} of
${vars.poolAfterDraw} after one draw). Between rounds, each player may add up to two
runes from a shop offer, remove one, or combine two identical runes into a
level-2 rune. ${vars.specialCount} runes have powers; some are cursed or
corrupted, which slips neutral runes into their owner's bag.

It can be played against the computer at five levels, online with a friend by
room code, link or QR code, as rated games matched by Elo rating, or at the
table with a free print-and-play kit. Against the computer a move can be taken
back, and each finished game reviewed move by move, with an accuracy score and
the turning point. Created by Piero Barrette, in Quebec.

## Pages

${lines.join("\n")}
- [The game itself](${SITE_URL}/): the playable application.

## In French

${french.join("\n")}

## Optional

- [Privacy policy](${SITE_URL}${LEGAL.privacy.en})
- [Terms of use](${SITE_URL}${LEGAL.terms.en})
`;
}

/* ----------------------------------------------------------------- helpers */

function fill(template, vars) {
  return String(template).replace(/\{(\w+)\}/g, (match, name) => (vars[name] != null ? String(vars[name]) : match));
}

function esc(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function normalize(text) {
  return text.replace(/\r\n/g, "\n");
}
