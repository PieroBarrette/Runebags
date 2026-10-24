// The post-game review, run off the main thread: one Expert-strength search
// per move of the game, which would otherwise freeze the end card for seconds.
import { reviewGame } from "./review.js";

self.onmessage = (event) => {
  const { id, positions } = event.data || {};
  try {
    const results = reviewGame(positions || [], {
      onProgress: (done, total) => self.postMessage({ id, progress: { done, total } }),
    });
    self.postMessage({ id, results });
  } catch (error) {
    // A thrown search must not leave the caller waiting forever.
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
