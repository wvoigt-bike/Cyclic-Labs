// ============================================================================
//  OFFLINE OCR + PDF LOADER for the drawing scanner (ocr.js)
//  Loads Tesseract (vendor/tesseract-core.js + vendor/ocr-eng.js) and pdf.js
//  (vendor/pdf.js + vendor/pdf.worker.js) only when a drawing is scanned, so the
//  app itself stays fast. Everything runs inside the page: no internet, no
//  account, works from the launcher or straight from the folder.
// ============================================================================
(function (root) {
  "use strict";
  const base = (() => { const s = document.currentScript && document.currentScript.src; return s ? s.replace(/[^/]*$/, "") : ""; })();
  const loaded = {};
  function loadScript(rel) {
    if (loaded[rel]) return loaded[rel];
    return loaded[rel] = new Promise((res, rej) => {
      const s = document.createElement("script"); s.src = base + rel; s.async = true;
      s.onload = () => res(); s.onerror = () => { delete loaded[rel]; rej(new Error("Couldn't load " + rel + " (is the app's vendor folder complete?)")); };
      document.head.appendChild(s);
    });
  }

  let enginePromise = null;
  // Returns { read(pgmBytes) -> { text, conf } }
  function engine(progress) {
    if (enginePromise) return enginePromise;
    enginePromise = (async () => {
      progress && progress("Loading the text reader (first time only)…");
      await loadScript("vendor/tesseract-core.js");
      await loadScript("vendor/ocr-eng.js");
      const M = await root.TesseractCore();
      const b64 = root.FRAMEBENCH_OCR_ENG, bin = atob(b64), data = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) data[i] = bin.charCodeAt(i);
      M.FS.writeFile("/eng.traineddata", data);
      const api = new M.TessBaseAPI();
      if (api.Init("/", "eng") !== 0) throw new Error("The text reader didn't start.");
      api.SetVariable("tessedit_pageseg_mode", "7");     // one line of text per word crop
      api.SetVariable("debug_file", "/dev/null");
      return {
        read(pgm) {
          M.FS.writeFile("/input", pgm);
          api.SetImageFile(1, 0);
          api.Recognize(null);
          return { text: api.GetUTF8Text() || "", conf: api.MeanTextConf() };
        }
      };
    })();
    enginePromise.catch(() => { enginePromise = null; });
    return enginePromise;
  }

  // ---------------------------------------------------------------- files → grey image
  // Scale so the sheet is about 3400 px wide: typical A4 CAD sheets then have ~22 px letters.
  const TARGET_W = 3400;
  async function pdfToCanvas(file) {
    await loadScript("vendor/pdf.worker.js");    // sets globalThis.pdfjsWorker → pdf.js runs it in the page (no separate worker file needed)
    await loadScript("vendor/pdf.js");
    const lib = root.pdfjsLib;
    const task = lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }), doc = await task.promise;
    const page = await doc.getPage(1);
    const vp1 = page.getViewport({ scale: 1 });
    const vp = page.getViewport({ scale: TARGET_W / Math.max(vp1.width, vp1.height) });
    const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
    const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp, background: "#ffffff" }).promise;
    const pages = doc.numPages; try { await task.destroy(); } catch (e) {}
    return { canvas: c, pages };
  }
  async function imageToCanvas(file) {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => rej(new Error("That picture couldn't be opened.")); i.src = url; });
      const k = TARGET_W / Math.max(img.naturalWidth, img.naturalHeight);
      const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      const ctx = c.getContext("2d"); ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, c.width, c.height);
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img, 0, 0, c.width, c.height);
      return { canvas: c, pages: 1 };
    } finally { URL.revokeObjectURL(url); }
  }
  // Photos of a printed sheet are often unevenly lit: flatten the background before the black & white step.
  function canvasToGrey(c, flatten) {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data, n = c.width * c.height, g = new Uint8Array(n);
    for (let i = 0, j = 0; i < n; i++, j += 4) g[i] = (d[j] * 299 + d[j + 1] * 587 + d[j + 2] * 114) / 1000;
    if (flatten) {
      // background = brightest value in a coarse grid, smoothed; divide it out
      const w = c.width, h = c.height, cs = 48, gw = Math.ceil(w / cs), gh = Math.ceil(h / cs), bg = new Float32Array(gw * gh);
      for (let by = 0; by < gh; by++) for (let bx = 0; bx < gw; bx++) {
        const vals = [];
        for (let y = by * cs; y < Math.min(h, by * cs + cs); y += 3) for (let x = bx * cs; x < Math.min(w, bx * cs + cs); x += 3) vals.push(g[y * w + x]);
        vals.sort((a, b) => a - b); bg[by * gw + bx] = vals[Math.floor(vals.length * 0.9)] || 255;
      }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const fx = Math.min(gw - 1.001, Math.max(0, x / cs - 0.5)), fy = Math.min(gh - 1.001, Math.max(0, y / cs - 0.5));
        const x0 = Math.floor(fx), y0 = Math.floor(fy), ax = fx - x0, ay = fy - y0;
        const b = bg[y0 * gw + x0] * (1 - ax) * (1 - ay) + bg[y0 * gw + x0 + 1] * ax * (1 - ay) + bg[(y0 + 1) * gw + x0] * (1 - ax) * ay + bg[(y0 + 1) * gw + x0 + 1] * ax * ay;
        const i = y * w + x; g[i] = Math.max(0, Math.min(255, g[i] / Math.max(40, b) * 255));
      }
    }
    return { w: c.width, h: c.height, g };
  }
  async function fileToImage(file) {
    const isPdf = /pdf$/i.test(file.type) || /\.pdf$/i.test(file.name);
    const r = isPdf ? await pdfToCanvas(file) : await imageToCanvas(file);
    r.isPdf = isPdf;
    r.grey = canvasToGrey(r.canvas, !isPdf);
    return r;
  }

  const yieldUI = () => new Promise(r => setTimeout(r, 0));

  // Full scan: file → { canvas, grey, words, frame, picks, info }
  async function scanFile(file, progress) {
    const DS = root.DrawScan;
    progress = progress || (() => {});
    progress("Opening the drawing…", 0.02);
    const im = await fileToImage(file); await yieldUI();
    progress("Finding the text on the sheet…", 0.06); await yieldUI();
    const img = im.grey, thr = DS.threshold(img), cc0 = DS.components(img, thr), H = DS.charSize(cc0), frame = DS.findFrame(cc0);
    await yieldUI();
    progress("Removing lines so the numbers stand alone…", 0.1); await yieldUI();
    const clean = DS.removeLines(img, thr, H);
    await yieldUI();
    const cc = DS.components(clean, thr);
    const groups = DS.textGroups(cc, H).filter(g => g.nChars >= 2);
    const ocr = await engine(t => progress(t, 0.14));
    const words = [];
    let t0 = performance.now();
    for (let k = 0; k < groups.length; k++) {
      const g = groups[k];
      const r = await DS.readGroup(cc, g, pgm => ocr.read(pgm));
      words.push({ box: g.box, angle: +(g.angle * 180 / Math.PI).toFixed(1), text: r.text, conf: r.conf, tok: r.tok, H: g.Hg || g.H });
      if (performance.now() - t0 > 60) { progress(`Reading the numbers… ${k + 1} of ${groups.length}`, 0.15 + 0.8 * (k + 1) / groups.length); await yieldUI(); t0 = performance.now(); }
    }
    progress("Matching numbers to frame dimensions…", 0.97); await yieldUI();
    const map = DS.mapFields(words, frame);
    return { canvas: im.canvas, isPdf: im.isPdf, pages: im.pages, words: map.words, frame, picks: map.picks, info: map.info, H };
  }

  root.FrameOCR = { engine, fileToImage, scanFile, loadScript };
})(typeof window !== "undefined" ? window : globalThis);
