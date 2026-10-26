// ============================================================================
//  CALCULIX BRIDGE
//  Turns a Cyclic Labs model into a CalculiX (ccx) input deck, and reads the
//  results (.dat / .frd) back. Beam model: one B32R element per Cyclic Labs
//  element, PIPE / BOX / RECT sections, one *STEP per load case.
// ============================================================================
(function (root) {
  "use strict";
  const FEA = root.FrameFEA || (typeof require !== "undefined" ? require("./fea.js") : null);
  const f = v => (Math.abs(v) < 1e-12 ? 0 : v).toPrecision(9).replace(/\.?0+(e|$)/, "$1");

  // Box that matches an oval tube's bending stiffness in both directions (same outside size, adjusted walls)
  function boxForOval(s) {
    // walls tA (the two walls across the height) and tB (the two across the width) chosen so Iz, Iy match
    const h = s.h, w = s.w;
    const Ibox = (tH, tW) => ({ Iz: (w * h ** 3 - (w - 2 * tW) * (h - 2 * tH) ** 3) / 12, Iy: (h * w ** 3 - (h - 2 * tH) * (w - 2 * tW) ** 3) / 12 });
    let tH = s.t * 0.785, tW = s.t * 0.785;
    for (let it = 0; it < 60; it++) {
      const I = Ibox(tH, tW);
      tH *= Math.pow(s.Iz / I.Iz, 0.5); tW *= Math.pow(s.Iy / I.Iy, 0.5);
      tH = Math.min(tH, h / 2.2); tW = Math.min(tW, w / 2.2);
    }
    return { tH, tW };
  }

  // cases: [{ name, fix: [[nodeName, [dof0..5]]], F: Float64Array (Cyclic Labs DOF vector) }]
  function buildInp(model, cases, opts = {}) {
    const m = model.design.material, out = [];
    const L = s => out.push(s);
    const nn = model.nodes.length;
    L("** Cyclic Labs -> CalculiX beam model");
    L(`** design: ${(opts.title || "").replace(/\n/g, " ")}`);
    L("** units: mm, N, MPa.  x forward, y up, z drive side.");
    L("*NODE,NSET=NALL");
    model.nodes.forEach((nd, i) => L(`${i + 1},${f(nd.p[0])},${f(nd.p[1])},${f(nd.p[2])}`));
    const mid = [];
    model.elements.forEach((e, k) => {
      const a = model.nodes[e.n1].p, b = model.nodes[e.n2].p, id = nn + 1 + k;
      mid.push(id);
      L(`${id},${f((a[0] + b[0]) / 2)},${f((a[1] + b[1]) / 2)},${f((a[2] + b[2]) / 2)}`);
    });
    model.elements.forEach((e, k) => {
      L(`*ELEMENT,TYPE=B32R,ELSET=E${k + 1}`);
      L(`${k + 1},${e.n1 + 1},${mid[k]},${e.n2 + 1}`);
    });
    L("*ELSET,ELSET=EALL,GENERATE"); L(`1,${model.elements.length},1`);
    L("*MATERIAL,NAME=TI"); L("*ELASTIC"); L(`${f(m.E)},${f(m.nu)}`);
    L("*MATERIAL,NAME=AL"); L("*ELASTIC"); L("70000.,0.33");
    L("*MATERIAL,NAME=STEEL"); L("*ELASTIC"); L("200000.,0.3");
    // rigid parts: PIPE r=10, t=5 with E chosen so bending stiffness EI matches Cyclic Labs' rigid section (210000 × 5e6)
    const Ipipe = Math.PI / 4 * (10 ** 4 - 5 ** 4);
    L("*MATERIAL,NAME=RIGID"); L("*ELASTIC"); L(`${f(210000 * 5e6 / Ipipe)},0.3`);
    // seatpost sections carry their own (effective) modulus
    const postMats = new Map();
    model.elements.forEach(e => { const s = e.section; if (s.post && !postMats.has(s.E)) { const nm = "POST" + (postMats.size + 1); postMats.set(s.E, nm); L(`*MATERIAL,NAME=${nm}`); L("*ELASTIC"); L(`${f(s.E)},0.33`); } });
    model.elements.forEach((e, k) => {
      const mem = model.members[e.member], s = e.section;
      const a = model.nodes[e.n1].p, b = model.nodes[e.n2].p;
      const ax = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], len = Math.hypot(...ax);
      // local 1-direction: sideways (global z) for tubes in the side plane; up (global y) for sideways members
      const n1 = Math.abs(ax[2] / len) > 0.7 ? "0.,1.,0." : "0.,0.,1.";
      const matName = s.rigid ? "RIGID" : s.post ? postMats.get(s.E) : (mem.group === "seatpost" || mem.group === "postInserted") ? "AL" : mem.group === "axle" ? "STEEL" : "TI";
      if (s.rigid) { L(`*BEAM SECTION,ELSET=E${k + 1},MATERIAL=RIGID,SECTION=PIPE`); L("10.,5."); L(n1); return; }
      if (s.plate) {
        // RECT: thickness in 1-direction, then 2-direction. 1 = sideways → plate thickness w, 2 = height h
        L(`*BEAM SECTION,ELSET=E${k + 1},MATERIAL=${matName},SECTION=RECT`); L(`${f(s.w)},${f(s.h)}`); L(n1); return;
      }
      if (s.round) { L(`*BEAM SECTION,ELSET=E${k + 1},MATERIAL=${matName},SECTION=PIPE`); L(`${f(s.h / 2)},${f(s.t)}`); L(n1); return; }
      // oval → box with matched stiffness. a (1-direction, sideways) = width, b (2-direction) = height
      const bx = boxForOval(s);
      L(`*BEAM SECTION,ELSET=E${k + 1},MATERIAL=${matName},SECTION=BOX`);
      // t1 = wall on the +1 face (a side wall), t2 = +2 face (top), t3 = −1, t4 = −2
      L(`${f(s.w)},${f(s.h)},${f(bx.tW)},${f(bx.tH)},${f(bx.tW)},${f(bx.tH)}`); L(n1);
    });
    // named node sets for supports
    const named = {};
    for (const [nm, idx] of Object.entries(model.nodeIdx)) named[nm] = idx + 1;
    cases.forEach((c, ci) => {
      L(`*STEP`); L(`*STATIC`);
      L(`** load case ${ci + 1}: ${c.name}`);
      L("*BOUNDARY,OP=NEW");
      const done = new Set();
      for (const [nm, dofs] of c.fix) for (const d of dofs) { const key = named[nm] + "_" + d; if (done.has(key)) continue; done.add(key); L(`${named[nm]},${d + 1},${d + 1},0.`); }
      L("*CLOAD,OP=NEW");
      let any = false;
      for (let i = 0; i < c.F.length; i++) if (Math.abs(c.F[i]) > 1e-9) { L(`${Math.floor(i / 6) + 1},${(i % 6) + 1},${f(c.F[i])}`); any = true; }
      if (!any) L("1,1,0.");
      L("*NODE PRINT,NSET=NALL"); L("U");
      if (ci === 0) { L("*NODE FILE,OUTPUT=2D"); L("U"); L("*EL FILE,SECTION FORCES"); L("S"); }
      L("*END STEP");
    });
    return { text: out.join("\n") + "\n", midNodes: mid };
  }

  // ---------------------------------------------------------------- results
  const FLOAT = /[-+]?\d*\.\d+(?:[EeDd]?[-+]\d+)?/g;
  const toNum = t => parseFloat(/[EeDd]/.test(t) ? t.replace(/[Dd]/, "E") : t.replace(/(\d)([-+]\d{2,3})$/, "$1E$2"));
  // .dat: displacements per step → { steps: [ Map(node -> [ux,uy,uz]) ] }
  function parseDat(text) {
    const steps = []; let cur = null, mode = null;
    for (const line of text.split(/\r?\n/)) {
      if (/S T E P/.test(line)) { cur = new Map(); steps.push(cur); mode = null; cur.time = undefined; continue; }
      if (/^\s*displacements \(vx,vy,vz\)/.test(line)) {
        // ccx 2.13 has no "S T E P" banner: each displacement block at a new time starts a new step
        const t = (line.match(/time\s+(\S+)/) || [])[1];
        if (!cur || (t && cur.time !== undefined && cur.time !== t)) { cur = new Map(); steps.push(cur); }
        cur.time = t; mode = "U"; continue;
      }
      if (/^\s*[a-z]/i.test(line)) { mode = null; continue; }
      if (mode === "U" && cur) {
        const m = line.match(/^\s*(\d+)\s+(.*)$/); if (!m) continue;
        const vals = (m[2].match(FLOAT) || []).map(toNum);
        if (vals.length >= 3) cur.set(parseInt(m[1], 10), vals.slice(0, 3));
      }
    }
    return { steps };
  }
  // .frd (ASCII, short or long format): nodes + result blocks → { nodes: Map, blocks: [{step, name, comps, data: Map(node -> values)}] }
  function parseFrd(text) {
    const nodes = new Map(), blocks = []; let blk = null, section = null, step = 0;
    for (const line of text.split(/\r?\n/)) {
      if (line.startsWith("    2C")) { section = "nodes"; continue; }
      if (line.startsWith("    3C")) { section = "elems"; continue; }
      if (line.startsWith("    1PSTEP")) { const p = line.trim().split(/\s+/); step = parseInt(p[p.length - 1], 10) || step + 1; continue; }
      if (line.startsWith("  100C")) { blk = { step, name: "", comps: [], data: new Map() }; blocks.push(blk); section = "result"; continue; }
      if (line.startsWith(" -4")) { if (blk) blk.name = line.substr(3).trim().split(/\s+/)[0]; continue; }
      if (line.startsWith(" -5")) { if (blk) { const c = line.substr(3).trim().split(/\s+/)[0]; if (c !== "ALL") blk.comps.push(c); } continue; }
      if (line.startsWith(" -3")) { section = null; continue; }
      if (line.startsWith(" -1") && (section === "nodes" || section === "result")) {
        const m = line.substr(3).match(/^\s*(\d+)(.*)$/); if (!m) continue;
        const vals = (m[2].match(FLOAT) || []).map(toNum);
        if (section === "nodes") nodes.set(parseInt(m[1], 10), vals.slice(0, 3));
        else blk.data.set(parseInt(m[1], 10), vals);
      }
    }
    return { nodes, blocks };
  }

  root.FrameCCX = { buildInp, parseDat, parseFrd, boxForOval };
  if (typeof module !== "undefined") module.exports = root.FrameCCX;
})(typeof window !== "undefined" ? window : globalThis);
