// The AI search, run off the main thread.
//
// The search is a synchronous alpha-beta over cloned states: on the main thread
// it freezes everything for as long as it runs, which is what kept the thinking
// budget down to a few dozen milliseconds. In here it can take as long as the
// difficulty asks for while the board stays responsive.
import { runAiStep } from "./aiController.js";

self.onmessage = (event) => {
  const { id, state, config } = event.data || {};
  try {
    const result = runAiStep(state, config);
    self.postMessage({
      id,
      state: result.state,
      note: result.note || null,
      error: result.error || null,
      errorKey: result.errorKey || null,
    });
  } catch (error) {
    // A thrown search must not leave the caller waiting forever.
    self.postMessage({ id, error: String(error?.message || error) });
  }
};
