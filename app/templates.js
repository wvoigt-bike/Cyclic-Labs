// ============================================================================
//  STARTING TEMPLATES FOR A NEW BIKE (templates.js)
//  A clean, generic starting point for each kind of bike and wheel size:
//  typical geometry for sizes S–XL, ordinary titanium tube sizes and plain
//  generic parts (no one's personal parts). The "New bike" screen uses these.
//  To change what a new bike starts with, edit the numbers below (or ask
//  Claude in chat: "make new gravel bikes start with 45 mm tyres").
//  Wheels and tyres are separate choices: each wheel size lists the tyre widths
//  that make sense on it (tyres.choices) and a typical one; build() takes the
//  widest tyre the frame must clear and sizes chainstay, stay spacing and (rigid)
//  fork length to suit.
//  Units: mm, degrees, kg.
// ============================================================================
(function (root) {
  "use strict";

  // --------------------------------------------------------------- kinds of bike
  const TYPES = {
    road: {
      trailTarget: 58,
      // per mm of tyre width over/under the wheel's typical tyre: chainstay grows (seat-tube room), rigid fork grows (crown room)
      tyreGrow: { chainstay: 1, forkA2C: 1.05 },
      label: "Road", blurb: "Paved roads, drop bars, rigid fork, skinny tyres.",
      // typical geometry per size (endurance-race road bike)
      sizes: {
        S:  { reach: 375, stack: 535, headTube: 130, seatTube: 500, headAngle: 71.5, seatAngle: 74.0, saddleHeight: 690 },
        M:  { reach: 383, stack: 555, headTube: 150, seatTube: 530, headAngle: 72.5, seatAngle: 73.5, saddleHeight: 725 },
        L:  { reach: 391, stack: 578, headTube: 175, seatTube: 560, headAngle: 73.0, seatAngle: 73.3, saddleHeight: 760 },
        XL: { reach: 399, stack: 602, headTube: 200, seatTube: 590, headAngle: 73.3, seatAngle: 73.0, saddleHeight: 795 }
      },
      wheels: {
        "700c":  { label: "700c", note: "The road standard (same rim as a 29er).", rear: { bsd: 622, width: 28 }, tyres: { choices: [25, 28, 30, 32, 35], typical: 28 }, chainstay: 410, bbDrop: 72, forkA2C: 370, forkOffset: 45,
                   // stays squeezed narrow and flattened beside the 50T ring (as road frames do), widening behind it
                   geometry: { csShape: "spline", csSpacingAtBB: 36, csWidestAt: 170 }, tubes: { chainstay: { ovalH: 28, ovalW: 13, ovalLength: 120 } } },
        "650b":  { label: "650b (road plus)", note: "Smaller rim for a fat tyre: about the same outside size as a 700c × 28.", rear: { bsd: 584, width: 47 }, tyres: { choices: [42, 47, 50], typical: 47 }, chainstay: 415, bbDrop: 70, forkA2C: 375, forkOffset: 50,
                   // a fat tyre and a double ring don't fit together: 1× ring on a wider chainline, stays split by a yoke
                   geometry: { chainring: 40, chainline: 49.5, csYokeLength: 95, csYokeSpacing: 60, ssShape: "curved" } }
      },
      geometry: { ttDrop: 25, ttBelowHtTop: 18, dtAboveHtBottom: 28, ssBelowTt: 12, bbShellWidth: 68, chainline: 43.5, chainring: 50, cog: 17, footOffset: 95,
        stayWidthAtDropout: 124, csSpacingAtBB: 44, csSpacingAtTire: 80, csWidestAt: 140, rearRotor: 160, ssShape: "straight", ssBridge: false,
        saddleSetback: 50, seatpostLength: 350 },
      tubes: { topTube: { od: 31.8, wall: 0.9 }, downTube: { od: 42, wall: 0.9 }, seatTube: { od: 31.8, wall: 0.9 }, headTube: { od: 48, wall: 1.8 },
        chainstay: { od: 22.2, wall: 1.2, ovalH: 25, ovalW: 18, ovalLength: 0, taperOD: 19, taperLength: 150 }, seatStay: { od: 16, wall: 0.9 },
        bbShell: { od: 51.2, wall: 2.1 }, seatpost: { type: "carbon272", od: 27.2, wall: 2.0 } },
      use: { condition: 1, isoType: "racing", forkTravel: 0, isoForkTravel: 0, tireSquish: 10, rearTirePsi: 75, sprintWatts: 1200, sprintCadence: 100,
        avgWatts: 200, avgCadence: 88, hoursPerWeek: 6, aggression: 1, legStroke: 250 },
      riderBike: 8.5,
      parts: { fork: "rigid", dropper: "rigidPost", barType: "drop", barWidth: 420, stemLength: 100, stemRise: -6, spacers: 15, rotorF: 160, rotorR: 160,
        sel: { fork: "rigid", crankset: "cr-gx", chainring: "ring-blk", rear: "cs-xt", wheels: "wh-alloy", tyres: "ty-road-28", brakes: "br-xt", cockpit: "ck-road", seatpost: "post-rigid", saddle: "sa-classic", pedals: "pe-clip" } }
    },
    gravel: {
      trailTarget: 62,
      tyreGrow: { chainstay: 1, forkA2C: 1.05 },
      label: "Gravel", blurb: "Dirt roads and light trails, drop bars, rigid fork, 38–50 mm tyres.",
      sizes: {
        S:  { reach: 372, stack: 560, headTube: 120, seatTube: 480, headAngle: 70.5, seatAngle: 74.0, saddleHeight: 680 },
        M:  { reach: 383, stack: 585, headTube: 145, seatTube: 520, headAngle: 71.0, seatAngle: 73.5, saddleHeight: 720 },
        L:  { reach: 392, stack: 610, headTube: 170, seatTube: 550, headAngle: 71.5, seatAngle: 73.5, saddleHeight: 755 },
        XL: { reach: 400, stack: 635, headTube: 195, seatTube: 580, headAngle: 72.0, seatAngle: 73.0, saddleHeight: 790 }
      },
      wheels: {
        "700c":   { label: "700c", note: "The usual gravel wheel (same rim as a 29er).", rear: { bsd: 622, width: 40 }, tyres: { choices: [35, 38, 40, 42, 45, 50], typical: 40 },
                    chainstay: 425, bbDrop: 72, forkA2C: 395, forkOffset: 50 },
        "650b":   { label: "650b (27.5 in)", note: "Smaller rim for big, comfy tyres; about the same outside size as a 700c. Good for smaller riders.", rear: { bsd: 584, width: 50 },
                    tyres: { choices: [42, 47, 50, 54, 57], typical: 50 }, chainstay: 425, bbDrop: 70, forkA2C: 395, forkOffset: 50, geometry: { chainring: 38 } },
        // 32" gravel, from a typical 32" gravel size chart: their 444 / 60 carbon fork, 72° head, 75° seat, 110 drop, long reach (with a short stem).
        // fixedFork: keep the 60 mm offset (the only 32" race fork) instead of picking one for trail. To fit it to a rider: "Fit a 32er" (fitgen.js).
        // (Key isn't "32": a number-like key would jump to the front of the list.)
        "32in":   { label: "32 in (new size)", note: "The new 32-inch wheels: rolls over everything, but the front end sits high and small sizes get toe overlap. The 32er fit solver (Geometry step: \"Match a bike I already ride\") copies the fit of a bike you ride now.",
                    rear: { bsd: 686, width: 50 }, tyres: { choices: [45, 50, 55], typical: 50, note: "Few 32\" tyres exist yet: about 45–55 mm (and the stock fork clears about that)." }, chainstay: 478, bbDrop: 110, forkA2C: 444, forkOffset: 60, fixedFork: true,
                    sizes: { S: { reach: 420, stack: 601, headTube: 95, seatTube: 470 }, M: { reach: 437, stack: 611, headTube: 105, seatTube: 490 },
                             L: { reach: 454, stack: 621, headTube: 115, seatTube: 510 }, XL: { reach: 470, stack: 630, headTube: 125, seatTube: 530 } },
                    // the long fork works the down tube harder: 1.0 wall (1.1 on S) passes the ISO falling-frame test
                    tubes: { downTube: { wall: 1.0 } }, tubesBySize: { S: { downTube: { wall: 1.1 } } },
                    parts: { stemLength: 60 },
                    geometry: { headAngle: 72, seatAngle: 75, chainring: 38 } }
      },
      // 1× ring on a wide (49.5 mm) chainline; a short yoke splits the chainstays so the ring and a big tyre both fit
      geometry: { ttDrop: 35, ttBelowHtTop: 18, dtAboveHtBottom: 28, ssBelowTt: 15, bbShellWidth: 68, chainline: 49.5, chainring: 40, cog: 21, footOffset: 100,
        stayWidthAtDropout: 124, csSpacingAtBB: 44, csSpacingAtTire: 89, csWidestAt: 140, rearRotor: 160, ssShape: "curved", ssBridge: true, ssBridgeAbove: 40,
        csYokeLength: 95, csYokeSpacing: 60,
        saddleSetback: 50, seatpostLength: 350 },
      tubes: { topTube: { od: 31.8, wall: 0.9 }, downTube: { od: 42, wall: 0.9 }, seatTube: { od: 31.8, wall: 0.9 }, headTube: { od: 48, wall: 1.8 },
        chainstay: { od: 22.2, wall: 1.2, ovalH: 25.5, ovalW: 18.5, ovalLength: 110, taperOD: 19, taperLength: 180 }, seatStay: { od: 16, wall: 0.9 },
        bbShell: { od: 51.2, wall: 2.1 }, seatpost: { type: "carbon272", od: 27.2, wall: 2.0 } },
      use: { condition: 2, isoType: "racing", forkTravel: 0, isoForkTravel: 0, tireSquish: 15, rearTirePsi: 35, sprintWatts: 1200, sprintCadence: 90,
        avgWatts: 190, avgCadence: 82, hoursPerWeek: 6, aggression: 1, legStroke: 250 },
      riderBike: 9.5,
      parts: { fork: "rigid", dropper: "rigidPost", barType: "drop", barWidth: 440, stemLength: 80, stemRise: -6, spacers: 15, rotorF: 160, rotorR: 160,
        sel: { fork: "rigid", crankset: "cr-gx", chainring: "ring-blk", rear: "cs-eagle", wheels: "wh-alloy", tyres: "ty-gravel-40", brakes: "br-xt", cockpit: "ck-gravel", seatpost: "post-rigid", saddle: "sa-classic", pedals: "pe-clip" } }
    },
    mtb: {
      tyreGrow: { chainstay: 0.6, forkA2C: 0 },     // suspension fork: its length doesn't change, but check the fork's own tyre limit
      label: "Mountain (hardtail)", blurb: "Trails, flat bars, suspension fork, dropper post.",
      sizes: {
        S:  { reach: 425, stack: 610, headTube: 100, seatTube: 400, headAngle: 65.5, seatAngle: 75.0, saddleHeight: 680 },
        M:  { reach: 450, stack: 622, headTube: 110, seatTube: 430, headAngle: 65.5, seatAngle: 75.0, saddleHeight: 720 },
        L:  { reach: 475, stack: 635, headTube: 120, seatTube: 460, headAngle: 65.5, seatAngle: 75.0, saddleHeight: 755 },
        XL: { reach: 500, stack: 645, headTube: 130, seatTube: 490, headAngle: 65.5, seatAngle: 75.0, saddleHeight: 790 }
      },
      wheels: {
        "29":     { label: "29 / 29", note: "Both wheels 29 in: the usual hardtail.", rear: { bsd: 622, width: 61 }, tyres: { choices: [56, 61, 64, 66, 71, 76], typical: 61, inch: true }, chainstay: 435, bbDrop: 60, forkA2C: 530, forkOffset: 44 },
        "27.5":   { label: "27.5 / 27.5", note: "Both 27.5 in (650b): quicker handling, smaller riders.", rear: { bsd: 584, width: 61 }, tyres: { choices: [56, 61, 64, 66, 71, 76], typical: 61, inch: true }, chainstay: 425, bbDrop: 30, forkA2C: 512, forkOffset: 42 },
        "mullet": { label: "29 front / 27.5 rear (mullet)", note: "Big wheel up front, small wheel at the back: more room behind you on steep ground.", rear: { bsd: 584, width: 61 }, front: { bsd: 622, width: 61 }, tyres: { choices: [56, 61, 64, 66, 71, 76], typical: 61, inch: true }, chainstay: 430, bbDrop: 40, forkA2C: 530, forkOffset: 44 },
        "26":     { label: "26 / 26", note: "Classic 26 in: dirt jump, slopestyle or retro builds.", rear: { bsd: 559, width: 58 }, tyres: { choices: [51, 56, 58, 61, 64, 66], typical: 58, inch: true }, chainstay: 420, bbDrop: 20, forkA2C: 495, forkOffset: 42 },
        "32":     { label: "32 / 32 (new size)", note: "The new 32 in wheels. Few forks and tyres exist yet, so these starting numbers are rough.", rear: { bsd: 686, width: 61 }, tyres: { choices: [56, 61, 64, 66], typical: 61, inch: true }, chainstay: 485, bbDrop: 85, forkA2C: 575, forkOffset: 51 }
      },
      // Boost chainline; a short chainstay yoke behind the BB makes room for the ring and a wide tyre
      geometry: { csYokeLength: 95, csYokeSpacing: 80, ttDrop: 40, ttBelowHtTop: 18, dtAboveHtBottom: 28, ssBelowTt: 20, bbShellWidth: 73, chainline: 52, chainring: 32, cog: 24, footOffset: 110,
        stayWidthAtDropout: 132, csSpacingAtBB: 50, csSpacingAtTire: 102, csWidestAt: 150, rearRotor: 180, ssShape: "curved", ssBridge: true, ssBridgeAbove: 40,
        saddleSetback: 45, seatpostLength: 450 },
      tubes: { topTube: { od: 38.1, wall: 0.9 }, downTube: { od: 44.5, wall: 1.2 }, seatTube: { od: 34.9, wall: 1.65 }, headTube: { od: 52, wall: 2.0 },
        chainstay: { od: 22.2, wall: 0.9, ovalH: 25, ovalW: 18, ovalLength: 100, taperOD: 19, taperLength: 180 }, seatStay: { od: 19, wall: 0.9, taperOD: 16, taperLength: 150 },
        bbShell: { od: 52, wall: 2.5 }, seatpost: { type: "dropper316", od: 31.6, wall: 2.5 } },
      use: { condition: 3, isoType: "mountain", forkTravel: 120, isoForkTravel: 130, tireSquish: 25, rearTirePsi: 22, sprintWatts: 1200, sprintCadence: 85,
        avgWatts: 180, avgCadence: 78, hoursPerWeek: 5, aggression: 1, legStroke: 250 },
      riderBike: 12,
      // small frames: short head tube → the down tube takes the falling-mass test harder, so 0.1 mm more wall
      tubesBySize: { S: { downTube: { wall: 1.3 } } },
      parts: { fork: "sidUlt120", dropper: "oneupV3_150", barType: "flat", barWidth: 760, stemLength: 50, stemRise: 0, spacers: 10, rotorF: 180, rotorR: 180,
        sel: { fork: "sidUlt120", crankset: "cr-gx", chainring: "ring-xsync2-blk", rear: "cs-eagle", wheels: "wh-alloy", tyres: "ty-mtb-24", brakes: "br-xt", cockpit: "ck-trail", seatpost: "oneup150", saddle: "sa-short", pedals: "pe-flat" } }
    }
  };
  const SIZE_LIST = ["S", "M", "L", "XL"];
  const CRANK = { S: 170, M: 172.5, L: 172.5, XL: 172.5 };   // MTB XL gets 175
  const RIDER_KG = 75;

  // tyre outside diameter from rim (bead seat) + width: the tyre stands about 1.05 × its width above the rim
  const tyreOD = (bsd, width) => Math.round(bsd + 2 * 1.05 * width);
  const WHEEL_NAME = { 559: "26 in", 584: "27.5 in / 650b", 622: "29 in / 700c", 686: "32 in" };

  // --------------------------------------------------------------- build one
  // build(type, wheelKey, size) → { name, notes, changes } where changes deep-merged onto FRAME_DEFAULTS is a complete design.
  // Every setting that the shipped DEFAULTS tune for the example bike (singlespeed, yoke, purple paint ...) is reset here.
  // tyreWidth (optional, mm) = the widest tyre the frame and fork must clear; blank = the wheel's typical tyre.
  function build(type, wheelKey, size, tyreWidth) {
    const T = TYPES[type]; if (!T) throw new Error("Unknown bike type " + type);
    const rw = resolveWheel(type, wheelKey); wheelKey = rw.key; if (!(+tyreWidth > 0) && rw.tyre) tyreWidth = rw.tyre;
    const Wh0 = T.wheels[wheelKey] || Object.values(T.wheels)[0];
    const typ = Wh0.rear.width, tw = +tyreWidth > 0 ? Math.round(+tyreWidth * 10) / 10 : typ, dw = tw - typ, grow = T.tyreGrow || {};
    const Wh = Object.assign({}, Wh0, { rear: Object.assign({}, Wh0.rear, { width: tw }), front: Wh0.front ? Object.assign({}, Wh0.front, { width: tw }) : null,
      chainstay: Math.round(Wh0.chainstay + Math.max(-10, dw * (grow.chainstay || 0))),
      forkA2C: Wh0.fixedFork ? Wh0.forkA2C : Math.round(Wh0.forkA2C + dw * (grow.forkA2C || 0)) });
    const S = Object.assign({}, T.sizes[size] || T.sizes.M, (Wh.sizes || {})[size] || {});   // a wheel option can override sizes (32": typical size chart)
    const G = T.geometry, rear = Wh.rear, front = Wh.front || null;
    const g = {
      reach: S.reach, stack: S.stack, headAngle: S.headAngle, seatAngle: S.seatAngle, headTube: S.headTube, seatTube: S.seatTube,
      chainstay: Wh.chainstay, bbDrop: Wh.bbDrop, forkA2C: Wh.forkA2C, forkOffset: Wh.forkOffset, lowerCupStack: 0,
      ttAtSeatTube: S.seatTube - G.ttDrop, ttBelowHtTop: G.ttBelowHtTop, dtAboveHtBottom: G.dtAboveHtBottom, ssBelowTt: G.ssBelowTt,
      saddleHeight: S.saddleHeight, saddleSetback: G.saddleSetback, saddleStack: 45, seatpostLength: G.seatpostLength,
      tireDiameter: tyreOD(rear.bsd, rear.width), tireWidth: Math.max(rear.width, front ? front.width : 0), rimBSD: rear.bsd,
      tireDiameterFront: front ? tyreOD(front.bsd, front.width) : "", rimBSDFront: front ? front.bsd : "",
      bbShellWidth: G.bbShellWidth, csSpacingAtBB: G.csSpacingAtBB, csSpacingAtTire: Math.max(G.csSpacingAtTire, Math.round(tw + 40)), csWidestAt: G.csWidestAt,
      stayWidthAtDropout: G.stayWidthAtDropout, ssSpacingAtTop: Math.round(T.tubes.seatTube.od + T.tubes.seatStay.od),
      ssShape: G.ssShape, ssClearance: 6, wishboneLength: "", csShape: "auto", csClearance: 6, ssBridge: G.ssBridge, ssBridgeAbove: G.ssBridgeAbove || 40,
      csYokeLength: G.csYokeLength || 0, csYokeSpacing: G.csYokeSpacing || 80, singlespeed: false, chainline: G.chainline, chainring: G.chainring, cog: G.cog,
      crankLength: type === "mtb" && size === "XL" ? 175 : CRANK[size] || 172.5, footOffset: G.footOffset, rearRotor: G.rearRotor, brakeMount: "chainstay"
    };
    Object.assign(g, Wh.geometry || {});
    if (g.csSpacingAtTire < tw + 40) g.csSpacingAtTire = Math.round(tw + 40);
    if (type === "mtb" && Wh.forkA2C) g.forkBaseA2C = Wh.forkA2C - T.use.forkTravel;
    const tubes = JSON.parse(JSON.stringify(T.tubes));
    for (const k of Object.keys(Wh.tubes || {})) Object.assign(tubes[k], Wh.tubes[k]);
    for (const bySize of [(T.tubesBySize || {})[size] || {}, (Wh.tubesBySize || {})[size] || {}])
      for (const k of Object.keys(bySize)) Object.assign(tubes[k], bySize[k]);
    tubes.csYoke = { h: 32, w: 10, wall: 5 }; tubes.ssBridge = { od: 12.7, wall: 0.9 }; tubes.ssMono = { od: 25, wall: 1.0 };
    const parts = Object.assign({ headBadge: "", tyreWidth: g.tireWidth, rimDepth: 24, barRise: type === "mtb" ? 20 : 0, backsweep: type === "mtb" ? 8 : 0, crankAngle: 25,
      finish: "raw", groupset: "auto", crankLen: "auto" }, JSON.parse(JSON.stringify(T.parts)), Wh.parts || {});
    parts.sel.tyres = genericTyre(g.tireWidth);
    const changes = {
      geometry: g, tubes, parts,
      use: Object.assign({ dropHeight: "", standingShare: "", edgeHeight: "" }, T.use),
      rider: { riderKg: RIDER_KG, bikeKg: T.riderBike }
    };
    if (T.trailTarget && !Wh.fixedFork) pickOffset(changes, T.trailTarget);
    levelFrontAxle(changes);
    const SHORT = { 559: '26"', 584: '27.5"', 622: '29"', 686: '32"' };
    const wheelTxt = front ? `${SHORT[front.bsd]} front / ${SHORT[rear.bsd]} rear` : Wh.label.replace(/ \(.*\)/, "");
    const tyreTxt = tyreLabel(type, tw, wheelKey);
    return {
      name: `New ${T.label.replace(/ \(.*\)/, "").toLowerCase()} bike – ${wheelTxt}, ${tyreTxt} tyres, size ${size}`,
      notes: `Started from Cyclic Labs' generic ${T.label.toLowerCase()} template (size ${size}, ${Wh.label} wheels, room for tyres up to ${tyreTxt}${dw ? `: chainstay${!Wh0.fixedFork && grow.forkA2C ? " and fork length" : ""} adjusted for that tyre` : ""}). Geometry is typical for this kind of bike; tubes are ordinary titanium sizes and the parts are plain generic ones. Change anything to match your bike.`,
      changes
    };
  }

  // the plain library tyre closest to a width (the realistic view draws the tyre part's width)
  const GENERIC_TYRES = [["ty-road-28", 28], ["ty-gravel-40", 40], ["ty-gravel45", 45], ["ty-plus-50", 50], ["ty-mtb-24", 61], ["ty-trail26", 66]];
  const genericTyre = w => GENERIC_TYRES.reduce((a, b) => Math.abs(b[1] - w) < Math.abs(a[1] - w) ? b : a)[0];
  // Rigid-fork bikes: choose the stock fork offset that gives the trail builders aim for (≈60 mm road and gravel),
  // so small sizes with slack head angles don't end up with a lazy front end
  function pickOffset(changes, target) {
    const g = changes.geometry, R = (+g.tireDiameterFront || g.tireDiameter) / 2, ha = g.headAngle * Math.PI / 180;
    let best = g.forkOffset, err = Infinity;
    for (const off of [40, 43, 45, 47, 50, 53, 55, 57]) { const tr = (R * Math.cos(ha) - off) / Math.sin(ha); if (Math.abs(tr - target) < err) { err = Math.abs(tr - target); best = off; } }
    g.forkOffset = best;
  }
  // Templates should stand level: nudge the stack so the front axle sits where the front tyre needs it
  // (rear axle height + front radius − rear radius). Leaves user-typed numbers alone (only used for templates).
  function levelFrontAxle(changes) {
    const FEA = root.FrameFEA; if (!FEA || !root.FRAME_DEFAULTS) return;
    try {
      const g = FEA.deepMerge(root.FRAME_DEFAULTS.geometry, changes.geometry);
      for (let k = 0; k < 3; k++) {
        const info = FEA.buildGeometry(g, FEA.deepMerge(root.FRAME_DEFAULTS.tubes, changes.tubes)).info;
        const d = info.frontAxleTarget - info.frontAxleHeight;
        if (Math.abs(d) < 0.25) break;
        g.stack = Math.round((g.stack + d) * 2) / 2;
      }
      changes.geometry.stack = g.stack;
    } catch (e) { /* keep the table value */ }
  }

  // The generic wheel options for a bike type, as [key, label, note]
  const wheelOptions = type => Object.entries((TYPES[type] || {}).wheels || {}).map(([k, w]) => [k, w.label, w.note]);

  // Older wheel keys (wheel + tyre in one, before v10.7) → the wheel key + tyre width. Saved links / chat still use them.
  const OLD_WHEELS = { gravel: { "700c40": ["700c", 40], "700c45": ["700c", 45], "650b50": ["650b", 50] } };
  function resolveWheel(type, key) {
    const W = (TYPES[type] || {}).wheels || {};
    if (key && W[key]) return { key, tyre: null };
    const o = (OLD_WHEELS[type] || {})[key]; if (o) return { key: o[0], tyre: o[1] };
    return { key: Object.keys(W)[0], tyre: null };
  }
  // Tyre widths that suit a wheel: { choices: [mm…], typical, inch (show inches: MTB), note, min, max }
  function tyreOptions(type, key) {
    const w = ((TYPES[type] || {}).wheels || {})[resolveWheel(type, key).key]; if (!w) return null;
    const t = w.tyres || { choices: [w.rear.width], typical: w.rear.width };
    return Object.assign({ min: Math.min(...t.choices) - 10, max: Math.max(...t.choices) + 15 }, t);
  }
  // "45 mm" or, on mountain bikes, 2.4" (61 mm)
  const INCH = { 51: "2.0", 56: "2.2", 58: "2.3", 60: "2.35", 61: "2.4", 64: "2.5", 66: "2.6", 71: "2.8", 76: "3.0" };
  function tyreLabel(type, mm, key) {
    const o = tyreOptions(type, key), r = Math.round(mm);
    if (o && o.inch) return `${INCH[r] || (mm / 25.4).toFixed(2)}" (${r} mm)`;
    return `${r} mm`;
  }

  // Typical numbers for a type + wheels, without a size (used to fill blanks when a user types only some numbers)
  root.FrameTemplates = { TYPES, SIZE_LIST, build, wheelOptions, tyreOptions, tyreLabel, resolveWheel, tyreOD, WHEEL_NAME, levelFrontAxle, genericTyre };
  if (typeof module !== "undefined") module.exports = root.FrameTemplates;
})(typeof window !== "undefined" ? window : globalThis);
