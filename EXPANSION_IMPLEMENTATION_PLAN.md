# RuneBags Expansion Implementation Plan

This plan is implementation-oriented and keeps js/main.js as a compatibility shell while feature systems move into dedicated modules.

## Decisions Locked
- Campaign style: linear Balatro-style sequence (no tree/branches).
- Storage: localStorage only (no backend DB).
- Economy scope: points wallet is per profile slot.
- Online cosmetics: host board skin is shared; each player keeps personal rune/sfx/fx cosmetics.
- Scope boundary: cosmetics are visual/audio only and never affect gameplay logic.

## Target Architecture

### App Layer
- js/app/appController.js: app bootstrap, panel routing, mode switching.
- js/app/gameSessionController.js: active match lifecycle and dispatch.
- js/app/modeRegistry.js: mode contract and registration.
- js/core/eventBus.js: domain event distribution.

### Modes
- js/modes/passplayMode.js
- js/modes/aiMode.js
- js/modes/onlineMode.js
- js/modes/tutorialMode.js
- js/modes/puzzleMode.js
- js/modes/campaignMode.js

### Progression
- js/progression/achievementCatalog.js
- js/progression/achievementEngine.js
- js/progression/rewardEngine.js
- js/persistence/progressionStore.js

### Cosmetics
- js/cosmetics/cosmeticCatalog.js
- js/ui/effectsView.js (or integrate with rune effect visuals)

## Data Model

### Profile State (already started)
- 3 slots only.
- Active slot id.
- Profile name.
- Progress counters and wallet points.

### Save State Namespacing
- Mode saves are profile-aware.
- Legacy fallback remains for migration safety.

### Next Save Stores
- progression store: achievements, unlocks, tutorial flags, puzzle stats, campaign run stats.
- keep large static content in js assets; save only progress deltas.

## Suggested Vertical Milestones

### M1 (in progress)
- Profile slots UI and profile-aware saves.
- Profile switch in top-right menu.
- Per-slot progression percent display in profile panel.

### M2
- Achievement scaffolding and event hooks.
- Point payout on finished games only.
- Wallet persistence per active profile.

### M3
- Shop tab: purchase and equip board/rune/sfx/fx cosmetics.
- Settings remain global toggles for theme/sound/animation.

Status update:
- Implemented profile shop for board and rune cosmetics with buy/equip actions.
- Cosmetics are points-only purchases (achievements grant points only).
- Added shop SFX cosmetics (buy/equip) with multiple sound profiles.
- Added toast VFX feedback for rewards, unlocks, purchases, and equips.
- Added first-game tutorial suggestion toast per profile (one-time).
- Added Puzzle Mode scaffold: puzzle menu panel, deterministic puzzle catalog/loader, per-profile puzzle progress, and first-solve rewards.
- Expanded Puzzle Mode to 20 curated puzzles with difficulty tags and menu filters.
- Added Campaign map prototype scaffold with branching nodes, 3 boss milestones, per-profile run persistence, and node completion rewards.
- Campaign nodes now launch playable encounter scenarios with win/fail outcomes, restart flow, and progression rewards on clear.
- Campaign upgraded to a branching Slay-the-Spire style tree with combat, elite, shop, remove, and boss nodes.
- Encounter pacing now follows node type (combat: 1-round pace, elite: multi-round pace, bosses: longer act fights).
- Campaign clears now offer a choose-1-from-3 rune reward, and run loadout persists across nodes.
- Shop/remove campaign nodes are now slower run-management actions separate from normal match shop flow.
- Active campaign encounters auto-resume on profile entry/profile switch when a save is present.
- Campaign UI simplified from map graph to a linear progression list.
- Campaign run sequence now follows: opening shop, then for each ante: normal combat (3), shop, elite (5), shop, boss (7), repeated 8 times with final boss at 10.
- Campaign combats now run as multi-round supply fights without between-round shops.
- Enemy combat bags now come from predefined templates by type (combat/elite/boss/final-boss), randomly selected per run seed.
- Campaign shop nodes now use the real in-game shop phase UI and rules (remove/combine/add), then convert resulting bag specials back into run loadout.
- Campaign is now ironman: failure resets the run to opening shop.
- Bosses now have randomized names from a pool and ante-specific opening constraints; final boss has its own name pool and hard edge-opener constraint.
- Campaign run victory now ends immediately with a victory reward popup and run reset.
- Campaign shop rerolls added: rerolls are earned from run round-point performance (current formula: 1 reroll point = 1 reroll, persistent through run).
- Economy semantics split:
-   Run reroll points: earned during run combats from round-point performance, spent only on campaign shop rerolls, carry through the run.
-   Wallet points: profile currency awarded only once at run end (victory or defeat payout), never during intermediate campaign nodes.
- Boss constraints now randomize from a per-run constraint pool for roguelike variety.

### M4
- Puzzle mode with deterministic scenario loader.
- Start with 20 curated puzzles then scale to 100.

### M5
- Campaign map prototype with 3 bosses and branch choices.
- Save/resume current run by seed + node progress.

### M6
- Online cosmetic sync payloads and host-board rule.

## Boss Concepts (Campaign)
- The Binder: locks one rune slot each round until condition is broken.
- The Echo Seer: echoes your previous rune effect every second turn.
- The Hollow Crown: scales with destroyed rune count.

## Achievement Suggestions
- Permanently removed opponent rune in shop.
- Won a round on first turn.
- Won with 0 point supply remaining.
- Solved 10 puzzles without hints.
- Cleared first campaign boss.
- Perfect shop phase (max adds and legal combine in one phase).

## Puzzle Reward Suggestions
- Easy: 20-30 points.
- Medium: 45-70 points.
- Hard: 90-140 points.
- Bonus: +25% first-attempt clear.

## Verification Checklist
- Legacy saves migrate safely.
- Slot isolation works for passplay/ai/online saves.
- Switching profile reloads saves without refresh.
- Game results award points only after finished match.
- Existing gameplay behavior unchanged for passplay/ai/online.
