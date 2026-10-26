// ============================================================================
//  FRAME DESIGNS
//  This file holds the saved bike designs the app opens with.
//  To change a design, ask Claude in chat (e.g. "update the hardtail design with
//  the numbers from this drawing") — or edit the numbers below by hand.
//  Units: millimetres (mm), degrees (°), kilograms (kg).
// ============================================================================

(function (root) {

  // Numbers shared by every design unless a design overrides them.
  const DEFAULTS = {
    geometry: {
      reach: 453,            // mm, BB centre to head-tube top, horizontal
      stack: 640,            // mm, BB centre to head-tube top, vertical
      headAngle: 64.7,       // °
      seatAngle: 77,         // ° (straight seat tube, so actual = effective)
      bbDrop: 65,            // mm, BB below the rear axle
      chainstay: 437,        // mm, BB centre to rear axle
      headTube: 118.8,       // mm
      seatTube: 445,         // mm, BB centre to top of seat tube
      ttAtSeatTube: 415,     // mm, BB centre to where the top tube centreline meets the seat tube
      ttBelowHtTop: 18,      // mm, head-tube top to top-tube centreline
      dtAboveHtBottom: 28,   // mm, head-tube bottom to down-tube centreline
      ssBelowTt: 12,         // mm, how far below the top tube the seat stays join the seat tube
      forkA2C: 530,          // mm, fork axle-to-crown
      forkOffset: 44,        // mm
      lowerCupStack: 0,      // mm, zero-stack (ZS56) lower cup
      saddleHeight: 740,     // mm, BB centre to saddle top, measured along the seat tube
      saddleSetback: 50,     // mm, sit bones behind the seatpost clamp (inline post ≈ 40–60, setback post adds ~20)
      saddleStack: 45,       // mm, saddle top above the rail clamp
      seatpostLength: 450,   // mm, total seatpost length (insertion checks; a 150 mm dropper is ~440-480)
      tireDiameter: 758,     // mm, 29 x 2.6 tyre outside diameter
      tireWidth: 66,         // mm, tyre width (2.6")
      tireDiameterFront: "", // mm, front tyre outside diameter when the wheels differ (29" front / 27.5" rear); blank = same as the rear
      rimBSD: "",            // rear rim bead-seat diameter: 559 (26"), 584 (27.5"/650b), 622 (29"/700c), 686 (32"); blank = from the tyre size
      rimBSDFront: "",       // front rim, the same way (blank = as the rear)
      bbShellWidth: 73,      // mm, BB shell width
      csSpacingAtBB: 64,     // mm, chainstay (or yoke) centre-to-centre where they meet the BB shell
      csSpacingAtTire: 102,  // mm, chainstay centre-to-centre at their widest (tyre clearance)
      csWidestAt: 150,       // mm, how far back from the BB the stays reach their widest point
      stayWidthAtDropout: 132, // mm, stay centre-to-centre at the dropouts (Boost 148)
      ssSpacingAtTop: 50,    // mm, seat stay centre-to-centre where they meet the seat tube (≈ seat tube OD + stay OD when they're welded on its sides)
      // Stay shapes. Frame is specced for 29 x 2.6 tyres (tireWidth 66) with 6 mm clearance.
      ssShape: "curved",     // "straight" | "curved" (bent out just enough to clear the tyre) | "wishbone"
      ssClearance: 6,        // mm, target gap from the seat stays to the tyre
      wishboneLength: "",    // mm from the seat-stay junction down to the wishbone split (blank = 30 mm, as high as possible)
      csShape: "auto",       // "spline" (S-bend from the numbers below) | "auto" (bent just enough to clear the tyre) | "drawn" (top view from points)
      csClearance: 6,        // mm, target gap from chainstays / yoke to the tyre
      ssBridge: true,        // seat-stay bridge tube between the stays
      ssBridgeAbove: 40,     // mm, bridge height above the tyre tread (centre of the bridge sits this far plus its radius out)
      csYokeLength: 95,      // mm, chainstay yoke length from the BB centre (0 = no yoke)
      csYokeSpacing: 80,     // mm, minimum yoke arm spacing at its rear end (widened automatically to clear the tyre)
      csRingTuck: "",        // mm wanted between the chainring and the drive stay, where the stay is bent in past the ring (blank = off:
                             // both stays the same shape). Where ring and tyre want the same spot the stay goes halfway between them.
      // csShape "drawn" (v10.16): the stays' top view copied off a builder's drawing. Points "d:z, d:z, …" = stay centre z mm
      // out from the frame centre, d mm behind the BB centre (along the BB → axle line); a smooth curve runs through them.
      csPlanDrive: "",       // drive-side stay centre points (blank = the other shapes' rules)
      csPlanNds: "",         // non-drive stay centre points
      csDrivePlate: "",      // mm from the BB centre: the drive stay is a solid plate up to here (blank/0 = a tube all the way)
      csDrivePlateW: 6,      // mm, that plate's thickness (seen from above)
      csDrivePlateH: 25.5,   // mm, its height (side view)
      // Bent tubes (v9.4; all 0 / "none" = straight). See fea.js "tube bends".
      stBendOffset: 0,       // mm, seat tube: how far its bend sits in front of the straight BB → seat-tube-top line (tyre room)
      stBendHeight: 150,     // mm from the BB (along the seat-tube line) to the bend
      stBendRadius: "",      // mm, blank = auto (as gentle as fits)
      dtBendAngle: 0,        // °, down tube kink: + = bent up toward the top tube (fork-crown room), − = down toward the wheel
      dtBendFromHt: 120,     // mm from the head-tube joint to the bend, along the down tube
      dtBendRadius: "",      // mm, blank = auto
      ssBendStyle: "none",   // seat stays, side view: "none" | "bow" (one curve) | "kink" (one bend) | "s" (S-bend)
      ssBendDepth: 0,        // mm, how far the stay leaves the straight line: + = up / away from the tyre, − = down toward it
      ssBendAt: 150,         // mm from the rear axle to the kink (kink only)
      csBendStyle: "none",   // chainstays, side view: same styles
      csBendDepth: 0,        // mm, + = up, − = down (a "dropped" stay)
      csBendAt: 130,         // mm from the BB to the kink (kink only)
      singlespeed: true,     // sliding-dropout singlespeed (adds the slider checks)
      chainline: 52,         // mm, singlespeed Boost chainline
      chainring: 34,         // teeth
      cog: 20,               // teeth
      crankLength: 175,      // mm
      footOffset: 110,       // mm, centre of the frame to the middle of the foot on the pedal
      rearRotor: 160,        // mm, rear disc rotor (native PM160, no adapter)
      brakeMount: "slider",  // rear caliper: "slider" (post mount on the non-drive sliding dropout), "chainstay" or "seatstay"
      // Bottle cages (bottles.js). Boss positions are measured along the tube from the BB centre to the LOWER boss, the way the
      // builder dimensions them; the upper boss is bossSpacing further up. Blank / 0 = no cage there (not checked).
      dtBoss: "",            // mm, down tube, BB centre → lower bottle boss
      stBoss: "",            // mm, seat tube, BB centre → lower bottle boss
      bossSpacing: 64,       // mm between the two bosses of a cage (standard)
      dtBottle: "std-21",    // bottle in the down-tube cage (ids in bottles.js BOTTLES, e.g. "bivo-trio-21")
      stBottle: "std-21",    // bottle in the seat-tube cage
      dtCage: "standard",    // cage type (bottles.js CAGES, e.g. "silca-sicuro", "side-load")
      stCage: "standard",
      dtCageSlide: 0,        // mm, cage slid up (+) or down (−) on its slotted holes
      stCageSlide: 0,
      cageBelowBolt: ""      // mm, bottle base below the lower bolt hole; blank = the cage's typical value (measure yours)
    },
    // Parts drawn on the bike (display only; see parts.js)
    parts: { headBadge: "", fork: "sidUlt120", dropper: "oneupV3_150", tyreWidth: 66, rimDepth: 24, rotorF: 160, rotorR: 160,
             stemLength: 50, stemRise: 0, spacers: 10, barType: "flat", barWidth: 760, barRise: 20, backsweep: 8, crankAngle: 25,
             // realistic view: parts picked from the parts library (partlib.js / my_parts.js); generic parts (pick your own in the realistic view)
             sel: {"fork": "sidUlt120", "crankset": "cr-gx", "chainring": "ring-xsync2-blk", "rear": "ss-silver", "wheels": "wh-alloy", "tyres": "ty-trail26", "brakes": "br-xt", "cockpit": "ck-trail", "seatpost": "oneup150", "saddle": "sa-short", "pedals": "pe-flat"} },
    // Rider's shoe and pedal set-up, for the toe-overlap model (toe.js). shoeEU: EU shoe size; shoeSys: how the size is shown
    // (eu / usm / usw / uk / mm); shoeType: auto | road | mtb | flat | winter; cleatBack: mm the pedal axle sits behind the ball of
    // the foot; fender: none | full; footCentre: mm from the bike centreline to the middle of the foot (blank = typical);
    // toeAngle: toes out (+) / in (−) °; footPitch: toe down at 3 o'clock °; toeReach: measured toe tip past the pedal axle (blank = from size)
    fit: { shoeEU: 43, shoeSys: "eu", shoeType: "auto", wide: false, cleatBack: 0, fender: "none", fenderGap: 12, footCentre: "", toeAngle: 0, footPitch: 5, toeReach: "" },
    // Tube sizes: outside diameter (od) and wall thickness, both mm.
    // PLACEHOLDERS — typical titanium hardtail sizes until the builder's drawing arrives.
    tubes: {
      topTube:   { od: 38.1, wall: 0.9 },
      downTube:  { od: 44.5, wall: 1.0 },
      seatTube:  { od: 34.9, wall: 1.65 },  // 31.6 post fits inside, so the wall is ~1.65
      headTube:  { od: 52,   wall: 2.0 },   // ZS44/ZS56 tapered, modelled as one average size
      // Chainstays can be ovalised near the BB (ovalH tall × ovalW wide for ovalLength mm)
      // and tapered at the dropout end (to taperOD over the last taperLength mm).
      chainstay: { od: 22.2, wall: 0.9, ovalH: 25, ovalW: 18, ovalLength: 0, taperOD: 19, taperLength: 150 },
      seatStay:  { od: 16,   wall: 0.9 },
      csYoke:    { h: 32, w: 10, wall: 5 },
      ssBridge:  { od: 12.7, wall: 0.9 },   // seat-stay bridge tube  // plate yoke arms (height × thickness; wall = half thickness → solid)
      ssMono:    { od: 25, wall: 1.0 },     // wishbone single tube
      bbShell:   { od: 52,   wall: 2.5 },   // T47
      // Seatpost: type picks a preset (see FrameFEA.SEATPOSTS) with a lab-calibrated stiffness; "custom" uses od/wall/material
      seatpost:  { type: "dropper316", od: 31.6, wall: 2.5 }
    },
    material: {
      name: "Titanium 3Al-2.5V (cold-worked)",
      E: 100000,        // MPa, stiffness
      nu: 0.32,
      density: 4.48,    // g/cm³
      yield: 725,       // MPa, cold-worked tube body yield strength (TIMET: 724)
      uts: 860,         // MPa, cold-worked tube body tensile strength (TIMET: 862)
      jointYield: 500,  // MPa, at the welds the heat-affected zone is annealed (annealed Grade 9: 483–517)
      jointUts: 620,    // MPa, annealed tensile strength, used at the welds
      weldFatigue: 85,  // MPa, stress swing (± amplitude, tube-model stress) a welded joint survives for 2 million cycles
      fatigueMethod: "calibrated", // "calibrated" (matches real frames) or "hotspot" (IIW/DNV textbook, harsh on thin Ti)
      hotSpotFATfe: 615, // MPa: S-N level of the "3D weld models" method, calibrated so the gravel frame matches the default method
                         // (provisional: calibrated with its down tube/head tube joint only; redo with a CalculiX calibration run)
      hotSpotFAT: 116,  // MPa, hot-spot stress range at 2 million cycles, mean curve (FAT 80 design × 1.45)
      minSCF: 2.0,      // lowest joint stress-concentration factor allowed (CIDECT recommends 2.0)
      bodyFatigue: 280  // MPa, tube-body fatigue amplitude at 10 million cycles (annealed Ti-3Al-2.5V, unnotched)
    },
    rider: { riderKg: 77, bikeKg: 12 },   // 170 lb rider (change under Rider)
    // Load cases are multiples of weight (rider only, or rider + bike).
    loads: {
      seatedFactor: 2.0,    // × rider weight on the saddle, seated bump
      frontBrakeG: 1.0,     // × total weight as braking force at the front tyre (1 g stop)
      rearBrakeG: 0.5       // × total weight as braking force at the rear tyre
    },
    // How the bike gets ridden and which lab test level to check against.
    use: {
      condition: 4,         // EN 17406 riding condition 1–5 (4 = trail/enduro, drops to ~120 cm)
      isoType: "mountain",  // ISO 4210-6 test level: "racing" (road & gravel), "mountain", "city"
      isoSeverity: 1,       // 1 = standard ISO loads; 1.5 = tougher in-house brand testing
      sprintWatts: 2000,    // W, hardest sprint to check
      sprintCadence: 90,    // rpm during that sprint (lower cadence = more force on the pedal)
      avgWatts: 200,        // W, typical riding power (drives pedalling fatigue)
      avgCadence: 75,       // rpm, typical cadence (singlespeed climbing is low and grindy)
      hoursPerWeek: 5,      // riding hours per week, for fatigue life in years
      rearTirePsi: 22,      // rear tyre pressure (comfort estimate only; front assumed 10% lower)
      aggression: 1,        // riding style: 0.8 smooth, 1 normal, 1.25 hard, 1.5 savage (scales hits and drops)
      dropHeight: "",       // m, blank = the condition's typical biggest drop
      legStroke: 250,       // mm, how much your legs soak up on a landing
      tireSquish: 25,       // mm, tyre compression on a hard landing
      forkTravel: 120,      // mm, 0 for a rigid fork
      forkSag: 25,          // % of fork travel the fork sinks with you on the bike (sag.js: riding geometry)
      isoForkTravel: 140    // mm, longest fork the frame is approved for (ISO tests use this fork length)
    }
  };

  // Each design only lists what differs from DEFAULTS.
  // Shared copy: one example bike. Your own bikes are saved in your browser (Save as new / Export file).
  const DESIGNS = [
    {"id": "example-purple-ti-29er-ss", "name": "Example – purple Ti 29er singlespeed hardtail", "notes": "A worked example to explore: a titanium 29er trail hardtail (64.7° head angle, 120 mm fork, sliding-dropout singlespeed, 29 × 2.4 tyres, purple front triangle with raw Ti stays), modelled from a real builder's drawing: 437 mm chainstays copied off the drawing's top view (a 6 mm plate on the drive side for the first 100 mm), a down tube bent up near the head tube, a 32T ring on a 49 mm chainline, and bottle bosses at 330 (down tube) / 180 (seat tube). Change anything, or start your own with + New bike. Save a copy before big changes so you can compare.", "changes": {"geometry": {"reach": 453, "stack": 638.5, "headAngle": 64.7, "seatAngle": 77, "bbDrop": 65, "chainstay": 437, "headTube": 125, "seatTube": 445, "ttAtSeatTube": 405, "ttBelowHtTop": 28.5, "dtAboveHtBottom": 37.8, "ssBelowTt": 0, "dtBendAngle": 19.8, "dtBendFromHt": 103, "forkA2C": 530, "forkOffset": 44, "csYokeLength": 0, "chainring": 32, "chainline": 49, "bbShellWidth": 73, "csRingTuck": "", "tireWidth": 61, "tireDiameter": 744, "csShape": "drawn", "csDrivePlate": 100, "csDrivePlateW": 6, "csDrivePlateH": 25.5, "csPlanDrive": "30:27.9, 40:30.1, 50:32.3, 60:34.5, 70:36.6, 80:38.9, 90:41.1, 96:43.0, 104:48.9, 120:48.9, 150:48.8, 190:48.8, 210:49.9, 230:52.5, 250:56.5", "csPlanNds": "40:28.6, 50:34.5, 60:39.5, 70:43.6, 80:46.7, 90:48.8, 100:50.0, 110:50.5, 150:50.7, 190:50.8, 210:52.0, 230:55.0, 250:59.2", "dtBottle": "bivo-trio-21", "stBottle": "std-21", "dtCage": "silca-sicuro", "stCage": "silca-sicuro", "dtBoss": 330, "stBoss": 180}, "tubes": {"topTube": {"od": 31.8, "wall": 0.9}, "downTube": {"od": 44.5, "wall": 1.0}, "seatTube": {"od": 34.9, "wall": 0.9}, "headTube": {"od": 54, "wall": 2.0}, "chainstay": {"od": 22.2, "wall": 1.2, "ovalH": 25.5, "ovalW": 18.5, "ovalLength": 220, "taperOD": 19, "taperLength": 180}, "seatStay": {"od": 19, "wall": 1.2, "topTaperOD": 16, "topTaperLength": 80}}, "parts": {"tyreWidth": 61, "sel": {"chainring": "ring-xsync2-32-49", "tyres": "ty-trail24"}}}}
  ];

  // New builder drawings to offer to bikes saved in the browser (Save / garage): the app asks once whether to bring
  // a saved copy up to date (geometry + tubes from the preset; parts, paint, fit and garage notes stay; the old
  // version is kept as "… (before …)"). match = which saved bikes to tick by default (by name or notes). A new id asks
  // again (e.g. after the preset itself was corrected); supersedes = older ids it replaces, so they aren't asked as well.
  const UPDATES = [];

  // a typical builder's tube sheet (their frame order form, 2024): shapes offered. Walls are not on the sheet (~0.9 mm on the
  // stays per their drawings); down-tube walls here are editable guesses — ask your builder what they use for an MTB.
  const TI_TUBES = {
    downTube: {
      round445:  { label: "Ø44.5 round (current)", spec: { od: 44.5, wall: 1.0 } },
      r381:      { label: "Ø38.1 round (a common XC down tube)", spec: { od: 38.1, wall: 1.0 } },
      r42:       { label: "Ø42 round", spec: { od: 42, wall: 1.0 } },
      r48:       { label: "Ø48 round", spec: { od: 48, wall: 1.0 } },
      bx40:      { label: "\"40 mm\" biaxially ovalised: Ø34.9 tube, 40×30 at head tube → 30×40 at BB", spec: { shape: "biaxial", od: 34.9, htH: 40, htW: 30, bbH: 30, bbW: 40, wall: 1.0 } },
      bx44:      { label: "\"44 mm\" biaxially ovalised: Ø40 tube, 44×36 at head tube → 34×47.6 at BB", spec: { shape: "biaxial", od: 40, htH: 44, htW: 36, bbH: 34, bbW: 47.6, wall: 1.0 } },
      bx445:     { label: "Ø44.5 biaxially ovalised (the \"curved at head tube\" hydroformed tube; bend not modelled): 50×38 → 38×50", spec: { shape: "biaxial", od: 44.5, htH: 50, htW: 38, bbH: 38, bbW: 50, wall: 0.9 } },
      td35:      { label: "35×22 teardrop", spec: { shape: "teardrop", h: 35, w: 22, wall: 1.0 } },
      td38:      { label: "38×25 teardrop", spec: { shape: "teardrop", h: 38, w: 25, wall: 1.0 } },
      td44:      { label: "44×26 teardrop", spec: { shape: "teardrop", h: 44, w: 26, wall: 1.0 } },
      td50:      { label: "50×27 teardrop", spec: { shape: "teardrop", h: 50, w: 27, wall: 1.0 } },
      td56:      { label: "56×25 teardrop", spec: { shape: "teardrop", h: 56, w: 25, wall: 1.0 } },
      dia42:     { label: "42×26 diamond", spec: { shape: "diamond", h: 42, w: 26, wall: 1.0 } },
      dia46:     { label: "46×28 diamond", spec: { shape: "diamond", h: 46, w: 28, wall: 1.0 } },
      dia50:     { label: "50×31 diamond", spec: { shape: "diamond", h: 50, w: 31, wall: 1.0 } }
    },
    seatStay: {
      r16:  { label: "Ø16 round (current placeholder)", spec: { od: 16, wall: 0.9 } },
      ssA:  { label: "22×16 oval at the top, Ø19, tapered to Ø16 (single bend)", spec: { od: 19, wall: 0.9, ovalH: 22, ovalW: 16, ovalLength: 80, taperOD: 16, taperLength: 150 } },
      ssB:  { label: "Ø19 tapered to Ø16 at both ends (double bend)", spec: { od: 19, wall: 0.9, taperOD: 16, taperLength: 150, topTaperOD: 16, topTaperLength: 100 } },
      ssC:  { label: "Ø19 tapered to Ø14 (builders: lightweight riders only)", spec: { od: 19, wall: 0.9, taperOD: 14, taperLength: 150 } }
    },
    chainstay: {
      cs22: { label: "Ø22.2, tapered to Ø19 (current placeholder)", spec: { od: 22.2, wall: 0.9, ovalH: 25, ovalW: 18, ovalLength: 0, taperOD: 19, taperLength: 150 } },
      csA:  { label: "27×17 oval → Ø16 round (single or double bend)", spec: { od: 22.2, wall: 0.9, ovalH: 27, ovalW: 17, ovalLength: 100, taperOD: 16, taperLength: 180 } },
      csC:  { label: "32×18 oval → Ø16 round", spec: { od: 25.4, wall: 0.9, ovalH: 32, ovalW: 18, ovalLength: 100, taperOD: 16, taperLength: 240 } }
    }
  };

  // Stress factors measured on 3D solid weld models (CalculiX), shared by every design with the same joint sizes.
  // Filled in from CalculiX weld-joint runs. Each: chord/brace sizes, angle, and the
  // hot-spot stress factor on the chord side and the brace side for axial, in-plane and out-of-plane bending.
  const FE_SCF_LIBRARY = [
    // gravel bike down tube → head tube (48×1.8 head tube, 42×0.9 down tube, 58.6°), CalculiX run
    { D: 48, T: 1.8, d: 42, t: 0.9, theta: 58.6, weldLeg: 2.7, chord: { axial: 4.366, ipb: 1.265, opb: 2.558 }, brace: { axial: 5.463, ipb: 3.574, opb: 5.418 }, names: ["Down tube → head tube [example gravel bike]"], date: "2026-09-29" }
  ];
  root.FE_SCF_LIBRARY = FE_SCF_LIBRARY;
  root.TI_TUBES = TI_TUBES;
  root.FRAME_DEFAULTS = DEFAULTS;
  root.FRAME_DESIGNS = DESIGNS;
  root.FRAME_UPDATES = UPDATES;
})(typeof window !== "undefined" ? window : globalThis);
