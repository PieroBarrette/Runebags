// One shard of a bench run. Games are deterministic per index, so a worker can
// be handed any subset of them and the merged tally is identical to a serial run.
import { parentPort, workerData } from "node:worker_threads";
import { playMatch } from "../js/ai/benchmark.js";

const { configA, configB, indices } = workerData;

for (const index of indices) {
  const startedAt = Date.now();
  const outcome = playMatch(configA, configB, index);
  parentPort.postMessage({ index, outcome, ms: Date.now() - startedAt });
}
