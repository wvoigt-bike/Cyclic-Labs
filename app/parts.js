// ============================================================================
//  PARTS OVERLAY
//  Draw-only 3D models of the parts hung on the frame: fork, wheels & tyres,
//  brake rotors, dropper post & saddle, stem & bars, cranks & drivetrain.
//  None of this changes the stress analysis (except "use this fork's numbers",
//  which the page applies to the geometry on request).
//  Output: a list of line segments in frame coordinates (mm; x forward, y up,
//  z drive side) with a drawn width in mm and a colour role.
// ============================================================================
(function (root) {
  "use strict";
  // Fork presets. Axle-to-crown figures are approximate (29", 44 mm offset): check the maker's chart before ordering.
  const FORKS = {
    fox34sc120: { label: "Fox 34 Step-Cast Factory, 120 mm", travel: 120, a2c: 530, offset: 44, stanchion: 34, lower: 40, legHalf: 66, arch: 1 },
    sidUlt120: { label: "RockShox SID Ultimate, 120 mm", travel: 120, a2c: 529, offset: 44, stanchion: 35, lower: 41, legHalf: 68, arch: 1 },
    sidUlt110: { label: "RockShox SID Ultimate, 110 mm", travel: 110, a2c: 519, offset: 44, stanchion: 35, lower: 41, legHalf: 68, arch: 1 },
    sidSL100:  { label: "RockShox SID SL, 100 mm",       travel: 100, a2c: 503, offset: 44, stanchion: 32, lower: 38, legHalf: 66, arch: 1 },
    pike130:   { label: "RockShox Pike, 130 mm",         travel: 130, a2c: 551, offset: 44, stanchion: 35, lower: 42, legHalf: 70, arch: 1 },
    pike140:   { label: "RockShox Pike, 140 mm",         travel: 140, a2c: 561, offset: 44, stanchion: 35, lower: 42, legHalf: 70, arch: 1 },
    fox34_130: { label: "Fox 34, 130 mm",                travel: 130, a2c: 551, offset: 44, stanchion: 34, lower: 41, legHalf: 68, arch: 1 },
    rigid:     { label: "Rigid carbon fork (gravel / road)", travel: 0, a2c: null, offset: null, stanchion: 0, lower: 30, legHalf: 56, arch: 0, style: "gravel" }
  };
  // Dropper presets. stack = collar top to rail centre with the post fully down; collar = collar height above the frame.
  const DROPPERS = {
    oneupV3_150: { label: "OneUp V3, 150 mm", travel: 150, stack: 30, collar: 12, stanchion: 26 },
    oneupV3_180: { label: "OneUp V3, 180 mm", travel: 180, stack: 30, collar: 12, stanchion: 26 },
    oneupV3_210: { label: "OneUp V3, 210 mm", travel: 210, stack: 30, collar: 12, stanchion: 26 },
    oneupV3_240: { label: "OneUp V3, 240 mm", travel: 240, stack: 30, collar: 12, stanchion: 26 },
    rigidPost:   { label: "Rigid post", travel: 0, stack: 0, collar: 0, stanchion: 0 }
  };
  // Realistic-view choices (display only; the analysis never reads these)
  const GROUPSETS = {
    auto:       { label: "Same as the analysis (singlespeed when the frame is set up for it)" },
    singlespeed: { label: "Singlespeed: one ring, one cog, sliding dropouts" },
    sramEagle:  { label: "SRAM Eagle 12-speed (Transmission)", cogs: [10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 52] },
    shimanoXT:  { label: "Shimano XT 12-speed", cogs: [10, 12, 14, 16, 18, 21, 24, 28, 33, 39, 45, 51] },
    sramRoad:   { label: "SRAM Red / Force AXS 12-speed road (10-33)", cogs: [10, 11, 12, 13, 14, 15, 17, 19, 21, 24, 28, 33] }
  };
  const SADDLES = {
    shortNose: { label: "Short-nose MTB saddle (cut-out)", length: 245, width: 142, nose: 54, kick: 5, dip: 3, cutout: true },
    midCutout: { label: "Mid-length saddle with cut-out", length: 270, width: 143, nose: 40, kick: 6, dip: 3, cutout: true },
    classic:   { label: "Classic long-nose saddle", length: 275, width: 138, nose: 36, kick: 10, dip: 7, cutout: false },
    flat:      { label: "Flat-profile saddle", length: 268, width: 140, nose: 42, kick: 2, dip: 1, cutout: false }
  };
  const PEDALS = { flat: { label: "Flat pedals with pins" }, clip: { label: "Clip-in pedals (trail SPD)" } };
  const FINISHES = {
    wPurple: { label: "Purple front triangle, raw brushed Ti stays" },
    raw:     { label: "Raw brushed titanium all over" },
    painted: { label: "Whole frame painted" },
    tiSplit: { label: "Raw Ti, two textures: bead-blasted front / brushed rear (split line across the frame)" },
    tiSplitFlip: { label: "Raw Ti, two textures: brushed front / bead-blasted rear (split line across the frame)" }
  };
  const BRAKES = { shimano: { label: "Shimano XT 4-piston" }, sram: { label: "SRAM 4-piston (Code / Maven look)" } };
  const SMALL_COLOURS = { silver: { label: "Silver (Chris King look)" }, black: { label: "Black" }, purple: { label: "Purple" }, gold: { label: "Gold" } };
  const DEFAULTS = {
    fork: "sidUlt120", dropper: "oneupV3_150", tyreWidth: 61, rimDepth: 24, rotorF: 180, rotorR: 180,
    stemLength: 50, stemRise: 0, spacers: 10, barType: "flat", barWidth: 760, barRise: 20, backsweep: 8, upsweep: 5, crankAngle: 25,
    // realistic view
    groupset: "auto", crankLen: "auto", pedals: "flat", spokes: 28, tyreSide: "black", brakes: "shimano", saddle: "shortNose",
    finish: "wPurple", paintColor: "#5b2d8e", paintFinish: "satin", welds: "dimes", headLogo: "", logoColor: "#f5c400", dtLogo: "", dtLogoColor: "#1b2333", smallColor: "silver",
    splitAt: 67, splitAngle: 90   // finish tiSplit / tiSplitFlip: line crosses the down tube this % of the way up from the BB, at this angle (°) to it
  };

  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const num = (v, d) => (v === "" || v == null || !isFinite(+v)) ? d : +v;

  function build(result, design, show) {
    const P = result.model.geo.P, geo = result.model.geo, g = design.geometry, use = design.use || {};
    const o = Object.assign({}, DEFAULTS, design.parts || {});
    const S = [];                                                     // segments
    const seg = (a, b, w, role, extra) => S.push(Object.assign({ a, b, w, role }, extra || {}));
    const line = (pts, w, role, extra) => { for (let i = 1; i < pts.length; i++) seg(pts[i - 1], pts[i], w, role, extra); };
    // circle in the plane of unit vectors e1, e2 around c
    const ring = (c, r, e1, e2, n, w, role, extra) => { const pts = []; for (let k = 0; k <= n; k++) { const t = k / n * 2 * Math.PI; pts.push(add(c, add(mul(e1, r * Math.cos(t)), mul(e2, r * Math.sin(t))))); } line(pts, w, role, extra); };
    const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];
    const uHT = geo.uHT, up = mul(uHT, -1), nF = geo.nF, uST = geo.uST;
    const R = g.tireDiameter / 2, info = [];

    // ---------------- wheels, tyres, rotors
    if (show.wheels) {
      const tw = num(o.tyreWidth, 61), rimD = num(o.rimDepth, 24), FE = root.FrameFEA;
      for (const [axle, front] of [[P.AxleR, false], [P.AxleF, true]]) {
        const c = [axle[0], axle[1], 0];
        // each wheel its own size (mixed wheels: 29" front / 27.5" rear etc.)
        const R = front && FE && FE.frontTyreR ? FE.frontTyreR(g) : g.tireDiameter / 2, bead = FE && FE.rimBSD ? FE.rimBSD(g, front) / 2 : 311;
        const h = Math.min(tw, R - bead - 9) * 0.92, rimR = bead + 6;
        ring(c, R - h / 2, X, Y, 96, h, "rubber", { alpha: 0.9 });                       // tyre (section)
        ring(add(c, [0, 0, tw / 2 - 6]), R - h / 2, X, Y, 96, 6, "rubberEdge");          // tyre shoulders give it width in 3D
        ring(add(c, [0, 0, -tw / 2 + 6]), R - h / 2, X, Y, 96, 6, "rubberEdge");
        ring(c, rimR - rimD / 2, X, Y, 96, rimD, "rim");                                  // rim
        const flange = front ? 30 : 34, hubW = front ? 55 : 74;
        seg(add(c, [0, 0, -hubW]), add(c, [0, 0, hubW]), 14, "metal");                   // axle
        seg(add(c, [0, 0, -flange]), add(c, [0, 0, flange]), 34, "part");                // hub shell
        for (let k = 0; k < 28; k++) {                                                    // 2-cross style lacing
          const side = k % 2 ? 1 : -1, t0 = k / 28 * 2 * Math.PI, t1 = t0 + side * 0.42;
          seg(add(c, [26 * Math.cos(t0), 26 * Math.sin(t0), side * flange]), add(c, [(rimR - rimD) * Math.cos(t1), (rimR - rimD) * Math.sin(t1), 0]), 2, "spoke");
        }
      }
    }

    // brake rotors + calipers (independent of the wheels toggle)
    if (show.rotors) for (const [axle, front] of [[P.AxleR, false], [P.AxleF, true]]) {
      const c = [axle[0], axle[1], 0];
          const rr = num(front ? o.rotorF : (g.rearRotor || o.rotorR), 180) / 2, zr = front ? -46 : -58;
          ring(add(c, [0, 0, zr]), rr - 9, X, Y, 72, 18, "metal");
          ring(add(c, [0, 0, zr]), 34, X, Y, 24, 10, "part");
          // caliper: front on the fork leg, rear on the non-drive stay, just behind/under the rotor edge
          const gc = result.model.geo.caliper;
          const cal = front ? add(c, [-rr * 0.55, rr * 0.8, zr - 4]) : gc ? [gc.p[0], gc.p[1], zr - 4] : add(c, [rr * 0.2, rr * 0.95, zr - 4]);
          seg(add(cal, [-28, -6, 0]), add(cal, [28, 6, 0]), 26, "part");
    }

    // ---------------- fork
    const F = FORKS[o.fork] || FORKS.sidUlt120;
    const crownC = add(P.HTbot, mul(uHT, num(g.lowerCupStack, 0) + 14));
    const axleF = P.AxleF;
    // leg axis: through the axle, parallel to the steerer; leg top level with the crown
    const along = (p, q) => (p[0] - q[0]) * up[0] + (p[1] - q[1]) * up[1];
    const Lleg = along(crownC, axleF);
    const legTop = add([axleF[0], axleF[1], 0], mul(up, Lleg));
    if (show.fork) {
      const lh = F.legHalf;
      if (F.travel > 0) {
        const stanLen = F.travel + 75;
        for (const s of [-1, 1]) {
          const top = add(legTop, [0, 0, s * lh]), a = add([axleF[0], axleF[1], s * lh], mul(up, -12));
          seg(top, add(top, mul(up, -stanLen)), F.stanchion, "stanchion");               // stanchion
          seg(a, add(top, mul(up, -(F.travel + 35))), F.lower, "lower");                 // lower leg
        }
        if (F.arch) {                                                                      // arch in front of the lowers
          const at = add(legTop, mul(up, -(F.travel + 60))), fwd = mul(nF, 18), pts = [];
          for (let k = 0; k <= 12; k++) { const zz = -lh + 2 * lh * k / 12, bump = 40 * (1 - (zz / lh) ** 2); pts.push(add(add(at, fwd), add([0, 0, zz], mul(up, bump)))); }
          line(pts, 22, "lower");
        }
      } else {
        for (const s of [-1, 1]) {                                                         // rigid: tapered blades
          const top = add(legTop, [0, 0, s * lh]), a = [axleF[0], axleF[1], s * lh];
          seg(top, add(a, mul(up, 120)), 34, "lower"); seg(add(a, mul(up, 120)), a, 24, "lower");
        }
      }
      line([add(legTop, [0, 0, -F.legHalf - 10]), add(crownC, [0, 0, 0]), add(legTop, [0, 0, F.legHalf + 10])], 34, "crown");
      seg(add([axleF[0], axleF[1], 0], [0, 0, -F.legHalf - 12]), add([axleF[0], axleF[1], 0], [0, 0, F.legHalf + 12]), 16, "metal");   // thru-axle
    }

    // ---------------- steerer, stem, bars
    const stemStack = 40, cap = 8, spacers = num(o.spacers, 10);
    const stemC = add(P.HTtop, mul(up, cap + spacers + stemStack / 2));
    const rise = num(o.stemRise, 0) * Math.PI / 180;
    const stemDir = add(mul(nF, Math.cos(rise)), mul(up, Math.sin(rise)));
    const barC = add(stemC, mul(stemDir, num(o.stemLength, 50)));
    if (show.cockpit) {
      seg(P.HTtop, add(P.HTtop, mul(up, cap)), 50, "part");                              // top cup
      if (spacers > 0) seg(add(P.HTtop, mul(up, cap)), add(P.HTtop, mul(up, cap + spacers)), 36, "metal");
      seg(add(P.HTtop, mul(up, cap + spacers)), add(P.HTtop, mul(up, cap + spacers + stemStack)), 38, "part");   // stem steerer clamp
      seg(stemC, barC, 34, "part");                                                        // stem body
      const W = num(o.barWidth, 760) / 2, rz = num(o.barRise, 20), bs = num(o.backsweep, 8) * Math.PI / 180, us = num(o.upsweep, 5) * Math.PI / 180;
      const barPt = z => {
        const a = Math.abs(z), s = Math.sign(z) || 1;
        let y = 0, x = 0;
        if (a > 60) y += rz * Math.min(1, (a - 60) / 70);
        if (a > 130) { x -= (a - 130) * Math.tan(bs); y += (a - 130) * Math.tan(us); }
        return add(barC, [x, y, s * a]);
      };
      if (o.barType === "drop") {
        // drop bar: tops, forward reach to the hoods, then the drop curving down and back
        const Wd = Math.min(W, 260), reach = 75, drop = 125, flare = 12 * Math.PI / 180;
        line([add(barC, [0, 0, -Wd]), add(barC, [0, 0, Wd])], 26, "part");
        for (const s of [-1, 1]) {
          const pts = [];
          for (let k = 0; k <= 24; k++) {
            const t = k / 24 * Math.PI * 1.15, x = reach * Math.sin(Math.min(t, Math.PI / 2)) - (t > Math.PI / 2 ? 45 * (t - Math.PI / 2) / (0.65 * Math.PI) : 0);
            const y = -drop * (1 - Math.cos(Math.min(t, Math.PI))) / 2 - (t > Math.PI ? 15 : 0);
            pts.push(add(barC, [x, y, s * (Wd + Math.max(0, -y) * Math.tan(flare))]));
          }
          line(pts, 26, "part");
          const hood = add(barC, [reach + 5, 5, s * Wd]);
          seg(hood, add(hood, [40, 30, 0]), 30, "rubber");                                 // hoods / levers
        }
        info.push(`Drop bar ${Math.round(Wd * 2)} mm, ${Math.round(num(o.stemLength, 50))} mm stem.`);
      } else {
        const pts = []; for (let k = 0; k <= 40; k++) pts.push(barPt(-W + 2 * W * k / 40));
        line(pts, 26, "part");
        for (const s of [-1, 1]) {
          line([barPt(s * (W - 135)), barPt(s * W)], 33, "rubber");                       // grips
          const lv = barPt(s * (W - 160));                                                  // brake levers
          seg(lv, add(lv, [70, -45, s * 8]), 10, "metal");
        }
        info.push(`Bars ${Math.round(W * 2)} mm wide, ${Math.round(num(o.stemLength, 50))} mm stem.`);
      }
    }

    // ---------------- dropper post & saddle
    const D = DROPPERS[o.dropper] || DROPPERS.oneupV3_150;
    const expo = geo.postExposure;                                                          // seat-tube top to rail clamp
    if (show.post) {
      const fit = (result.comfort && result.comfort.post && result.comfort.post.fit) || 31.6;
      const atS = s => add(P.STtop, mul(uST, s));
      if (D.travel > 0) {
        const outerShow = expo - (D.collar + D.stack + D.travel);                           // outer tube showing below the collar
        const collarAt = Math.max(0, outerShow);
        if (outerShow > 0) seg(atS(0), atS(outerShow), fit, "part");
        seg(atS(collarAt), atS(collarAt + D.collar), fit + 7, "metal");                       // collar
        seg(atS(collarAt + D.collar), atS(expo - 16), D.stanchion, "stanchion");             // stanchion
        seg(atS(expo - 22), atS(expo + 8), 34, "part");                                       // head
        const maxFit = expo - D.collar - D.stack;
        info.push(outerShow >= 0
          ? `${D.label}: ${Math.round(outerShow)} mm of post shows below the collar. Travel that would fit fully down: up to about ${Math.floor(maxFit / 10) * 10} mm (check insertion depth too).`
          : `${D.label} is ${Math.round(-outerShow)} mm too tall for this saddle height: choose a shorter-travel dropper or raise the saddle.`);
        if (outerShow < 0) S.push({ a: atS(expo), b: atS(expo), w: 0, role: "warn", note: true });
      } else seg(atS(0), atS(expo + 8), fit, "part");
      // saddle: rails + shell outline at saddle-top height
      const clamp = P.Saddle, top = clamp[1] + num(g.saddleStack, 45), cx = clamp[0];
      const Ls = 250, nose = cx + 0.52 * Ls, tail = cx - 0.48 * Ls;
      for (const s of [-1, 1]) seg([nose - 25, top - 30, s * 21], [tail + 30, top - 30, s * 21], 7, "metal");
      const half = x => { const t = (nose - x) / (nose - tail); return 14 + 56 * Math.min(1, Math.max(0, (t - 0.25) / 0.45)) ** 1.4; };
      const outline = [];
      for (let k = 0; k <= 16; k++) { const x = nose - (nose - tail) * k / 16; outline.push([x, top - 6 + 4 * Math.sin(Math.PI * k / 16), half(x)]); }
      for (let k = 16; k >= 0; k--) { const x = nose - (nose - tail) * k / 16; outline.push([x, top - 6 + 4 * Math.sin(Math.PI * k / 16), -half(x)]); }
      S.push({ poly: outline, role: "saddle" });
      line(outline, 10, "saddleEdge");
    }

    // ---------------- cranks & drivetrain
    if (show.drive) {
      const bbw = num(g.bbShellWidth, 73), th = num(o.crankAngle, 25) * Math.PI / 180, L = g.crankLength;
      seg([0, 0, -bbw / 2 - 20], [0, 0, bbw / 2 + 20], 26, "metal");                      // spindle / cups
      for (const s of [1, -1]) {
        const ang = s > 0 ? -th : Math.PI - th, zc = s * (bbw / 2 + 22);
        const end = [L * Math.cos(ang), L * Math.sin(ang), zc];
        seg([0, 0, zc], end, 22, "part");
        seg(end, add(end, [0, 0, s * 95]), 24, "rubber");                                    // pedal
      }
      const cl = num(g.chainline, 52), rRing = g.chainring * 12.7 / (2 * Math.PI);
      ring([0, 0, cl], rRing, X, Y, 60, 7, "metal");
      const cogs = g.singlespeed ? [g.cog] : [10, 12, 14, 16, 18, 21, 24, 28, 32, 36, 42, 52];
      const a = P.AxleR;
      cogs.forEach((t, k) => { const zc = g.singlespeed ? cl : 18 + (cogs.length - 1 - k) * 3.9; ring([a[0], a[1], zc], t * 12.7 / (2 * Math.PI), X, Y, 40, 3.5, "metal"); });
      const rCog = (g.singlespeed ? g.cog : 24) * 12.7 / (2 * Math.PI), zc = g.singlespeed ? cl : 18 + 6 * 3.9;
      seg([0, rRing, cl], [a[0], a[1] + rCog, zc], 6, "chain");
      seg([0, -rRing, cl], [a[0], a[1] - rCog, zc], 6, "chain");
    }
    return { segs: S, info };
  }

  root.FrameParts = { build, FORKS, DROPPERS, DEFAULTS, GROUPSETS, SADDLES, PEDALS, FINISHES, BRAKES, SMALL_COLOURS };
  if (typeof module !== "undefined") module.exports = root.FrameParts;
})(typeof window !== "undefined" ? window : globalThis);
