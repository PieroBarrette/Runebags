// Runs an AI turn in a worker when the browser allows it, and on the main
// thread when it does not — so the game keeps working on older browsers, just
// with the freeze the worker exists to avoid.
import { runAiStep } from "./aiController.js";

let worker = null;
let workerBroken = false;
let nextId = 1;
const pending = new Map();

function getWorker() {
  if (worker || workerBroken) {
    return worker;
  }
  // Module workers are recent enough that a fallback is still worth keeping.
  if (typeof Worker === "undefined") {
    workerBroken = true;
    return null;
  }

  try {
    worker = new Worker(new URL("./aiWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const { id, ...result } = event.data || {};
      const resolve = pending.get(id);
      if (resolve) {
        pending.delete(id);
        resolve(result);
      }
    };
    worker.onerror = () => {
      // Fail over permanently rather than leaving turns unanswered.
      workerBroken = true;
      worker = null;
      for (const [, resolve] of pending) {
        resolve(null);
      }
      pending.clear();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

export function isAiWorkerActive() {
  return Boolean(worker) && !workerBroken;
}

// Resolves with { state, note, error } exactly like runAiStep, whichever path
// it took.
export async function runAiTurn(state, config) {
  const activeWorker = getWorker();
  if (!activeWorker) {
    return runAiStep(state, config);
  }

  const id = nextId;
  nextId += 1;

  const answer = await new Promise((resolve) => {
    pending.set(id, resolve);
    try {
      activeWorker.postMessage({ id, state, config });
    } catch {
      pending.delete(id);
      resolve(null);
    }
  });

  // A null answer means the worker died mid-search; finish the turn locally so
  // the player is never left waiting on a move that will not come.
  return answer || runAiStep(state, config);
}
