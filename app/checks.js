// ============================================================================
//  BUILDER CHECKLIST
//  Geometry, clearance, tube and small-parts checks that framebuilders use,
//  with the source of each rule. Status: ok / warn / fail / info.
// ============================================================================
(function (root) {
  "use strict";
  const FEA = root.FrameFEA || (typeof require !== "undefined" ? require("./fea.js") : null);
  const SRC = {
    cannondale: "https://www.cannondale.com/en-us/blog/bike-tire-clearance-explained",
    wolftooth: "https://www.wolftoothcomponents.com/pages/boost-chainline-and-chainrings",
    rodriguez: "https://www.rodbikes.com/articles/phinney-fork/rake-trail-gravel-bikes.html",
    calfee: "https://calfeedesign.com/geometry-of-bike-handling/",
    gremlin: "https://bike.bikegremlin.com/3144/minimum-seatpost-insertion-length/",
    reynolds: "https://firsthand.bike/collections/reynolds-titanium",
    columbus: "https://framebuildersupply.com/collections/titanium-tubes",
    fblist: "https://groups.google.com/g/framebuilders/c/nV5YkAedzY0",
    haynes: "https://haynesintl.com/wp-content/uploads/2024/08/ti-3al-2-5v-brochure.pdf",
    seven: "https://sevencycles.com/articles/frame-boss-placement.php",
    sliders: "https://forum.customframeforum.com/t/sliding-dropouts-slipping/43",
    stw: "https://singletrackworld.com/forum/bike-forum/another-broken-ti-frame/",
    weldcolour: "https://www.thefabricator.com/tubepipejournal/article/arcwelding/only-the-clean-survive",
    dimple: "https://groups.google.com/g/framebuilders/c/Frko5iFE3yc/m/C3QVIkghdYYJ",
    aisc: "https://www.aisc.org/globalassets/aisc/publications/standards/a360-16-spec-and-commentary_june-2018.pdf",
    compliance: "https://www.cyclingabout.com/why-impossible-steel-frames-more-comfortable-than-aluminium/"
  };

  function crownClearance(design, result) {
    const g = design.geometry, m = result.model, P = m.geo.P, use = design.use || {};
    const dt = m.members.find(mm => mm.label === "Down tube"); if (!dt) return null;
    const Parts = root.FrameParts || (typeof require !== "undefined" ? (() => { try { return require("./parts.js"); } catch (e) { return null; } })() : null);
    const fk = Parts && design.parts && Parts.FORKS && Parts.FORKS[design.parts.fork];
    const susp = (+use.forkTravel || 0) > 0;
    const legHalf = (fk && +fk.legHalf) || (susp ? 68 : 56), legSpacing = 2 * legHalf;
    const rLeg = susp ? ((fk && +fk.stanchion) || 34) / 2 + 7 : 15;     // stanchion + crown boss; rigid: the crown shoulder
    const up = m.geo.uHT.map(v => -v), fw = m.geo.nF, side = [0, 0, 1];
    const crownOff = susp ? +g.forkOffset : 0.3 * +g.forkOffset;           // where the leg tops sit in front of the steerer
    const O = P.Crown, dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    const pts = [];
    for (const ei of dt.elements) { const e = m.elements[ei], a = m.nodes[e.n1].p, b = m.nodes[e.n2].p, r = (e.section.h || e.section.od) / 2;
      for (let k = 0; k <= 6; k++) { const u = k / 6, p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u], d = [p[0] - O[0], p[1] - O[1], p[2] - O[2]];
        const s = dot(d, up); pts.push({ s, q: [d[0] - up[0] * s, d[1] - up[1] * s, d[2] - up[2] * s], r }); } }
    const gapAt = deg => {
      const ph = deg * Math.PI / 180, c = Math.cos(ph), sn = Math.sin(ph);
      let best = Infinity;
      for (const sg of [-1, 1]) {
        // leg top relative to the steering axis at the crown, rotated by ph about the axis (fw → side)
        const fx = crownOff * c - sg * legHalf * sn, sx = crownOff * sn + sg * legHalf * c;
        const L = [fw[0] * fx + side[0] * sx, fw[1] * fx + side[1] * sx, fw[2] * fx + side[2] * sx];
        for (const p of pts) {
          const dq = Math.hypot(p.q[0] - L[0], p.q[1] - L[1], p.q[2] - L[2]) - rLeg;
          const gap = dq <= 0 ? p.s - p.r : p.s <= 0 ? dq - p.r : Math.hypot(dq, p.s) - p.r;
          if (gap < best) best = gap;
        }
      }
      return best;
    };
    let angle = 90; for (let d = 0; d <= 90; d += 1) if (gapAt(d) < 3) { angle = d; break; }
    return { angle, susp, legSpacing };
  }
  function run(design, result) {
    const g = design.geometry, t = design.tubes, m = design.material, use = design.use || {};
    const P = result.model.geo.P, info = result.info;
    const isMTB = (use.isoType || "mountain") === "mountain";
    const tireW = +g.tireWidth || (isMTB ? 66 : 45);
    const R = g.tireDiameter / 2;
    const out = [];
    const add = (group, item, value, target, status, note, src) => out.push({ group, item, value, target, status, note, src });
    const mm = v => `${v.toFixed(0)} mm`;

    // ---------------- model limits
    if (result.f8Warn && result.f8Warn.length)
      add("Model limits", "Very thin-walled tube (bending capacity)", result.f8Warn.join(", "), "D/t within the AISC F8 range (< 0.45·E/yield)", "warn",
        "These tubes are thinner for their diameter than the buckling rule used for the impact and overload checks covers, so those results are less certain for them (the rule's thinnest-tube formula is used anyway).", null);

    // ---------------- geometry & fit
    {
      // road ≈ 55–65; gravel 55–80 (race ≈ 60–70, all-road / adventure up to 80); 80–100 = stable bikepacking feel (warn, not wrong)
      const road = !isMTB && tireW < 35;
      const tr = info.trail, lo = isMTB ? 90 : 55, hi = isMTB ? 135 : road ? 65 : 80, warnHi = isMTB ? hi + 15 : road ? 80 : 100;
      add("Geometry & fit", "Trail", mm(tr), `${lo}–${hi} mm`, tr >= lo && tr <= hi ? "ok" : (tr >= lo - 10 && tr <= warnHi ? "warn" : "fail"),
        isMTB ? "Modern trail 29ers sit around 100–135 mm; XC bikes lower. Outside this band steering gets twitchy (low) or floppy (high)." :
        road ? "Road builders aim for about 55–65 mm." :
        tr > hi ? "Above 80 mm the steering is slow and very stable — fine for bikepacking and small 32ers (where it buys toe room), heavy for racing." :
        "Gravel race bikes sit around 60–70 mm, all-road and adventure bikes up to about 80 mm; wide tyres on standard forks push it higher.", isMTB ? SRC.calfee : SRC.rodriguez);
    }
    {
      // BB height with the rider on: the fork at its sag (sag.js stands the bike on the ground); old 25 % estimate as a fallback
      const SAG = root.FrameSag || (typeof require !== "undefined" ? (() => { try { return require("./sag.js"); } catch (e) { return null; } })() : null);
      const travel = +use.forkTravel || 0, sagPct = isFinite(+use.forkSag) && use.forkSag !== "" ? +use.forkSag : 25;
      let sg = null; try { sg = SAG && travel > 0 ? SAG.compute(design, sagPct) : null; } catch (e) { sg = null; }
      const sagFront = travel * sagPct / 100;
      const rc = -P.AxleR[0], wb = info.wheelbase;
      const bbSag = sg && sg.ok ? sg.bbHeight : info.bbHeight - sagFront * Math.sin(g.headAngle * Math.PI / 180) * (rc / wb);
      const clr = bbSag - g.crankLength;
      // trail bikes need room for rocks; road and gravel bikes sit lower (≈ 270–290 mm BB height) and only need cornering room
      const pcOk = isMTB ? 125 : 95, pcWarn = isMTB ? 110 : 85;
      add("Geometry & fit", "Pedal clearance (crank at the bottom)", mm(clr), `≥ ${pcOk} mm`, clr >= pcOk ? "ok" : clr >= pcWarn ? "warn" : "fail",
        `BB height ${bbSag.toFixed(0)} mm${sagFront ? ` with ${sagPct}% fork sag` : ""} minus ${g.crankLength} mm cranks.${travel ? " Change the sag in Design → Fork sag." : ""}`, null);
      if (sg && sg.ok) add("Geometry & fit", `Riding geometry at ${sagPct}% fork sag`, `HA ${sg.headAngle.toFixed(1)}° · SA ${sg.seatAngle.toFixed(1)}°`, "for information", "info",
        `With you on the bike the fork sinks ${sagFront.toFixed(0)} mm and the bike tips forward: trail ${sg.trail.toFixed(0)} mm, reach ${sg.reach.toFixed(0)} mm, stack ${sg.stack.toFixed(0)} mm. Design → Fork sag shows every sag setting.`, null);
    }
    {
      // toe overlap: the full shoe + steering model in toe.js (shoe size, cleat position, mudguard, bar turn)
      let TOE = root.FrameToe; if (!TOE && typeof require !== "undefined") { try { TOE = require("./toe.js"); } catch (e) { TOE = null; } }
      let t = null; try { t = TOE && (TOE.checkRow ? TOE.checkRow(design, result.model.geo) : null); } catch (e) { t = null; }
      if (t) add("Geometry & fit", "Toe overlap", t.value, t.target, t.status, t.note, null);
      else {
        const d = Math.hypot(P.AxleF[0], P.AxleF[1]);
        const gap = d - (FEA.frontTyreR ? FEA.frontTyreR(g) : R) - (g.crankLength + 60);
        add("Geometry & fit", "Toe overlap", gap >= 0 ? `${gap.toFixed(0)} mm clear` : `${(-gap).toFixed(0)} mm overlap`, "clear", gap >= 0 ? "ok" : "warn",
          "Toe reaches about 60 mm past the pedal axle. Overlap only matters when turning sharply at walking speed.", null);
      }
    }
    {
      const ins = FEA.postInsertion(design);
      add("Geometry & fit", "Seatpost insertion", `${mm(ins.available)} in the frame`, `≥ ${mm(ins.required)} (past the lower of the top-tube / seat-stay welds + 25 mm)`, ins.ok ? "ok" : "fail",
        `With a ${mm(ins.postLength)} post and ${mm(ins.exposure)} showing. The post must end below the welds' heat-affected zone, or the seat tube cracks at the top-tube or seat-stay weld. Dropped stays push this deeper. Also check the post's own minimum-insertion mark.`, SRC.gremlin);
      const straightST = result.model.geo.straightSeatTube;
      if (straightST < g.seatTube) add("Geometry & fit", "Seatpost insertion vs the seat-tube bend", `${mm(straightST)} straight`, `≥ ${mm(ins.required)} (the insertion the post needs)`, straightST >= ins.required ? "ok" : "fail",
        straightST >= ins.required ? "The post's minimum insertion ends above the bend." : "A post can't go round the bend, so it can't reach the depth the welds need: move the bend lower, or ask your builder for a reinforcing sleeve at the top of the seat tube.", SRC.gremlin);
      const pf = FEA.postFit(design);
      add("Geometry & fit", "Seatpost fits the seat tube", `bore ${pf.bore.toFixed(1)} mm for a ${pf.fit} mm post`, "bore = post (reamed), or a standard shim", pf.ok ? (pf.shim ? "warn" : "ok") : "fail",
        pf.shim ? `Needs a ${pf.fit}→${pf.shim} shim. Works, but a shim adds a joint that can creak or slip.` : pf.ok ? "Reamed to size after welding (ask your builder to ream and hone)." :
        pf.bore < pf.fit ? "Post is bigger than the bore: thinner seat tube wall, bigger seat tube, or a smaller post." : "No standard shim for this bore: the builder would need to fit an internal sleeve at the top of the seat tube (not modelled), or change the seat tube size.", null);
      const Parts = root.FrameParts || (typeof require !== "undefined" ? require("./parts.js") : null);
      const dp = Parts && design.parts && Parts.DROPPERS[design.parts.dropper];
      if (dp && dp.travel > 0) {
        const expo = result.model.geo.postExposure, show = expo - (dp.collar + dp.stack + dp.travel), maxT = Math.floor((expo - dp.collar - dp.stack) / 10) * 10;
        add("Geometry & fit", "Dropper travel for this saddle height", `${dp.label}: ${show >= 0 ? mm(show) + " of post below the collar" : mm(-show) + " too tall"}`, `up to ≈${maxT} mm travel fits`, show >= 0 ? (show > 25 ? "info" : "ok") : "fail",
          show >= 0 ? `Seat-tube top to rail clamp is ${mm(expo)}. A dropper of up to about ${maxT} mm travel would sit with its collar on the frame (more drop when descending), as long as the frame takes its full insertion length.` : "The post can't go low enough for this saddle height: pick a shorter-travel dropper, or a frame with a shorter seat tube.", null);
      }
      const post = result.comfort && result.comfort.post;
      if (post && post.dropper) {
        const straight = result.model.geo.straightSeatTube, room = Math.min(g.seatTube - 60, straight - 10);
        const body = ins.postLength - ins.exposure;
        add("Geometry & fit", "Dropper fits all the way in", `${mm(body)} of post in the frame`, `≤ ${mm(room)} of straight seat tube`, body <= room ? "ok" : "fail",
          (straight < g.seatTube ? `The seat tube is bent: it's straight for ${mm(straight)} down from the top. ` : "") + "A dropper's body can't be pushed past bends, bottle-boss rivnuts or the BB shell. Longer-travel droppers need a straight, unobstructed seat tube; check the dropper's insertion chart.", null);
      }
    }

    // ---------------- stay layout notes
    {
      const wb = result.model.geo.wishbone;
      if (wb) add("Geometry & fit", "Wishbone split", `${mm(wb.used)} below the seat-stay junction`, `between 30 and ${mm(Math.max(30, wb.max))}`, wb.clamped || wb.max < 30 ? "warn" : "ok",
        wb.clamped ? `You asked for ${mm(wb.asked)}, but the split has to stay above the tyre, so it's at ${mm(wb.used)}.` : "The split must sit above the tyre with room for the legs to bend out gently; the closer to the tyre, the sharper the leg bends.", null);
      if (result.model.geo.bridgeClamped) add("Geometry & fit", "Seat-stay bridge position", "moved", "on the stays", "warn", "The bridge height asked for is outside the seat stays, so it's modelled 20 mm below the stay junction instead.", null);
      const cal = result.model.geo.caliper;
      if (cal) add("Small parts", "Rear brake mount", `${cal.rotor} mm rotor on the ${cal.stay.toLowerCase()}`, "ISO 4210-6:2023 brake-mount test", "info",
        cal.mount === "slider" ? "Post mount on the sliding dropout: the caliper bolts to the slider plate, so the braking load goes through the dropout plate into both stays (no welded bosses). The slider bolts must also hold against the brake's pull, not just the chain's. Smaller rotors pull harder for the same braking."
          : "The caliper pulls on two bosses welded to the stay; their welds are checked as weld sites. Smaller rotors pull harder (more force for the same braking). Ask your builder whether the frame has passed the 2023 brake-mount test, and how the mount is reinforced.", null);
    }

    // ---------------- clearances
    // Tyre sweep: the tyre as a ring (tube radius W/2 around a circle of radius R − W/2 at the rear axle);
    // shortest gap from each stay / the seat tube (their surface) to it.
    const TS = FEA.tyreShape(g);
    const tyreGap = labels => {
      let best = Infinity;
      const pick = mm => typeof labels === "function" ? labels(mm) : labels.includes(mm.label);
      for (const mem of result.model.members.filter(pick)) for (const ei of mem.elements) {
        const e = result.model.elements[ei], a = result.model.nodes[e.n1].p, b = result.model.nodes[e.n2].p;
        for (let k = 0; k <= 8; k++) {
          const u = k / 8, p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
          const rho = Math.hypot(p[0] - P.AxleR[0], p[1] - P.AxleR[1]);
          const lateral = Math.abs(p[2]) > tireW / 4;                   // beside the tyre → sideways half-width
          const half = lateral ? e.section.w / 2 : e.section.od / 2;
          const d = FEA.tyreGapPoint(TS, rho, p[2]) - half;             // knobby-tyre section (superellipse), same as the stay generator
          if (d < best) best = d;
        }
      }
      return best;
    };
    {
      const need = isMTB ? 6 : 4;
      const hasYoke = result.model.members.some(mm => /yoke/.test(mm.label));
      for (const [lab, labels] of [["Tyre to chainstays" + (hasYoke ? " & yoke" : ""), mm => mm.group === "chainstay"], ["Tyre to seat stays", mm => mm.group === "seatStay"], ["Tyre to seat tube", ["Seat tube"]]]) {
        const gap = tyreGap(labels);
        if (!isFinite(gap)) continue;
        const stays = lab !== "Tyre to seat tube";
        add("Clearances", lab, `${gap.toFixed(1)} mm`, `≥ ${need} mm`, gap >= need ? "ok" : gap < 0 ? "fail" : (stays ? "warn" : (gap >= 2 ? "warn" : "fail")),
          gap >= need ? `${tireW} mm tyre, closest point along the whole ${stays ? "stay" : "tube"}.` :
          stays ? `With the ${lab.includes("seat") ? "seat stay shape" : "chainstay / yoke shape"} entered here the ${tireW} mm tyre would be ${gap < 0 ? "hitting" : "too close"}. Try "Seat stay shape: bent to clear the tyre" or a chainstay yoke in Geometry, and confirm the shape on the builder's drawing (${need} mm is the target, more for mud).` :
          `Move the rear wheel back (longer chainstays) or steepen/offset the seat tube.`, SRC.cannondale);
      }
    }
    // Fork crown against the down tube with the bars turned (what a bent down tube is for). The crown is modelled as
    // the two leg tops (stanchion + crown boss) at the crown, swinging round the steering axis; first touch = the angle.
    {
      const fc = crownClearance(design, result);
      if (fc) add("Clearances", "Fork crown to down tube (bars turned)", fc.angle >= 90 ? "clears at full lock" : `touches at ${fc.angle}°`, "clears to ≥ 60°", fc.angle >= 60 ? "ok" : fc.angle >= 45 ? "warn" : "fail",
        `${fc.susp ? "Suspension" : "Rigid"} fork crown, legs ${fc.legSpacing.toFixed(0)} mm apart (estimate; the real crown shape varies). ${fc.angle >= 60 ? "Past that, a steering stop or a rubber bumper on the down tube takes the hit (worth asking your builder for one)." : "When the bars swing round (a crash, or turning tight while walking) the crown would hit and dent the down tube. A down tube bent up near the head tube (Tube bends), a higher down-tube joint on the head tube, or a taller lower headset cup gives more room."}`, null);
    }
    {
      const B = result.model.geo.bends || {};
      if (B.st) {
        const gi = result.model.geo.info;
        add("Geometry & fit", "Bent seat tube: angles to give the builder", `upper tube ${gi.seatTubeAngleReal.toFixed(1)}°, effective ${(+g.seatAngle).toFixed(1)}°`, "both on the drawing", "info",
          `The effective seat angle (${(+g.seatAngle).toFixed(1)}°, BB to the saddle at ${mm(+g.saddleHeight)}) is what sets your fit; the straight upper part of the tube is at ${gi.seatTubeAngleReal.toFixed(1)}° and its top sits ${gi.seatTubeTopAhead.toFixed(0)} mm in front of the effective line. Ask your builder which one their drawing's seat angle shows.`, null);
      }
    }
    {
      const rp = g.chainring * 12.7 / (2 * Math.PI), ro = rp + 4;   // tooth tips: the ring's outside diameter ≈ pitch diameter + 8 mm
      // widest outer face of the drive stay (or yoke) anywhere within 2 mm of the ring's tooth tips (side view)
      const csm = result.model.members.filter(mm => mm.group === "chainstay" && /drive side/.test(mm.label));
      let worst = null;
      for (const cs of csm) for (const ei of cs.elements) {
        const e = result.model.elements[ei], a = result.model.nodes[e.n1].p, b = result.model.nodes[e.n2].p;
        for (let k = 0; k <= 10; k++) { const u = k / 10, p = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
          if (Math.hypot(p[0], p[1]) <= ro + 2) { const face = p[2] + e.section.w / 2; if (worst == null || face > worst) worst = face; } }
      }
      if (worst != null) {
        const clr = (g.chainline - 1.5) - worst;
        add("Clearances", "Chainring to drive-side chainstay", `${clr.toFixed(1)} mm`, "≥ 3 mm", clr >= 3 ? "ok" : clr >= 0 ? "warn" : "fail",
          clr >= 3 ? `${g.chainring}T ring (≈${(2 * ro).toFixed(0)} mm across) on a ${g.chainline} mm chainline.` : (g.csRingTuck === "" || g.csRingTuck == null ? `With the smooth S-bend modelled here the stay would touch a ${g.chainring}T ring. Real drive stays get a ring-clearance bend or a flattened section near the BB: set "Drive stay: tucked in past the chainring" (Stays & tyre room) to model that, and check it on the drawing (≥ 3 mm).` : `The drive stay is tucked in past the ring here, but the ring and the tyre want the same spot just behind the BB, so it sits between them (see "Tyre to chainstays" too). A smaller ring, a narrower tyre, a longer chainstay or a wider chainline (the ring moves out) gives more room.`), SRC.wolftooth);
      }
    }
    {
      const clr = g.chainline - 4 - tireW / 2;
      add("Clearances", "Chain to tyre", mm(clr), "≥ 6 mm", clr >= 6 ? "ok" : clr >= 3 ? "warn" : "fail", "Chain inner edge against the tyre's widest point.", SRC.wolftooth);
    }

    // ---------------- tubes
    const main = [["topTube", "Top tube"], ["downTube", "Down tube"], ["seatTube", "Seat tube"], ["chainstay", "Chainstays"], ["seatStay", "Seat stays"]];
    for (const [k, lab] of main) {
      const tb = t[k], Dt = (tb.od || Math.max(tb.h || 0, tb.w || 0)) / tb.wall;   // shaped tubes: the biggest dimension (flat faces dent first)
      const minWall = tb.wall < 0.7 ? "fail" : tb.wall < 0.85 ? "warn" : "ok";
      if (minWall !== "ok") add("Tubes", `${lab} wall at the welds`, `${tb.wall} mm`, "≥ 0.85 mm at welds, ≥ 0.7 mm mid-tube", minWall, "Catalogue titanium tubes are 0.85–0.9 mm at the butts where they are welded.", SRC.reynolds);
      if (k === "downTube" || k === "topTube") {
        const lim = k === "downTube" ? [60, 75] : [65, 80];
        add("Tubes", `${lab} dent resistance (D/t)`, Dt.toFixed(0), `≤ ${lim[0]}`, Dt <= lim[0] ? "ok" : Dt <= lim[1] ? "warn" : "fail",
          "Diameter over wall. Thin, fat tubes dent from rock strikes; catalogue Ti tubes run about 50–60 mid-tube.", SRC.columbus);
      }
      const lam = Dt * (m.yield) / m.E;
      if (lam > 0.31 && (k === "downTube" || k === "topTube" || k === "seatTube"))
        add("Tubes", `${lab} local buckling`, `λ = ${lam.toFixed(2)}`, "≤ 0.31 (non-slender)", lam > 0.45 ? "fail" : "warn",
          "Slender tube by AISC 360 limits (scaled for titanium): it can crumple before it yields in a crash.", SRC.aisc);
    }
    {
      const w = t.seatTube.wall;
      add("Tubes", "Seat tube wall at the collar", `${w} mm`, "≥ 1.2 mm over the insertion depth", w >= 1.2 ? "ok" : "warn",
        w >= 1.2 ? "Thick enough for the clamp and slot." : "Ask your builder for a reinforcing sleeve or a thick-walled top section (Reynolds sells 1.25 mm for 31.6 posts), and a relief hole at the slot end.", SRC.reynolds);
    }
    {
      const w = t.headTube.wall, harsh = (+use.forkTravel || 0) < 20 || (use.condition || 4) >= 4;
      add("Tubes", "Head tube wall", `${w} mm`, harsh ? "≥ 1.6 mm or reinforcing rings" : "≥ 1.2 mm", w >= (harsh ? 1.6 : 1.2) ? "ok" : "warn",
        "Thin head tubes can ovalise at the lower cup on rigid or hard-hit bikes; builders add rings.", SRC.fblist);
    }
    {
      // bend radius of every stay (3D) vs 3 × OD, plus the pipe-bend stress-raise factor used in the fatigue check
      const B = result.model.geo.bends || {};
      const rows = [["chainstay", "Chainstay bend radius", t.chainstay.od], ["seatStay", "Seat stay bend radius", t.seatStay.od]];
      if (B.st) rows.unshift(["seatTube", "Seat tube bend radius", t.seatTube.od || Math.max(t.seatTube.h || 0, t.seatTube.w || 0)]);
      if (B.dt) rows.unshift(["downTube", "Down tube bend radius", t.downTube.od || Math.max(t.downTube.h || 0, t.downTube.w || 0)]);
      for (const [grp, lab, od] of rows) {
        const mems = result.model.members.filter(mm => mm.group === grp && !/yoke|wishbone/.test(mm.label));
        let minR = Infinity, sif = 1;
        for (const mm of mems) { minR = Math.min(minR, mm.minBendR || Infinity); for (const ei of mm.elements) sif = Math.max(sif, result.model.elements[ei].bendSIF || 1); }
        const need = 3 * od;
        const straight = !isFinite(minR) || minR > 5000;
        const limited = mems.some(mm => mm.minRreached === false);
        add("Tubes", lab, straight ? "straight" : mm(minR), `≥ ${need.toFixed(0)} mm (3 × OD)`, straight || minR >= need ? "ok" : minR >= 2 * od ? "warn" : "fail",
          `${grp === "seatTube" || grp === "downTube" ? "Big Ti tubes are bent on a mandrel; ask your builder what radius their tooling does for this diameter (bends tighter than about 3 × OD wrinkle or crack). " : ""}Tighter bends in cold-worked Ti risk cracking; never dimple or crimp CWSR titanium stays.${limited && (grp === "seatTube" || grp === "downTube") ? " The radius had to be made smaller to fit the bend where it is: move it or use a smaller offset/angle." : limited ? " The stay has to swing out this sharply to clear the tyre with this geometry: wider stay spacing at the seat tube, a higher stay junction or more clearance room gives a gentler bend." : ""}${sif > 1.05 ? ` The bend raises bending stress about ${sif.toFixed(2)}× (ASME pipe-bend index C2, scaled down for a short bend); the fatigue check includes it.` : ""}`, SRC.haynes);
      }
    }

    // ---------------- singlespeed / drivetrain
    if (g.singlespeed !== false) {
      const sprint = result.cases.find(c => c.id === "pedalR");
      const T = sprint ? sprint.force * g.crankLength / (g.chainring * 12.7 / (2 * Math.PI)) : 0;
      const clamp = 1.5 * T / 0.2;
      add("Singlespeed", "Chain pull through the sliders (hardest sprint)", `${(T / 1000).toFixed(1)} kN`, `clamp ≥ ${(clamp / 1000).toFixed(0)} kN`, "info",
        `Sliders must not creep: clamp force × friction (≈0.2) should beat 1.5× the chain pull. That's about ${(clamp / 2000).toFixed(0)} kN per bolt with two bolts, which needs M8 bolts properly torqued (M5/M6 slip). Ask your builder what the sliders use.`, SRC.sliders);
    }

    // ---------------- bottles (bottles.js): only when the design places bottle bosses
    const BT = root.FrameBottles || (typeof require !== "undefined" ? (() => { try { return require("./bottles.js"); } catch (e) { return null; } })() : null);
    if (BT && (+g.dtBoss > 0 || +g.stBoss > 0)) {
      let br = null; try { br = BT.analyse(design); } catch (e) { br = null; }
      if (br && br.rows) for (const r of br.rows) add("Bottles", r.label, r.value, r.k === "gap" ? "≥ 5 mm" : "slides out", r.level === "bad" ? "fail" : r.level, r.text + (r.k !== "gap" ? " Open Design → Bottles & cages to see it and try other boss positions." : ""), null);
      // the dropper's lower end against the seat-tube bosses (rivnuts or boss inserts poke into the tube)
      if (+g.stBoss > 0) {
        const ins = FEA.postInsertion(design), bottom = g.seatTube - (ins.postLength - ins.exposure), upper = +g.stBoss + (parseFloat(g.bossSpacing) || 64), gap = bottom - upper;
        add("Bottles", "Seatpost bottom vs upper seat-tube boss", Math.abs(gap) < 1.5 ? "right at the boss" : gap > 0 ? `${mm(gap)} above the boss` : `${mm(-gap)} past the boss`, "≥ 10 mm above", gap >= 10 ? "ok" : gap >= -3 ? "warn" : "fail",
          `With this saddle height and a ${mm(ins.postLength)} post, the post ends ${mm(bottom)} from the BB; the upper seat-tube boss is at ${mm(upper)}. Rivnuts and boss inserts stick into the tube, so a post that reaches them can't go all the way down (or gets scratched). Lower bosses, a shorter post, or bosses that don't protrude inside.`, SRC.gremlin);
      }
    }

    // ---------------- small parts & build quality (reminders)
    add("Small parts", "Bottle bosses", "—", "rivnuts, in pairs, near the BB", "info", "Welded bosses on thin Ti are stress raisers. Seven: pairs only, ≤ 0.68 kg per boss, seat tube and lower down tube.", SRC.seven);
    add("Small parts", "Cable and hose holes", "—", "reinforced (doubler/ring), smooth edges", "info", "A Ti down tube cracked hole-to-hole from unreinforced cable ports.", SRC.stw);
    add("Build quality", "Weld colour", "—", "silver to light straw", "info", "Blue, purple, grey or white welds mean contamination: reject. Ask for close-up weld photos before shipping.", SRC.weldcolour);
    add("Build quality", "No dimpled or crimped stays", "—", "yokes, bends or plates instead", "info", "Cold-worked Ti cracks when dimpled (about 40% showed internal cracks in one builder's test).", SRC.dimple);
    add("Comfort", "Where comfort really comes from", "—", "tyres and seatpost first", "info", "Measured: tyre and seatpost are almost all of the saddle flex; the frame is a small part. Stay diameter is a minor lever.", SRC.compliance);

    return out;
  }
  root.FrameChecks = { crownClearance, run };
  if (typeof module !== "undefined") module.exports = root.FrameChecks;
})(typeof window !== "undefined" ? window : globalThis);
