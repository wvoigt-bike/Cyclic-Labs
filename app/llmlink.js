// ============================================================================
//  AI LINK — the "AI link" button and light in the top bar.
//
//  Cyclic Labs never talks to an AI itself. When an AI assistant (Claude,
//  ChatGPT/Codex…) is working in this folder, it writes a tiny status file,
//  app/local/llm_link.js, via tools/llm_link.sh:
//    window.LLM_LINK = {"agent":"Claude","state":"idle","at":<ms>,"edited":<ms>};
//  Claude does this on its own (.claude/settings.json hooks); other assistants
//  are asked to in AGENTS.md. This file re-reads it every few seconds and shows:
//    green  = an AI has this folder open (pulsing while it works)
//    amber  = one did, but it has gone quiet for a long time (probably closed)
//    red    = no AI linked
//  Nothing is sent anywhere. app/local/ is git-ignored.
//  (While no AI is linked, the browser console logs a "file not found" for
//  local/llm_link.js on each check. That's expected.)
// ============================================================================
(function () {
  "use strict";
  const SRC = "local/llm_link.js";
  const BUSY_QUIET = 20 * 60e3;   // "working" with no news for this long → amber
  const IDLE_QUIET = 3 * 3600e3;  // "linked" with no news for this long → amber
  const loadedAt = Date.now();
  let info = null, lastState = "", timer = 0, tries = 0;

  const css = `
.llmmenu > summary { display: flex; align-items: center; gap: 6px; }
.llmdot { width: 10px; height: 10px; border-radius: 50%; flex: none; background: var(--bad); box-shadow: 0 0 0 2px color-mix(in srgb, var(--bad) 25%, transparent); }
.llmdot.on { background: var(--ok); box-shadow: 0 0 0 2px color-mix(in srgb, var(--ok) 30%, transparent); }
.llmdot.stale { background: var(--warn); box-shadow: 0 0 0 2px color-mix(in srgb, var(--warn) 30%, transparent); }
@media (prefers-reduced-motion: no-preference) { .llmdot.busy { animation: llmpulse 1.2s ease-in-out infinite; } @keyframes llmpulse { 50% { box-shadow: 0 0 0 5px color-mix(in srgb, var(--ok) 10%, transparent); } } }
.llmmenu .llmnew { width: 7px; height: 7px; border-radius: 50%; background: var(--accent); margin-left: -2px; }
.llmmenu .helppanel { width: min(360px, calc(100vw - 32px)); }
.llmstat { display: flex; gap: 10px; align-items: flex-start; }
.llmstat .llmdot { margin-top: 5px; width: 12px; height: 12px; }
.llmstat b { display: block; font-size: 15px; }
.llmstat span { font-size: 12.5px; color: var(--muted); }
.llmreload { border: 1px solid var(--accent); background: var(--accent-soft); border-radius: 8px; padding: 8px 10px; font-size: 13px; display: flex; flex-direction: column; gap: 6px; }
.llmsteps { margin: 0; padding-left: 20px; font-size: 13.5px; display: flex; flex-direction: column; gap: 6px; }
.llmpath { display: flex; gap: 6px; align-items: center; margin-top: 4px; }
.llmpath code { flex: 1; min-width: 0; overflow-wrap: anywhere; font: 12px var(--font-data, monospace); background: var(--bg); border: 1px solid var(--line); border-radius: 5px; padding: 4px 6px; }
.llmpath button, .llmask button { padding: 3px 8px; font-size: 12px; flex: none; }
.llmask { display: flex; flex-direction: column; gap: 4px; }
.llmask div { display: flex; gap: 6px; align-items: center; font-size: 13px; }
.llmask div span { flex: 1; font-style: italic; }
.llmmenu details > summary { font-size: 13px; }
@media (max-width: 520px) { .llmmenu .tlabel { display: none; } }
`;

  function folderPath() {
    if (location.protocol !== "file:") return "";
    let p = decodeURIComponent(location.pathname).replace(/\/app\/[^/]*$/, "");
    if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1).replace(/\//g, "\\");   // Windows: /Z:/x → Z:\x
    return p;
  }

  function ago(ms) {
    const m = Math.round(ms / 60e3);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    return h < 48 ? h + " h ago" : Math.round(h / 24) + " days ago";
  }

  function status() {
    if (!info || !info.at) return { cls: "", title: "No AI linked", sub: "Link Claude or ChatGPT to this folder to make changes by asking in plain English." };
    const who = String(info.agent || "AI").slice(0, 30), age = Date.now() - info.at;
    if (info.state === "off") return { cls: "", title: "No AI linked", sub: who + " closed this folder " + ago(age) + "." };
    if (info.state === "busy") return age < BUSY_QUIET
      ? { cls: "on busy", title: who + " is working…", sub: "Linked to this folder. Last activity " + ago(age) + "." }
      : { cls: "stale", title: who + " has gone quiet", sub: "Last activity " + ago(age) + ". It may have been closed." };
    return age < IDLE_QUIET
      ? { cls: "on", title: who + " is linked", sub: "Waiting for your next request. Last activity " + ago(age) + "." }
      : { cls: "stale", title: who + " was linked earlier", sub: "No activity since " + ago(age) + ". It may have been closed." };
  }

  const el = (h) => { const d = document.createElement("div"); d.innerHTML = h.trim(); return d.firstChild; };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function copy(text, btn) {
    const done = () => { const t = btn.textContent; btn.textContent = "Copied"; setTimeout(() => (btn.textContent = t), 1200); };
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(done, () => fallback());
    else fallback();
    function fallback() { const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); try { document.execCommand("copy"); done(); } catch (e) {} ta.remove(); }
  }

  const ASKS = [
    "Add the Fox 34 Step-Cast fork to the parts library.",
    "Make the design chat understand \"stack to reach ratio\".",
    "Explain how the toe-overlap check works.",
  ];

  let menu, dot, newDot, panel;

  function build() {
    const ctl = document.querySelector("header.top .topctl");
    if (!ctl) return false;
    const st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);
    menu = el(`<details class="helpmenu llmmenu" id="llmMenu">
      <summary title="Link an AI assistant (Claude, ChatGPT) to change Cyclic Labs by asking in plain English"><span class="llmdot" aria-hidden="true"></span><span class="tlabel">AI link</span><span class="llmnew" hidden></span></summary>
      <div class="helppanel" role="dialog" aria-label="AI link"></div></details>`);
    dot = menu.querySelector("summary .llmdot"); newDot = menu.querySelector(".llmnew"); panel = menu.querySelector(".helppanel");
    const chat = ctl.querySelector("#btnChat");
    ctl.insertBefore(menu, chat || ctl.firstChild);
    menu.addEventListener("toggle", () => { if (menu.open) render(); });
    document.addEventListener("pointerdown", (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && menu.open) { menu.open = false; menu.querySelector("summary").focus(); } });
    panel.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.copy != null) copy(b.dataset.copy, b);
      if (b.dataset.act === "reload") location.reload();
    });
    return true;
  }

  function render() {
    const s = status(), linked = /on/.test(s.cls);
    const path = folderPath();
    const edited = info && info.edited > loadedAt;
    const unsaved = (() => { const e = document.getElementById("hdrEdited"); return e && !e.hidden; })();
    const steps = `
      <ol class="llmsteps">
        <li>Get the <b>Claude desktop app</b> (<a href="https://claude.ai/download" target="_blank" rel="noopener">claude.ai/download</a>). ChatGPT's <b>Codex</b> app works too.</li>
        <li>Start a new task and choose this folder:
          ${path ? `<div class="llmpath"><code>${esc(path)}</code><button type="button" data-copy="${esc(path)}">Copy</button></div>`
                 : `<div class="hint">the Cyclic Labs folder (the one with <b>Start Cyclic Labs</b> in it).</div>`}</li>
        <li>This light turns <b>green</b> when the AI has the folder open. Then ask for a change.</li>
      </ol>`;
    const asks = `<div class="llmask"><div class="sub-h">Try asking</div>${ASKS.map((a) => `<div><span>${esc(a)}</span><button type="button" data-copy="${esc(a)}">Copy</button></div>`).join("")}</div>`;
    panel.innerHTML = `
      <div class="llmstat"><span class="llmdot ${s.cls}" aria-hidden="true"></span><div><b>${esc(s.title)}</b><span>${esc(s.sub)}</span></div></div>
      ${edited ? `<div class="llmreload"><span>The AI changed Cyclic Labs since you opened this page. Reload to see the changes.${unsaved ? " <b>Save your bike first</b> (it has unsaved edits)." : ""}</span><button type="button" class="primary" data-act="reload">Reload now</button></div>` : ""}
      ${linked ? asks + `<details><summary>How linking works</summary>${steps}</details>` : `<div class="sub-h">How to link an AI</div>${steps}${asks}`}
      <p class="hint">Using ChatGPT/Codex and the light stays red? Ask it to "follow AGENTS.md". Nothing leaves your computer: the AI writes a small status file (<code>app/local/llm_link.js</code>) in this folder and this page reads it.</p>`;
  }

  function paint() {
    const s = status();
    dot.className = "llmdot " + s.cls;
    menu.querySelector("summary").title = s.title + " (AI link: click for details)";
    newDot.hidden = !(info && info.edited > loadedAt);
    const key = s.cls + "|" + s.title + "|" + (info && info.edited);
    if (menu.open && key !== lastState) render();
    lastState = key;
  }

  function poll() {
    clearTimeout(timer);
    if (document.visibilityState === "hidden") { timer = setTimeout(poll, 5000); return; }
    const old = document.getElementById("llmLinkData"); if (old) old.remove();
    try { delete window.LLM_LINK; } catch (e) { window.LLM_LINK = undefined; }
    const sc = document.createElement("script");
    sc.id = "llmLinkData";
    sc.src = SRC + "?t=" + Date.now();
    const next = (found) => {
      tries = found ? 0 : tries + 1;
      // quick checks while linked; slow down when nothing is there (fewer console messages)
      timer = setTimeout(poll, found ? 3000 : tries < 20 ? 5000 : 15000);
    };
    sc.onload = () => { const d = window.LLM_LINK; info = d && typeof d === "object" ? { agent: d.agent, state: d.state, at: +d.at || 0, edited: +d.edited || 0 } : null; paint(); next(!!info); };
    sc.onerror = () => { info = null; paint(); next(false); };
    document.head.appendChild(sc);
  }

  function start() { if (build()) { paint(); poll(); document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") poll(); }); } }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.FrameLLMLink = { status: () => status(), refresh: poll };
})();
