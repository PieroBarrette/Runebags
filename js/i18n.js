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
    "rules.title": "RuneBags Rules",
    "rules.s1h": "1. Goal",
    "rules.s1p1": "Win points by creating winning lines of 4 or more contiguous runes. The game revolves around a shared 10-point supply.",
    "rules.s2h": "2. Core Win and Points",
    "rules.s2p1": "A round ends immediately when a player forms a winning line of at least 4. That player takes 1 point from supply.",
    "rules.s2p2": "If both players form a winning line from the same resolved action, the round is a draw.",
    "rules.s2p3": "If a round is tied, 1 point is removed from supply instead of awarded.",
    "rules.s2p4": "A player wins the game by majority of remaining obtainable points. If supply reaches 0, highest score wins. If scores are tied, fewer runes in bag wins.",
    "rules.s3h": "3. Round, Shop, and Turn Flow",
    "rules.s3p1": "The game starts in Shop Phase.",
    "rules.s3p2": "After shop, a new round starts. Starter by parity: even supply means White starts, odd means Black starts.",
    "rules.s3p3": "When a round ends, you enter Shop Phase before the next round.",
    "rules.s4h": "4. Hands and Visibility",
    "rules.s4p1": "Hands are pass-and-play hidden by default. Active player hand is shown during round turns.",
    "rules.s4p2": "If Uruz is on board for one side, opponent hand is forced visible.",
    "rules.s5h": "5. Neutral Runes",
    "rules.s5p1": "Neutral runes are gray blockers. They are not Black or White ownership.",
    "rules.s5p2": "They do not score by themselves, do not return to player bags, and return to neutral supply when removed or at round settlement.",
    "rules.s6h": "6. Forced Pass",
    "rules.s6p1": "If a player has no legal playable rune, they must pass.",
    "rules.s6p2": "If both players cannot play, the round is a draw.",
    "rules.s7h": "7. Shop Phase",
    "rules.s7p1": "Each player reveals 5 runes from their personal shop supply and may add up to 2 to their bag.",
    "rules.s7p2": "Shop actions in any order:",
    "rules.s7p3": "- Remove 1 rune once per shop phase: basic and symbol runes are removed permanently, except Inguz and Jera which return to that player's shop supply; neutral returns to supply.",
    "rules.s7p4": "- Combine 2 matching level-1 runes into one level-2 rune (except non-combinable runes).",
    "rules.s7p5": "- Add up to 2 runes from the 5 offered.",
    "rules.s8h": "8. Rune Effects",
    "rules.s9h": "9. Ethereal and Visual Cues",
    "rules.s9p1": "Ethereal runes use dashed styling and return to shop supply instead of player bag at round settlement.",
    "rules.s9p2": "Winning lines and forced columns are highlighted on board, including full 4+ combo lines and both sides in simultaneous-win draws.",
    "rules.rune.algiz": "inserts from column bottom and pushes upward; cursed.",
    "rules.rune.ansuz": "returns rune directly beneath to owner bag (not neutral).",
    "rules.rune.berkana": "if in owner winning line, grants +1 bonus point once for that round.",
    "rules.rune.dagaz": "copies the effect of the rune directly below it; corrupted (adds 1 Neutral rune to owner bag whenever played).",
    "rules.rune.ehwaz": "increases owner max hand size to 3 while on board. L2 : max hand size to 4.",
    "rules.rune.eihwaz": "if removed or discarded for the round, its owner gains 1 point without ending the round.",
    "rules.rune.fehu": "return discarded rune(s) to your bag (L1: 1, L2: 2). Recovered runes can include opponent runes.",
    "rules.rune.gebo": "removes rune directly beneath for the round (L2 : chooses adjacent target) ; cursed.",
    "rules.rune.hagalz": "One adjacent neutral rune can count towards your winning line.",
    "rules.rune.inguz": "center column only; goes back to shop when removed.",
    "rules.rune.isa": "remains on board across rounds.",
    "rules.rune.jera": "edge columns only; goes back to shop when removed.",
    "rules.rune.kenaz": "One Kenaz does nothing. When your second Kenaz enters play, destroy 1 board rune permanently.",
    "rules.rune.laguz": "cannot be moved or removed.",
    "rules.rune.mannaz": "adds neutral rune(s) to opponent bag (L1: 1, L2: 2).",
    "rules.rune.nauthiz": "can float and be placed on any free cell; ethereal and cursed.",
    "rules.rune.odal": "if played on the top row, owner gains 1 point without ending the round.",
    "rules.rune.perth": "constrains opponent next turn to adjacent columns; L2 : the adjacent forced column is chosen.",
    "rules.rune.raido": "grants extra turn; L1 : ethereal.",
    "rules.rune.sowelu": "discards random rune(s) from opponent bag for the round (L1: 1, L2: 2).",
    "rules.rune.teiwaz": "move top rune of any column (L1 : to adjacent column, L2 : to any column).",
    "rules.rune.thurisa": "place extra neutral rune(s) on the board (L1: 1, L2: 2).",
    "rules.rune.uruz": "opponent hand cannot be hidden while active.",
    "rules.rune.wunjo": "if no allied rune is adjacent at round end, owner gets +1 add and +1 remove in next shop phase.",
    "online.title": "Play Online",
    "online.tempName": "Temporary Name",
    "online.yourName": "Your name",
    "online.quickPlay": "Quick Play",
    "online.playFriend": "Play with Friend",
    "online.joinLabel": "Join with Room Code",
    "online.join": "Join",
    "online.inviteCode": "Invite Code",
    "online.waitingRoom": "Waiting Room",
    "online.sendLink": "Send Link",
    "online.setReady": "Set Ready",
    "shop.passDevice": "Pass Device",
    "shop.remove": "Remove 1 Rune",
    "shop.combine": "Combine 2 Runes",
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
    "rules.title": "Règles de RuneBags",
    "rules.s1h": "1. But",
    "rules.s1p1": "Gagnez des points en formant des lignes gagnantes de 4 runes contiguës ou plus. Le jeu tourne autour d'une réserve commune de 10 points.",
    "rules.s2h": "2. Victoire et points",
    "rules.s2p1": "Une manche se termine dès qu'un joueur forme une ligne gagnante d'au moins 4. Ce joueur prend 1 point de la réserve.",
    "rules.s2p2": "Si les deux joueurs forment une ligne gagnante à la résolution de la même action, la manche est nulle.",
    "rules.s2p3": "Si une manche est nulle, 1 point est retiré de la réserve au lieu d'être attribué.",
    "rules.s2p4": "Un joueur gagne la partie en obtenant la majorité des points encore disponibles. Si la réserve atteint 0, le meilleur score l'emporte. À égalité de score, le moins de runes dans le sac l'emporte.",
    "rules.s3h": "3. Déroulement : manche, boutique et tours",
    "rules.s3p1": "La partie commence par la phase de boutique.",
    "rules.s3p2": "Après la boutique, une nouvelle manche commence. Premier joueur selon la parité : réserve paire = Blanc commence, impaire = Noir commence.",
    "rules.s3p3": "Quand une manche se termine, vous passez en phase de boutique avant la manche suivante.",
    "rules.s4h": "4. Mains et visibilité",
    "rules.s4p1": "Les mains sont cachées par défaut (jeu à tour de rôle). La main du joueur actif est affichée pendant ses tours.",
    "rules.s4p2": "Si Uruz est sur le plateau pour un camp, la main de l'adversaire est rendue visible.",
    "rules.s5h": "5. Runes neutres",
    "rules.s5p1": "Les runes neutres sont des bloqueurs gris. Elles n'appartiennent ni à Noir ni à Blanc.",
    "rules.s5p2": "Elles ne marquent pas de points seules, ne reviennent pas dans les sacs des joueurs, et retournent à la réserve neutre lorsqu'elles sont retirées ou au règlement de la manche.",
    "rules.s6h": "6. Passe forcée",
    "rules.s6p1": "Si un joueur n'a aucune rune jouable légalement, il doit passer.",
    "rules.s6p2": "Si les deux joueurs ne peuvent pas jouer, la manche est nulle.",
    "rules.s7h": "7. Phase de boutique",
    "rules.s7p1": "Chaque joueur révèle 5 runes de sa réserve de boutique personnelle et peut en ajouter jusqu'à 2 à son sac.",
    "rules.s7p2": "Actions de boutique, dans n'importe quel ordre :",
    "rules.s7p3": "- Retirer 1 rune une fois par phase de boutique : les runes de base et à symbole sont retirées définitivement, sauf Inguz et Jera qui retournent à la réserve de boutique du joueur ; les neutres retournent à la réserve.",
    "rules.s7p4": "- Combiner 2 runes de niveau 1 identiques en une rune de niveau 2 (sauf runes non combinables).",
    "rules.s7p5": "- Ajouter jusqu'à 2 runes parmi les 5 proposées.",
    "rules.s8h": "8. Effets des runes",
    "rules.s9h": "9. Éthéré et repères visuels",
    "rules.s9p1": "Les runes éthérées ont un contour en pointillés et retournent à la réserve de boutique plutôt qu'au sac du joueur au règlement de la manche.",
    "rules.s9p2": "Les lignes gagnantes et les colonnes forcées sont mises en évidence sur le plateau, y compris les lignes complètes de 4+ et les deux camps lors d'un nul à victoire simultanée.",
    "rules.rune.algiz": "s'insère par le bas de la colonne et pousse vers le haut ; maudite.",
    "rules.rune.ansuz": "renvoie la rune juste en dessous dans le sac du propriétaire (pas neutre).",
    "rules.rune.berkana": "si dans une ligne gagnante du propriétaire, accorde +1 point bonus une fois pour cette manche.",
    "rules.rune.dagaz": "copie l'effet de la rune juste en dessous ; corrompue (ajoute 1 rune neutre au sac du propriétaire à chaque pose).",
    "rules.rune.ehwaz": "augmente la taille de main maximale du propriétaire à 3 tant qu'elle est sur le plateau. N2 : taille de main maximale à 4.",
    "rules.rune.eihwaz": "si retirée ou défaussée pour la manche, son propriétaire gagne 1 point sans terminer la manche.",
    "rules.rune.fehu": "renvoie la ou les runes défaussées dans votre sac (N1 : 1, N2 : 2). Les runes récupérées peuvent inclure des runes adverses.",
    "rules.rune.gebo": "retire la rune juste en dessous pour la manche (N2 : choisit une cible adjacente) ; maudite.",
    "rules.rune.hagalz": "Une rune neutre adjacente peut compter dans votre ligne gagnante.",
    "rules.rune.inguz": "colonne centrale uniquement ; retourne à la boutique quand retirée.",
    "rules.rune.isa": "reste sur le plateau d'une manche à l'autre.",
    "rules.rune.jera": "colonnes de bord uniquement ; retourne à la boutique quand retirée.",
    "rules.rune.kenaz": "Un seul Kenaz ne fait rien. Quand votre deuxième Kenaz entre en jeu, détruit définitivement 1 rune du plateau.",
    "rules.rune.laguz": "ne peut être ni déplacée ni retirée.",
    "rules.rune.mannaz": "ajoute une ou des runes neutres au sac de l'adversaire (N1 : 1, N2 : 2).",
    "rules.rune.nauthiz": "peut flotter et être placée sur n'importe quelle case libre ; éthérée et maudite.",
    "rules.rune.odal": "si jouée sur la rangée du haut, le propriétaire gagne 1 point sans terminer la manche.",
    "rules.rune.perth": "contraint le prochain tour de l'adversaire aux colonnes adjacentes ; N2 : la colonne forcée adjacente est choisie.",
    "rules.rune.raido": "accorde un tour supplémentaire ; N1 : éthérée.",
    "rules.rune.sowelu": "défausse une ou des runes aléatoires du sac de l'adversaire pour la manche (N1 : 1, N2 : 2).",
    "rules.rune.teiwaz": "déplace la rune du sommet de n'importe quelle colonne (N1 : vers une colonne adjacente, N2 : vers n'importe quelle colonne).",
    "rules.rune.thurisa": "place une ou des runes neutres supplémentaires sur le plateau (N1 : 1, N2 : 2).",
    "rules.rune.uruz": "la main de l'adversaire ne peut pas être cachée tant qu'elle est active.",
    "rules.rune.wunjo": "si aucune rune alliée n'est adjacente en fin de manche, le propriétaire obtient +1 ajout et +1 retrait à la prochaine boutique.",
    "online.title": "Jouer en ligne",
    "online.tempName": "Nom temporaire",
    "online.yourName": "Votre nom",
    "online.quickPlay": "Partie rapide",
    "online.playFriend": "Jouer avec un ami",
    "online.joinLabel": "Rejoindre avec un code",
    "online.join": "Rejoindre",
    "online.inviteCode": "Code d'invitation",
    "online.waitingRoom": "Salle d'attente",
    "online.sendLink": "Envoyer le lien",
    "online.setReady": "Se déclarer prêt",
    "shop.passDevice": "Passer l'appareil",
    "shop.remove": "Retirer 1 rune",
    "shop.combine": "Combiner 2 runes",
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
