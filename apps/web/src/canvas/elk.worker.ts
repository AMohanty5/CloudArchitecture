import ELK from 'elkjs/lib/elk.bundled.js';

// elk.bundled.js is self-contained and runs the layout on this worker thread,
// keeping the heavy GWT-compiled solver off the main (UI) thread.
const elk = new ELK();

// `self.postMessage` collides with the DOM `Window` signature under the web tsconfig;
// cast to the worker-shaped single-arg form.
const post = (msg: unknown): void => (self as unknown as { postMessage(m: unknown): void }).postMessage(msg);

self.addEventListener('message', (ev: MessageEvent) => {
  void (async () => {
    try {
      const graph = await elk.layout(ev.data);
      post({ ok: true, graph });
    } catch (err) {
      post({ ok: false, error: String(err) });
    }
  })();
});
