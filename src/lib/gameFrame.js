// Race animation frames against a timer. Either source may be throttled in
// embedded browsers; only the winner is allowed to advance the simulation.
export function requestGameFrame(callback) {
  const handle = { frame: null, timer: null, done: false };
  const tick = () => {
    if (handle.done) return;
    cancelGameFrame(handle);
    callback();
  };
  if (typeof window.requestAnimationFrame === 'function') {
    handle.frame = window.requestAnimationFrame(tick);
  }
  handle.timer = window.setTimeout(tick, 40);
  return handle;
}

export function cancelGameFrame(handle) {
  if (!handle) return;
  handle.done = true;
  if (handle.frame !== null) window.cancelAnimationFrame(handle.frame);
  if (handle.timer !== null) window.clearTimeout(handle.timer);
}
