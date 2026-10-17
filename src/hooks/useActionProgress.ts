import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks one async action for the progress bar inside a Button.
 *
 * The spinner the buttons used to show could say one thing: wait. This keeps
 * the four states the bar can draw — queued, running, succeeded, failed — so
 * the button can finish green with a tick, or shake red, instead of simply
 * going back to how it looked before.
 *
 * It deliberately does NOT own the form's own `loading` flag. Those flags also
 * gate validation, disabled states and navigation on the pages that write to
 * the ledger, and quietly re-routing them through here would change behaviour
 * on screens that handle money. This sits alongside them.
 *
 * Usage, in a handler that already has its own try/catch:
 *
 *   const save = useActionProgress()
 *   ...
 *   save.start()
 *   try { await mutate(); await save.succeed(); closeOrNavigate() } catch (e) { save.fail(); ... }
 *
 * `succeed` holds the finished state briefly so the tick is actually seen,
 * then returns to idle. It returns a promise that resolves once the tick has
 * been on screen; await it before anything that removes the button (closing
 * a modal, navigating, resetting the form), or the bar is cut off near 90%. `fail` holds until the next `start`, so a failed
 * button stays visibly failed while the user reads the error toast.
 */

export type ActionStatus = 'idle' | 'running' | 'done' | 'error';

/** Long enough to register the tick, short enough not to delay a redirect. */
const DONE_HOLD_MS = 900;

/**
 * How long `succeed()` keeps its promise pending. Callers that close a modal
 * or navigate right after a save `await` it, so the button is still on screen
 * while the bar runs to 100% and the tick appears.
 */
const SUCCESS_SHOW_MS = 800;

export function useActionProgress(doneHoldMs: number = DONE_HOLD_MS) {
  const [status, setStatus] = useState<ActionStatus>('idle');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clear = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  // Several of these handlers navigate away on success, so the hold timer can
  // outlive the component. Drop it on unmount rather than setting state on a
  // component that is gone.
  useEffect(() => clear, []);

  const start = useCallback(() => {
    clear();
    setStatus('running');
  }, []);

  const succeed = useCallback((): Promise<void> => {
    clear();
    setStatus('done');
    timer.current = setTimeout(() => setStatus('idle'), doneHoldMs);
    return new Promise(resolve => setTimeout(resolve, SUCCESS_SHOW_MS));
  }, [doneHoldMs]);

  const fail = useCallback(() => {
    clear();
    setStatus('error');
  }, []);

  const reset = useCallback(() => {
    clear();
    setStatus('idle');
  }, []);

  return { status, start, succeed, fail, reset };
}
