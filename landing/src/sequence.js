/* ============================================================
   Scroll-scrubbed frame sequence on a full-bleed canvas —
   the same technique terminal-industries.com uses for its
   truck footage (their `video-sequence` component): numbered
   frames drawn cover-fit, index driven by scroll progress.
   ============================================================ */

export function createSequence({ canvas, urlFor, frameCount, batch = 8 }) {
  const ctx = canvas.getContext("2d");
  const images = new Array(frameCount);
  const ready = new Array(frameCount).fill(false);

  let target = 0;   // frame position requested by scroll
  let current = 0;  // smoothed position actually rendered
  let lastDrawn = -1;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function resize() {
    canvas.width = canvas.offsetWidth * dpr;
    canvas.height = canvas.offsetHeight * dpr;
    lastDrawn = -1; // force redraw at new size
    draw();
  }

  /* cover-fit, centered — their fitAndPosition with 50%/50% */
  function draw() {
    const idx = nearestReady(Math.round(current));
    if (idx === -1 || idx === lastDrawn) return;
    const img = images[idx];
    const cw = canvas.width, ch = canvas.height;
    const iw = img.naturalWidth, ih = img.naturalHeight;
    if (!cw || !ch || !iw || !ih) return;
    const s = Math.max(cw / iw, ch / ih);
    const w = iw * s, h = ih * s;
    ctx.drawImage(img, (cw - w) / 2, (ch - h) / 2, w, h);
    lastDrawn = idx;
  }

  /* nearest loaded frame at or below the requested index */
  function nearestReady(idx) {
    idx = Math.max(0, Math.min(frameCount - 1, idx));
    for (let i = idx; i >= 0; i--) if (ready[i]) return i;
    for (let i = idx + 1; i < frameCount; i++) if (ready[i]) return i;
    return -1;
  }

  function load(i) {
    return new Promise((res) => {
      const img = new Image();
      img.onload = () => { images[i] = img; ready[i] = true; res(); };
      img.onerror = () => res();
      img.src = urlFor(i);
    });
  }

  /* first frame immediately, the rest in small batches (their worker pattern) */
  async function loadAll() {
    await load(0);
    resize();
    const queue = [];
    for (let i = 1; i < frameCount; i++) queue.push(i);
    while (queue.length) {
      await Promise.all(queue.splice(0, batch).map(load));
    }
    lastDrawn = -1;
    draw();
  }

  window.addEventListener("resize", resize);
  loadAll();

  return {
    /* scroll progress 0..1 → frame position */
    setProgress(p) {
      target = Math.max(0, Math.min(1, p)) * (frameCount - 1);
    },
    /* called every ticker frame: ease toward target, redraw when needed */
    tick() {
      current += (target - current) * 0.18;
      if (Math.abs(target - current) < 0.05) current = target;
      draw();
    },
  };
}
