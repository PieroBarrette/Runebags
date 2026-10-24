// The words of the site's own pages, in both languages; tools/make-pages.mjs
// turns them into the static pages. The rules and the rune texts are not here:
// they come from js/i18n.js and js/runes/runeCatalog.js, the words the game
// itself shows. A {placeholder} is filled from the engine (point pool, rune
// sets, starting rating…), so a page never states a number the game does not
// play by.
export const SITE = {
  en: {
    locale: "en_CA",
    nav: {
      play: "About",
      rules: "Rules",
      guide: "Guide",
      runes: "Runes",
      faq: "FAQ",
      print: "Print & play",
    },
    playNow: "Play",
    ctaTitle: "Ready for a round?",
    ctaText: "Free, in your browser, no account needed.",
    ctaButton: "Play RuneBags",
    otherLanguage: "Français",
    navLabel: "Site sections",
    footerLabel: "Site links",
    privacy: "Privacy",
    terms: "Terms of use",
    credit: "A game created by Piero Barrette",
    sameCreator: "Hexaequo, by the same creator",
    seeAlso: "Read next",

    pages: {
      play: {
        title: "RuneBags — a free runic tactics board game for two",
        description: "Drop runes into a seven-column board, line up four to win the round, and build a bag of runes that bend the rules. Free, no ads, no account needed: play the computer or a friend online.",
        heading: "RuneBags",
        lede: `A tactics game for two, played in your browser. Drop runes into a seven-column board and line up four of yours to win the round — then, between rounds, build a bag of runes whose powers bend the rules.`,
        body: `
<h2>How a game goes</h2>
<ol>
  <li>Each player draws two runes from their own bag. In turn, you drop one into a column: it falls to the lowest free cell.</li>
  <li>Line up four of your runes — across, down or diagonally — to win the round and take a point from the shared pool of {pool} points.</li>
  <li>Between rounds, visit the shop: add runes to your bag, remove one, or combine two identical runes into a stronger one.</li>
</ol>
<p>The first player to hold the majority of the points still in the pool wins the game.</p>
{winFigure}

<h2>What makes it different</h2>
<ul>
  <li><strong>Hidden hands.</strong> Your opponent never sees the two runes you hold — unless Uruz is on the board. Bluff, bait, then strike.</li>
  <li><strong>A bag that grows.</strong> Like a deck you build as you play, your bag decides what you draw next.</li>
  <li><strong>{specialCount} rune powers.</strong> Push a column up from below, take a second turn, copy a power, anchor a rune that nothing can move: each rune bends the board its own way.</li>
  <li><strong>Power has a price.</strong> Cursed and corrupted runes are strong, but they slip neutral runes into your bag, and neutral runes clog your hand.</li>
</ul>

<h2>Four ways to play</h2>
<ul>
  <li><strong>Against the computer</strong>, at five levels from Easy to Expert. No level sees your hand: each one weighs the hands you might be holding.</li>
  <li><strong>With a friend online</strong>: share a room code, a link or a QR code.</li>
  <li><strong>Ranked</strong>: quick play and challenges between accounts move an Elo rating, with a ten-minute clock. An account needs only an email address — no password.</li>
  <li><strong>At the table</strong>, with the free <a href="{printUrl}">print-and-play kit</a>.</li>
</ul>

<h2>Free, and made in Quebec</h2>
<p>RuneBags is free, with no advertising and nothing to buy. It is made by Piero Barrette, who also created <a href="https://hexaequo.com/">Hexaequo</a>, a strategy game for two.</p>`,
      },

      rules: {
        title: "Rules — RuneBags",
        description: "The complete rules of RuneBags: the goal, the shop phase, the round phase, the end of the game, neutral, cursed, corrupted and ethereal runes, and every rune's effect.",
        lede: `Everything the game enforces, in order. New to RuneBags? The <a href="{guideUrl}">beginner's guide</a> is a gentler start.`,
        runesLink: `Each rune in detail, with its level-2 effect, is on the <a href="{runesUrl}">runes page</a>.`,
        howToName: "How to play RuneBags",
      },

      guide: {
        title: "Beginner's guide — RuneBags",
        description: "Your first round, five tips to win more often, the mistakes beginners make, and how the computer's five levels differ.",
        heading: "Beginner's guide",
        lede: `Everything you need for your first games, and a few habits that win more of them.`,
        body: `
<h2>Your first round</h2>
<p>Your first game against the computer starts gently: you play first, at the Easy level, and the shop waits until round two. Round one is played with the starting bags only: {starter} each.</p>
<ul>
  <li>Tap a rune in your hand, then a column. The rune falls to the lowest free cell of that column; a column holds six runes.</li>
  <li>Inguz can only go in the centre column, and Jera only in the two edge columns: when you pick one, the columns it may use light up.</li>
  <li>Four of your runes in a line — across, down or diagonally — win the round and one point.</li>
</ul>

<h2>Five tips</h2>
<ol>
  <li><strong>Think in threats.</strong> As in any line-up game, block every three-in-a-row your opponent builds, and look for the move that makes two threats at once: they can only block one.</li>
  <li><strong>Play the centre.</strong> More lines run through the middle columns than through the edges. Keep Jera for the edges and Inguz for the centre, where they block or finish a line.</li>
  <li><strong>Use the hidden hand.</strong> Your opponent cannot see your two runes. A strong rune kept in hand is a threat they have to play around.</li>
  <li><strong>Shop with the price in mind.</strong> Cursed runes ({cursed}) slip a neutral rune into your bag when you buy them; corrupted runes ({corrupted}) do it every time you play them. Neutral runes score nothing and clog your hand.</li>
  <li><strong>Shape your bag.</strong> Removing a basic rune means you draw your powers more often. Combining two identical runes makes a level-2 rune — worth it for the runes that have a level-2 effect: {level2}.</li>
</ol>

<h2>Mistakes beginners make</h2>
<ul>
  <li><strong>Giving away the cell above.</strong> The rune you drop becomes the floor for the next one. Before you play, check what your opponent could finish on top of it.</li>
  <li><strong>Buying every curse.</strong> A few neutral runes in your bag mean whole turns where your hand can do very little.</li>
  <li><strong>Forgetting Perth.</strong> After your opponent's Perth, your next rune must go in a column next to the Perth's.</li>
  <li><strong>Counting on removing a Laguz.</strong> Nothing moves or removes it, so a line that leans on it is there to stay.</li>
  <li><strong>Losing track of the score.</strong> You need the majority of the points still in play ({goal} at the start), and every drawn round lowers it.</li>
</ul>

<h2>The computer's five levels</h2>
<p>Every level plays the same way: none sees your hand or the runes you will draw, and each one weighs the hands you might be holding instead. What changes is how often it misses its best move: often at Easy, never at Expert. In our tests, over a hundred games per level, each level beat the one below it about two games out of three.</p>
<p>Start at Easy, then move up a level once you win most of your games.</p>`,
      },

      runes: {
        title: "The runes — RuneBags",
        description: "Every rune of RuneBags: its power, its level-2 effect, whether it is cursed, corrupted or ethereal, and a diagram of what it does.",
        heading: "The runes",
        lede: `Every rune has a power. Some are <strong>cursed</strong> (a neutral rune enters your bag when you buy them), <strong>corrupted</strong> (one enters each time you play them) or <strong>ethereal</strong> (they go back to the shop at the end of the round). In the shop, two identical runes combine into a level-2 rune; it only changes anything for the runes that have a level-2 effect.`,
        plainHeading: "The plain runes",
        powersHeading: "The {specialCount} runes with a power",
        tags: {
          cursed: "Cursed",
          corrupted: "Corrupted",
          ethereal: "Ethereal",
          etherealLevel1: "Ethereal at level 1",
          level2: "Level 2",
          notCombinable: "Not combinable",
          centre: "Centre column only",
          edges: "Edge columns only",
        },
        inShop: "In each player's shop supply: {count}",
        inStarter: "In each starting bag: {count}",
        listName: "The runes of RuneBags",
      },

      faq: {
        title: "FAQ — RuneBags",
        description: "Is RuneBags free, do you need an account, how to play a friend, how ranked games and the computer's levels work, and more.",
        heading: "Questions and answers",
        lede: `The questions people ask most about RuneBags.`,
        items: [
          ["Is RuneBags free?", "Yes. RuneBags is free, with no advertising and nothing to buy."],
          ["Do I need an account?", "No. You can play the computer and your friends without one. An account keeps your statistics across devices, gives you a rating and a public profile, and lets you challenge other players. It only needs an email address: you sign in with a one-time link, and there is no password."],
          ["How do I play with a friend?", "Choose Play online, then Play with a friend. You get a room code, a link and a QR code to send. Games in a room are friendly: they don't change anyone's rating."],
          ["How do ranked games work?", "Quick play pairs you with a player of a similar rating, and challenges can be ranked too; both players need an account. Everyone starts at an Elo rating of {startRating}, and each player has ten minutes on the clock."],
          ["How strong is the computer?", "There are five levels, from Easy to Expert. None of them sees your hand or the runes you will draw. In our tests, each level beat the one below it about two games out of three."],
          ["Can I play on my phone?", "Yes, in the browser of any phone, tablet or computer. You can also install RuneBags on your home screen: the home page offers it when your browser allows it."],
          ["Can I play at the table?", "Yes. The free <a href=\"{printUrl}\">print-and-play kit</a> has the board, a quick reference and labels for the tokens."],
          ["How long does a game last?", "A round takes a few minutes. A game is played over several rounds, until one player holds the majority of the points still in play."],
          ["Which languages is it in?", "French and English. The game follows your browser's language; you can change it in Settings or at the bottom of the home page."],
          ["Who makes RuneBags?", "Piero Barrette, in Quebec, who also created <a href=\"https://hexaequo.com/\">Hexaequo</a>, a strategy game for two."],
          ["What do you do with my data?", "As little as possible: no cookies, no advertising, and visits are only counted as anonymous daily totals. The <a href=\"{privacyUrl}\">privacy policy</a> has the details."],
        ],
      },

      print: {
        title: "Print and play — RuneBags",
        description: "Play RuneBags at the table: download the free board, quick reference and token labels, and see what you need.",
        heading: "Print and play",
        lede: `RuneBags also plays at the table. Print the board and a quick reference, stick the labels on round tokens, and grab two bags.`,
        filesHeading: "The files",
        files: {
          board: "Board",
          plateau: "Board (French)",
          quickRef: "Quick reference",
          aideMemoire: "Quick reference (French)",
          labels: "Token labels, for Avery 2309 sheets",
        },
        pages: "{n} pages",
        page: "1 page",
        needHeading: "What you need",
        need: `
<ul>
  <li>the board, printed (seven columns, six rows);</li>
  <li>for each player, Black and White: {perPlayer} runes — the starting bag ({starter}) and the shop supply ({shopTotal} runes, listed below);</li>
  <li>{neutrals} neutral runes, grey;</li>
  <li>{points} point tokens;</li>
  <li>two bags, one per player.</li>
</ul>
<p>Any round tokens in black, white and grey will do; the labels give them their symbols.</p>`,
        supplyHeading: "Each player's shop supply",
        setupHeading: "Setting up",
        setup: `
<ol>
  <li>Each player puts their starting runes in their bag ({starter}).</li>
  <li>Each player keeps their shop supply within reach; in each shop phase, they reveal five of those runes at random.</li>
  <li>The {neutrals} neutral runes and the {points} point tokens form the shared supply.</li>
  <li>Then follow the <a href="{rulesUrl}">rules</a>: every round starts with the shop.</li>
</ol>`,
      },
    },
  },

  fr: {
    locale: "fr_CA",
    nav: {
      play: "Le jeu",
      rules: "Règles",
      guide: "Guide",
      runes: "Les runes",
      faq: "FAQ",
      print: "Imprimer et jouer",
    },
    playNow: "Jouer",
    ctaTitle: "Prêt pour une manche ?",
    ctaText: "Gratuit, dans votre navigateur, sans compte.",
    ctaButton: "Jouer à RuneBags",
    otherLanguage: "English",
    navLabel: "Sections du site",
    footerLabel: "Liens du site",
    privacy: "Confidentialité",
    terms: "Conditions d'utilisation",
    credit: "Un jeu créé par Piero Barrette",
    sameCreator: "Hexaequo, du même créateur",
    seeAlso: "À lire ensuite",

    pages: {
      play: {
        title: "RuneBags — un jeu de tactique runique gratuit pour deux",
        description: "Faites tomber des runes dans un plateau de sept colonnes, alignez-en quatre pour gagner la manche et construisez un sac de runes qui plient les règles. Gratuit, sans publicité, sans compte : contre l'ordinateur ou un ami en ligne.",
        heading: "RuneBags",
        lede: `Un jeu de tactique pour deux, dans votre navigateur. Faites tomber des runes dans un plateau de sept colonnes et alignez-en quatre pour gagner la manche — puis, entre les manches, construisez un sac de runes dont les pouvoirs plient les règles.`,
        body: `
<h2>Le déroulement d'une partie</h2>
<ol>
  <li>Chaque joueur pige deux runes dans son propre sac. À tour de rôle, vous en faites tomber une dans une colonne : elle descend jusqu'à la plus basse case libre.</li>
  <li>Alignez quatre de vos runes — en ligne, en colonne ou en diagonale — pour gagner la manche et prendre un point dans la réserve commune de {pool} points.</li>
  <li>Entre les manches, passez à la boutique : ajoutez des runes à votre sac, retirez-en une, ou combinez deux runes identiques en une plus forte.</li>
</ol>
<p>Le premier joueur à détenir la majorité des points encore en jeu gagne la partie.</p>
{winFigure}

<h2>Ce qui le rend unique</h2>
<ul>
  <li><strong>Des mains cachées.</strong> Votre adversaire ne voit jamais les deux runes que vous tenez — sauf si Uruz est sur le plateau. Bluffez, appâtez, puis frappez.</li>
  <li><strong>Un sac qui évolue.</strong> Comme un paquet de cartes qu'on construit en jouant, votre sac décide de ce que vous pigerez ensuite.</li>
  <li><strong>{specialCount} pouvoirs.</strong> Pousser une colonne par le bas, jouer deux fois de suite, copier un pouvoir, ancrer une rune que rien ne déplace : chaque rune plie le plateau à sa façon.</li>
  <li><strong>Le pouvoir a un prix.</strong> Les runes maudites et corrompues sont fortes, mais elles glissent dans votre sac des runes neutres, qui encombrent votre main.</li>
</ul>

<h2>Quatre façons de jouer</h2>
<ul>
  <li><strong>Contre l'ordinateur</strong>, sur cinq niveaux, de Facile à Expert. Aucun niveau ne voit votre main : chacun évalue les mains que vous pourriez tenir.</li>
  <li><strong>Avec un ami en ligne</strong> : partagez un code de salle, un lien ou un code QR.</li>
  <li><strong>En classé</strong> : les parties rapides et les défis entre comptes font évoluer une cote Elo, avec une horloge de dix minutes. Un compte ne demande qu'une adresse courriel, sans mot de passe.</li>
  <li><strong>Sur table</strong>, avec la <a href="{printUrl}">trousse gratuite à imprimer</a>.</li>
</ul>

<h2>Gratuit, et fait au Québec</h2>
<p>RuneBags est gratuit, sans publicité et sans achat. Il est créé par Piero Barrette, qui a aussi créé <a href="https://hexaequo.com/">Hexaequo</a>, un jeu de stratégie pour deux.</p>`,
      },

      rules: {
        title: "Règles — RuneBags",
        description: "Les règles complètes de RuneBags : le but, la phase de boutique, la phase d'affrontement, la fin de partie, les runes neutres, maudites, corrompues et éthérées, et l'effet de chaque rune.",
        lede: `Tout ce que le jeu applique, dans l'ordre. Vous découvrez RuneBags ? Le <a href="{guideUrl}">guide du débutant</a> est une entrée en matière plus douce.`,
        runesLink: `Chaque rune en détail, avec son effet de niveau 2, se trouve sur la <a href="{runesUrl}">page des runes</a>.`,
        howToName: "Comment jouer à RuneBags",
      },

      guide: {
        title: "Guide du débutant — RuneBags",
        description: "Votre première manche, cinq conseils pour gagner plus souvent, les erreurs de débutant et ce qui distingue les cinq niveaux de l'ordinateur.",
        heading: "Guide du débutant",
        lede: `Tout ce qu'il faut pour vos premières parties, et quelques habitudes qui en font gagner davantage.`,
        body: `
<h2>Votre première manche</h2>
<p>Votre première partie contre l'ordinateur commence en douceur : vous jouez en premier, au niveau Facile, et la boutique attend la deuxième manche. La première manche se joue donc avec les sacs de départ seulement : {starter} chacun.</p>
<ul>
  <li>Touchez une rune de votre main, puis une colonne. La rune tombe jusqu'à la plus basse case libre ; une colonne contient six runes.</li>
  <li>Inguz ne se joue que dans la colonne du centre, et Jera que dans les deux colonnes du bord : quand vous en choisissez une, les colonnes permises s'illuminent.</li>
  <li>Quatre de vos runes alignées — en ligne, en colonne ou en diagonale — gagnent la manche et un point.</li>
</ul>

<h2>Cinq conseils</h2>
<ol>
  <li><strong>Pensez en menaces.</strong> Comme dans tout jeu d'alignement, bloquez chaque ligne de trois que votre adversaire construit, et cherchez le coup qui crée deux menaces à la fois : il ne pourra en bloquer qu'une.</li>
  <li><strong>Jouez au centre.</strong> Plus de lignes passent par les colonnes du milieu que par les bords. Gardez Jera pour les bords et Inguz pour le centre, là où elles bloquent ou complètent une ligne.</li>
  <li><strong>Profitez de la main cachée.</strong> Votre adversaire ne voit pas vos deux runes : une rune forte gardée en main est une menace qu'il doit contourner.</li>
  <li><strong>Magasinez en pensant au prix.</strong> Les runes maudites ({cursed}) glissent une rune neutre dans votre sac quand vous les achetez ; les runes corrompues ({corrupted}) le font chaque fois que vous les jouez. Les runes neutres ne marquent rien et encombrent votre main.</li>
  <li><strong>Façonnez votre sac.</strong> Retirer une rune de base vous fait piger vos pouvoirs plus souvent. Combiner deux runes identiques donne une rune de niveau 2 — utile pour les runes qui ont un effet de niveau 2 : {level2}.</li>
</ol>

<h2>Les erreurs de débutant</h2>
<ul>
  <li><strong>Offrir la case du dessus.</strong> La rune que vous jouez sert de plancher à la suivante. Avant de jouer, vérifiez ce que votre adversaire pourrait compléter par-dessus.</li>
  <li><strong>Acheter toutes les malédictions.</strong> Quelques runes neutres dans votre sac, et ce sont des tours entiers où votre main ne peut presque rien.</li>
  <li><strong>Oublier Perth.</strong> Après le Perth de votre adversaire, votre prochaine rune doit aller dans une colonne voisine de celle du Perth.</li>
  <li><strong>Compter retirer une Laguz.</strong> Rien ne la déplace ni ne la retire : une ligne qui s'appuie dessus est là pour rester.</li>
  <li><strong>Perdre le score de vue.</strong> Il faut la majorité des points encore en jeu ({goal} au départ), et chaque manche nulle abaisse ce total.</li>
</ul>

<h2>Les cinq niveaux de l'ordinateur</h2>
<p>Tous les niveaux jouent de la même façon : aucun ne voit votre main ni les runes que vous allez piger, et chacun évalue plutôt les mains que vous pourriez tenir. Ce qui change, c'est la fréquence à laquelle il rate son meilleur coup : souvent au niveau Facile, jamais au niveau Expert. Dans nos tests, sur cent parties par niveau, chaque niveau a battu le précédent environ deux fois sur trois.</p>
<p>Commencez au niveau Facile, puis montez d'un niveau quand vous gagnez la plupart de vos parties.</p>`,
      },

      runes: {
        title: "Les runes — RuneBags",
        description: "Toutes les runes de RuneBags : leur pouvoir, leur effet de niveau 2, si elles sont maudites, corrompues ou éthérées, et un schéma de ce qu'elles font.",
        heading: "Les runes",
        lede: `Chaque rune a un pouvoir. Certaines sont <strong>maudites</strong> (une rune neutre entre dans votre sac quand vous les achetez), <strong>corrompues</strong> (une rune neutre y entre chaque fois que vous les jouez) ou <strong>éthérées</strong> (elles retournent à la boutique à la fin de la manche). En boutique, deux runes identiques se combinent en une rune de niveau 2 ; cela ne change quelque chose que pour les runes qui ont un effet de niveau 2.`,
        plainHeading: "Les runes simples",
        powersHeading: "Les {specialCount} runes à pouvoir",
        tags: {
          cursed: "Maudite",
          corrupted: "Corrompue",
          ethereal: "Éthérée",
          etherealLevel1: "Éthérée au niveau 1",
          level2: "Niveau 2",
          notCombinable: "Non combinable",
          centre: "Colonne du centre seulement",
          edges: "Colonnes du bord seulement",
        },
        inShop: "Dans la réserve de boutique de chaque joueur : {count}",
        inStarter: "Dans chaque sac de départ : {count}",
        listName: "Les runes de RuneBags",
      },

      faq: {
        title: "FAQ — RuneBags",
        description: "RuneBags est-il gratuit, faut-il un compte, comment jouer avec un ami, comment fonctionnent les parties classées et les niveaux de l'ordinateur, et plus encore.",
        heading: "Questions fréquentes",
        lede: `Les questions qu'on pose le plus souvent sur RuneBags.`,
        items: [
          ["RuneBags est-il gratuit ?", "Oui. RuneBags est gratuit, sans publicité et sans achat."],
          ["Faut-il un compte ?", "Non. Vous pouvez jouer contre l'ordinateur et avec vos amis sans compte. Un compte garde vos statistiques d'un appareil à l'autre, vous donne une cote et un profil public, et permet de défier d'autres joueurs. Il ne demande qu'une adresse courriel : vous vous connectez avec un lien à usage unique, sans mot de passe."],
          ["Comment jouer avec un ami ?", "Choisissez « Jouer en ligne », puis « Jouer avec un ami ». Vous obtenez un code de salle, un lien et un code QR à envoyer. Les parties en salle sont amicales : elles ne changent la cote de personne."],
          ["Comment fonctionnent les parties classées ?", "La partie rapide vous associe à un joueur de cote voisine, et les défis peuvent aussi être classés ; les deux joueurs doivent avoir un compte. Tout le monde commence avec une cote Elo de {startRating}, et chaque joueur a dix minutes à l'horloge."],
          ["L'ordinateur est-il fort ?", "Il y a cinq niveaux, de Facile à Expert. Aucun ne voit votre main ni les runes que vous allez piger. Dans nos tests, chaque niveau a battu le précédent environ deux fois sur trois."],
          ["Peut-on jouer sur téléphone ?", "Oui, dans le navigateur d'un téléphone, d'une tablette ou d'un ordinateur. Vous pouvez aussi installer RuneBags sur votre écran d'accueil : la page d'accueil le propose quand votre navigateur le permet."],
          ["Peut-on jouer sur table ?", "Oui. La <a href=\"{printUrl}\">trousse gratuite à imprimer</a> contient le plateau, un aide-mémoire et des étiquettes pour les jetons."],
          ["Combien de temps dure une partie ?", "Une manche dure quelques minutes. Une partie se joue en plusieurs manches, jusqu'à ce qu'un joueur détienne la majorité des points encore en jeu."],
          ["En quelles langues ?", "En français et en anglais. Le jeu suit la langue de votre navigateur ; vous pouvez la changer dans les paramètres ou au bas de la page d'accueil."],
          ["Qui crée RuneBags ?", "Piero Barrette, au Québec, qui a aussi créé <a href=\"https://hexaequo.com/\">Hexaequo</a>, un jeu de stratégie pour deux."],
          ["Que faites-vous de mes données ?", "Le moins possible : aucun témoin, aucune publicité, et les visites ne sont comptées qu'en totaux anonymes par jour. La <a href=\"{privacyUrl}\">politique de confidentialité</a> donne le détail."],
        ],
      },

      print: {
        title: "Imprimer et jouer — RuneBags",
        description: "Jouez à RuneBags sur table : téléchargez gratuitement le plateau, l'aide-mémoire et les étiquettes des jetons, et voyez le matériel nécessaire.",
        heading: "Imprimer et jouer",
        lede: `RuneBags se joue aussi sur table. Imprimez le plateau et un aide-mémoire, collez les étiquettes sur des jetons ronds, et prenez deux sacs.`,
        filesHeading: "Les fichiers",
        files: {
          plateau: "Plateau",
          board: "Plateau (anglais)",
          aideMemoire: "Aide-mémoire",
          quickRef: "Aide-mémoire (anglais)",
          labels: "Étiquettes des jetons, pour feuilles Avery 2309",
        },
        pages: "{n} pages",
        page: "1 page",
        needHeading: "Le matériel",
        need: `
<ul>
  <li>le plateau imprimé (sept colonnes, six rangées) ;</li>
  <li>pour chaque joueur, Noir et Blanc : {perPlayer} runes — le sac de départ ({starter}) et la réserve de boutique ({shopTotal} runes, détaillées plus bas) ;</li>
  <li>{neutrals} runes neutres, grises ;</li>
  <li>{points} jetons de points ;</li>
  <li>deux sacs, un par joueur.</li>
</ul>
<p>N'importe quels jetons ronds noirs, blancs et gris feront l'affaire ; les étiquettes leur donnent leurs symboles.</p>`,
        supplyHeading: "La réserve de boutique de chaque joueur",
        setupHeading: "La mise en place",
        setup: `
<ol>
  <li>Chaque joueur met ses runes de départ dans son sac ({starter}).</li>
  <li>Chaque joueur garde sa réserve de boutique à portée ; à chaque phase de boutique, il en révèle cinq au hasard.</li>
  <li>Les {neutrals} runes neutres et les {points} jetons de points forment la réserve commune.</li>
  <li>Suivez ensuite les <a href="{rulesUrl}">règles</a> : chaque manche commence par la boutique.</li>
</ol>`,
      },
    },
  },
};
