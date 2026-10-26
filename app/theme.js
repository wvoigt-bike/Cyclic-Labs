/* Cyclic Labs — theme: Auto (follow the computer) / Light / Dark / Custom colours.
   window.FrameTheme = { get, set(mode), setCustom({accent,bg,panel,ink}), presets, isDark(), toggle() }
   Stored in localStorage "frameBench.theme" = { mode, custom: {accent, bg, panel, ink} }.
   Light/dark/auto use the CSS tokens in page.html (:root / [data-theme]). Custom picks a light or dark base from the
   background's brightness, then overrides the main tokens inline on <html> with plain hex values (the canvases and the
   3D view read these tokens and parse hex, so no color-mix() here). Every change fires "cycliclabs:theme" on window.
   Loaded right after the <style> block so the saved theme is on before the page paints. */
(function (root) {
  "use strict";
  const KEY = "frameBench.theme";
  const DEF = { accent: "#6a3fb5", bg: "#eef0f3", panel: "#ffffff", ink: "#1b2330" };
  const PRESETS = [
    { id: "cerakote", name: "Cerakote purple", accent: "#6a3fb5", bg: "#eef0f3", panel: "#ffffff", ink: "#1b2330" },
    { id: "rawti", name: "Raw titanium", accent: "#3f6378", bg: "#e7e5e1", panel: "#f7f6f3", ink: "#22252a" },
    { id: "anodised", name: "Anodised blue", accent: "#1f6fd1", bg: "#eaf1f8", panel: "#ffffff", ink: "#132235" },
    { id: "burnt", name: "Burnt Ti", accent: "#e0893a", bg: "#17161c", panel: "#211f28", ink: "#ece6dd" },
    { id: "forest", name: "Forest gravel", accent: "#3f8f5a", bg: "#eef1ea", panel: "#fbfcf9", ink: "#1d2a20" },
    { id: "night", name: "Night ride", accent: "#4fc3d9", bg: "#0d1117", panel: "#161b22", ink: "#e6edf3" },
  ];
  const VARS = ["--bg", "--panel", "--ink", "--accent", "--muted", "--line", "--accent-soft", "--on-accent", "--wheel"];

  // ---- colour maths (hex in, hex out)
  const hx = h => { h = String(h || "").trim().replace("#", ""); if (h.length === 3) h = h.split("").map(c => c + c).join(""); return /^[0-9a-f]{6}$/i.test(h) ? h.toLowerCase() : null; };
  const rgb = h => { const n = parseInt(hx(h), 16); return [n >> 16 & 255, n >> 8 & 255, n & 255]; };
  const toHex = a => "#" + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
  const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return toHex(A.map((v, i) => v + (B[i] - v) * t)); };   // t = share of b
  const lum = h => { const c = rgb(h).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
  const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

  function clean(c) {
    const o = Object.assign({}, DEF);
    if (c) for (const k of Object.keys(DEF)) { const v = hx(c[k]); if (v) o[k] = "#" + v; }
    return o;
  }
  function derive(c) {
    const dark = lum(c.bg) < 0.18;
    return {
      dark,
      vars: {
        "--bg": c.bg, "--panel": c.panel, "--ink": c.ink, "--accent": c.accent,
        "--muted": mix(c.ink, c.panel, 0.4),
        "--line": mix(c.ink, c.panel, dark ? 0.8 : 0.84),
        "--accent-soft": mix(c.accent, c.panel, dark ? 0.78 : 0.86),
        "--on-accent": contrast(c.accent, "#ffffff") >= contrast(c.accent, "#14171d") ? "#ffffff" : "#14171d",
        "--wheel": mix(c.ink, c.bg, dark ? 0.78 : 0.72),
      },
    };
  }

  // ---- state
  let st = { mode: "auto", custom: clean(null) };
  try { const v = JSON.parse(localStorage.getItem(KEY) || "null"); if (v && /^(auto|light|dark|custom)$/.test(v.mode)) st = { mode: v.mode, custom: clean(v.custom) }; } catch (e) {}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} };
  const mq = root.matchMedia ? root.matchMedia("(prefers-color-scheme: dark)") : null;

  function apply() {
    const html = document.documentElement;
    for (const v of VARS) html.style.removeProperty(v);
    if (st.mode === "light" || st.mode === "dark") html.setAttribute("data-theme", st.mode);
    else if (st.mode === "custom") {
      const d = derive(st.custom);
      html.setAttribute("data-theme", d.dark ? "dark" : "light");
      for (const [k, v] of Object.entries(d.vars)) html.style.setProperty(k, v);
    } else html.removeAttribute("data-theme");
    html.dataset.fbTheme = st.mode;   // not data-theme-mode: that name is the menu buttons' selector
    syncUI();
    try { root.dispatchEvent(new CustomEvent("cycliclabs:theme", { detail: get() })); } catch (e) {}
  }
  function isDark() {
    if (st.mode === "custom") return derive(st.custom).dark;
    if (st.mode === "light" || st.mode === "dark") return st.mode === "dark";
    return !!(mq && mq.matches);
  }
  function get() { return { mode: st.mode, custom: Object.assign({}, st.custom), dark: isDark() }; }
  function set(mode) { if (!/^(auto|light|dark|custom)$/.test(mode)) return false; st.mode = mode; save(); apply(); return true; }
  function setCustom(c) { st.custom = clean(Object.assign({}, st.custom, c || {})); st.mode = "custom"; save(); apply(); }
  function toggle() { return set(isDark() ? "light" : "dark"); }
  if (mq && mq.addEventListener) mq.addEventListener("change", () => { if (st.mode === "auto") syncUI(); });

  // printing on a dark or coloured page wastes ink: print in the light theme, then put it back
  let printSaved = null;
  root.addEventListener("beforeprint", () => { if (st.mode === "light") return; printSaved = st.mode; st.mode = "light"; apply(); st.mode = printSaved; });
  root.addEventListener("afterprint", () => { if (printSaved) { printSaved = null; apply(); } });

  // ---- header menu (#themeMenu in page.html)
  const $ = s => document.querySelector(s);
  function syncUI() {
    const menu = $("#themeMenu"); if (!menu) return;
    menu.querySelectorAll("[data-theme-mode]").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.themeMode === st.mode)));
    const icon = $("#themeIcon"); if (icon) icon.textContent = st.mode === "custom" ? "🎨" : isDark() ? "☾" : "☀";
    const box = $("#themeCustom"); if (box) box.hidden = st.mode !== "custom";
    for (const k of Object.keys(DEF)) { const i = $("#tc-" + k); if (i && i.value !== st.custom[k]) i.value = st.custom[k]; }
    menu.querySelectorAll("[data-preset]").forEach(b => { const p = PRESETS.find(x => x.id === b.dataset.preset); b.setAttribute("aria-pressed", String(!!p && Object.keys(DEF).every(k => p[k] === st.custom[k]))); });
    const warn = $("#themeWarn");
    if (warn) {
      const c = st.custom, low = [];
      if (contrast(c.ink, c.panel) < 4.5 || contrast(c.ink, c.bg) < 4.5) low.push("text is hard to read on the background");
      if (contrast(c.accent, c.panel) < 2.6) low.push("the accent hardly shows on the panels");
      warn.hidden = !low.length; warn.textContent = low.length ? "Heads-up: " + low.join(", and ") + "." : "";
    }
  }
  function wire() {
    const menu = $("#themeMenu"); if (!menu) return;
    const sw = $("#themePresets");
    if (sw && !sw.childElementCount) sw.innerHTML = PRESETS.map(p =>
      `<button type="button" class="tswatch" data-preset="${p.id}" title="${p.name}" aria-label="${p.name}" style="--sw-bg:${p.bg};--sw-panel:${p.panel};--sw-accent:${p.accent};--sw-ink:${p.ink}"><i></i><span>${p.name}</span></button>`).join("");
    menu.addEventListener("click", e => {
      const m = e.target.closest("button[data-theme-mode]"); if (m && menu.contains(m)) { set(m.dataset.themeMode); return; }
      const p = e.target.closest("[data-preset]"); if (p) { const x = PRESETS.find(q => q.id === p.dataset.preset); if (x) setCustom({ accent: x.accent, bg: x.bg, panel: x.panel, ink: x.ink }); return; }
      if (e.target.closest("#themeReset")) setCustom(DEF);
    });
    for (const k of Object.keys(DEF)) { const i = $("#tc-" + k); if (i) i.addEventListener("input", () => setCustom({ [k]: i.value })); }
    document.addEventListener("click", e => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    const help = $("#helpMenu");   // only one of the two header menus open at a time
    menu.addEventListener("toggle", () => { if (menu.open && help) help.open = false; });
    if (help) help.addEventListener("toggle", () => { if (help.open) menu.open = false; });
    syncUI();
  }

  apply();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", wire); else wire();
  root.FrameTheme = { get, set, setCustom, toggle, isDark, presets: PRESETS, defaults: DEF, _derive: derive };
})(window);
