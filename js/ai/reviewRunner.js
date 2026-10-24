// Runs the post-game review in its own worker when the browser allows it, and
// on the main thread when it does not, one position at a time so the progress
// can still paint between them. Its own worker rather than the AI's: a review
// left running must never hold up the next game's first move.
import { reviewMove } from "./review.js";

let worker = null;
let workerBroken = false;
let nextId = 1;
let active = null;

function getWorker() {
  if (worker || workerBroken) {
    return worker;
  }
  if (typeof Worker === "undefined") {
    workerBroken = true;
    return null;
  }
  try {
    worker = new Worker(new URL("./reviewWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const { id, progress, results, error } = event.data || {};
      if (!active || active.id !== id) {
        return;
      }
      if (progress) {
        active.onProgress?.(progress.done, progress.total);
        return;
      }
      const finished = active;
      active = null;
      finished.resolve(error ? null : results);
    };
    worker.onerror = () => {
      workerBroken = true;
      worker = null;
      const failed = active;
      active = null;
      // Finish on the main thread rather than leave the review hanging.
      failed?.retry();
    };
  } catch {
    workerBroken = true;
    worker = null;
  }
  return worker;
}

// Resolves with the review results, or null when it failed or was cancelled.
export function runReview(positions, onProgress) {
  cancelReview();
  return new Promise((resolve) => {
    const id = nextId;
    nextId += 1;
    const job = {
      id,
      onProgress,
      resolve,
      cancelled: false,
      retry: () => reviewOnMainThread(positions, job),
    };
    active = job;

    const activeWorker = getWorker();
    if (!activeWorker) {
      reviewOnMainThread(positions, job);
      return;
    }
    try {
      activeWorker.postMessage({ id, positions });
    } catch {
      reviewOnMainThread(positions, job);
    }
  });
}

// A new game, or leaving the screen, stops a review nobody is waiting for.
// The worker is torn down because a search cannot be interrupted from outside.
export function cancelReview() {
  if (!active) {
    return;
  }
  const cancelled = active;
  active = null;
  cancelled.cancelled = true;
  if (worker) {
    worker.terminate();
    worker = null;
  }
  cancelled.resolve(null);
}

async function reviewOnMainThread(positions, job) {
  active = job;
  const results = [];
  for (let index = 0; index < positions.length; index += 1) {
    await new Promise((resolve) => window.setTimeout(resolve, 0));
    if (job.cancelled) {
      return;
    }
    const result = reviewMove(positions, index);
    if (result) {
      results.push(result);
    }
    job.onProgress?.(index + 1, positions.length);
  }
  if (active === job) {
    active = null;
  }
  job.resolve(results);
}
