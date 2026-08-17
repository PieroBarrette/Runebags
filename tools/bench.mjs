// Headless AI-vs-AI bench, spread across every core.
//
// A single game costs 15-30 seconds of search, so the browser bench could only
// ever answer "is the new evaluation better?" by locking the page for half an
// hour. Here the games — which are deterministic, and therefore independent —
// are dealt out to worker threads, and a hundred-game run lands in minutes.
//
//   node tools/bench.mjs                          new evaluation vs legacy, 20 games
//   node tools/bench.mjs --games 100              enough games to actually decide
//   node tools/bench.mjs --a "depth=3" --b "depth=2"
//
// A is the configuration under test; B is the baseline. Config fields are
// comma-separated key=value pairs (depth, legacyEval, engine, ...).
//
// Benching level 5, mind the clock: its time budget is wall-clock, and twenty
// workers competing for twenty-two cores stretch it, so a move that searches
// four sampled worlds on an idle machine may finish only one here. Pass a
// budget large enough that it never binds — `--a "depth=5,timeBudgetMs=100000"`
// — and the run measures the search rather than the machine's load.
import os from "node:os";
import { Worker } from "node:worker_threads";
import { summarize } from "../js/ai/benchmark.js";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) {
      continue;
    }
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    args[key] = next && !next.startsWith("--") ? next : "true";
  }
  return args;
}

function parseConfig(text) {
  const config = {};
  for (const part of String(text).split(",")) {
    if (!part.trim()) {
      continue;
    }
    const [key, raw = "true"] = part.split("=");
    const value = raw.trim();
    if (value === "true" || value === "false") {
      config[key.trim()] = value === "true";
    } else {
      config[key.trim()] = Number.isNaN(Number(value)) ? value : Number(value);
    }
  }
  return config;
}

const args = parseArgs(process.argv.slice(2));
const games = Number(args.games ?? 20);
const configA = parseConfig(args.a ?? "depth=2");
const configB = parseConfig(args.b ?? "depth=2,legacyEval=true");
// One core left over so the machine stays usable while a long run grinds.
const workerCount = Math.max(1, Math.min(Number(args.workers ?? os.cpus().length - 1), games));

// Deal indices round-robin rather than in blocks: game lengths vary a lot, and
// contiguous blocks leave one worker still going long after the rest are idle.
const shards = Array.from({ length: workerCount }, () => []);
for (let i = 0; i < games; i += 1) {
  shards[i % workerCount].push(i);
}

console.log(`A: ${JSON.stringify(configA)}`);
console.log(`B: ${JSON.stringify(configB)}`);
console.log(`${games} games (${games / 2} seeds, each played from both sides) on ${workerCount} workers\n`);

const tally = { aWins: 0, bWins: 0, draws: 0, unfinished: 0 };
const bucket = { a: "aWins", b: "bWins", draw: "draws", unfinished: "unfinished" };
const startedAt = Date.now();
let played = 0;

const runShard = (indices) =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL("./benchWorker.mjs", import.meta.url), {
      workerData: { configA, configB, indices },
    });
    worker.on("message", ({ outcome }) => {
      tally[bucket[outcome]] += 1;
      played += 1;
      const elapsed = (Date.now() - startedAt) / 1000;
      const eta = Math.round((elapsed / played) * (games - played));
      process.stdout.write(
        `\r${played}/${games}  A ${tally.aWins} - B ${tally.bWins}` +
          `  draws ${tally.draws}  unfinished ${tally.unfinished}` +
          `  ${Math.round(elapsed)}s elapsed, ~${eta}s left    `,
      );
    });
    worker.on("error", reject);
    worker.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`worker exit ${code}`))));
  });

await Promise.all(shards.filter((shard) => shard.length > 0).map(runShard));

const result = summarize(tally, games, Math.round((Date.now() - startedAt) / 100) / 10);
console.log("\n");
console.log(JSON.stringify(result, null, 2));

if (result.pValue === null) {
  console.log("\nNo decided games.");
} else if (result.pValue < 0.05) {
  const better = result.aWinRate > 50 ? "A" : "B";
  console.log(`\n${better} is stronger: ${result.aWinRate}% for A, p = ${result.pValue}.`);
} else {
  console.log(
    `\nToo close to call: ${result.aWinRate}% for A, p = ${result.pValue}.` +
      " On this evidence the two configurations are not distinguishable.",
  );
}
