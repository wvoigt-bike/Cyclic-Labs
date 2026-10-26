// ============================================================================
//  PARTS LIBRARY for the realistic view
//  Every part the realistic view can draw is a library entry: a category, a
//  name and the numbers / colours the 3D model needs. Three sources:
//    1. CATALOG below      - generic parts that ship with Cyclic Labs
//    2. my_parts.js        - your own parts (see that file)
//    3. the browser        - parts added in the app ("My parts" editor), saved
//                            in this browser; Export sends them to Claude.
//  A bike picks one part per category in design.parts.sel = { fork: id, ... }.
//  Display only: the analysis never reads any of this. (A fork's travel /
//  axle-to-crown can be copied into the analysis with a button.)
// ============================================================================
(function (root) {
  "use strict";
  const STORE = "frameBench.myParts.v1";

  // ---------------------------------------------------------------- what each category holds
  // field: [key, label, type, default, extra]   type: n number (extra = unit), t text, c colour, s select (extra = [[v, label]])
  // select lists for shape presets come from parts3d.js (window.FrameShapes) so a new preset there appears here
  const SHP = kind => { const F = root.FrameShapes; return F && F.SHAPES[kind] ? F.options(kind) : []; };
  const FIN = [["gloss", "Gloss"], ["matte", "Matte"], ["metallic", "Metallic paint"], ["anodised", "Anodised"], ["polished", "Polished"]];
  const CATS = {
    fork: { label: "Fork", fields: [
      ["type", "Type", "s", "suspension", [["suspension", "Suspension"], ["rigid", "Rigid"]]],
      ["style", "Rigid fork shape", "s", "gravel", [["gravel", "Road / gravel carbon (slim tapered blades, 12 x 100, flat mount)"], ["ti", "Titanium, straight round blades (built with the frame, 12 x 100, flat mount)"], ["mtb", "Mountain (suspension-corrected, 15 x 110, post mount)"]]],
      ["weave", "Carbon look (rigid)", "s", "ud", [["ud", "Smooth UD carbon"], ["twill", "Woven (twill) carbon"]]],
      ["travel", "Travel", "n", 120, "mm"], ["a2c", "Axle-to-crown", "n", 530, "mm"], ["offset", "Offset", "n", 44, "mm"],
      ["stanchion", "Stanchion diameter", "n", 34, "mm"], ["lower", "Lower leg diameter (top)", "n", 41, "mm"], ["legSpacing", "Leg spacing (centres)", "n", 140, "mm"],
      ["stanchionFinish", "Stanchions", "s", "kashima", [["kashima", "Kashima (gold-bronze)"], ["black", "Black"], ["silver", "Silver"]]],
      ["lowerColor", "Lowers colour", "c", "#111214"], ["lowerFinish", "Lowers finish", "s", "gloss", FIN.concat([["candy", "Wet-look metallic (smooth, no sparkle)"]])],
      ["crownColor", "Crown colour", "c", "#111214"], ["crownFinish", "Crown finish", "s", "gloss", FIN],
      ["stepCast", "Step-Cast lowers (slim legs, dropouts stepped out)", "s", "no", [["no", "No"], ["yes", "Yes"]]],
      ["brandText", "Logo on the lowers", "t", "FOX"], ["decalColor", "Logo colour", "c", "#f26b21"], ["decalOutline", "Logo outline (blank = none)", "t", "#ffffff"],
      ["modelText", "Small text on the lowers", "t", "34"],
      ["decalLayout", "Logo layout", "s", "classic", [["classic", "Logo along both legs, small text above"], ["split", "Big number split across the legs (3 | 4), logo low on the left leg (Fox 34 SL / Podium)"]]],
      ["legNumber", "Big number (split layout: first character left leg, rest right leg)", "t", ""],
      ["arch", "Arch", "s", "front", [["front", "In front of the legs (Fox)"], ["rear", "Behind the legs (RockShox)"]]],
      ["axleColor", "Axle colour", "c", "#141414"],
      // rigid road / gravel / Ti fork shape (0 = the shape's own size). Axle-to-crown and offset above are the fork's real
      // numbers; the bike is drawn to the analysis numbers until "Use this fork in the analysis" copies them across.
      ["clearance", "Tyre clearance: widest tyre it takes (0 = fits the tyre drawn)", "n", 0, "mm"],
      ["bladeDepth", "Blade depth at the crown, front to back (0 = shape's own)", "n", 0, "mm"], ["bladeWidth", "Blade width at the crown, side to side (0 = shape's own)", "n", 0, "mm"],
      ["tipDepth", "Blade depth at the dropout (0 = shape's own)", "n", 0, "mm"], ["tipWidth", "Blade width at the dropout (0 = shape's own)", "n", 0, "mm"],
      ["bladeCurve", "Blade line, side view", "s", "auto", [["auto", "Shape's own"], ["straight", "Straight (most modern carbon / Ti forks)"], ["curved", "Curved forward near the tip (classic rake)"]]],
      ["shoulders", "Crown shoulders, front view", "s", "round", [["round", "Rounded"], ["square", "Square (flat-topped crown)"]]],
      ["mounts", "Mounts on the blades", "s", "none", [["none", "None"], ["fender", "Fender eyelets"], ["cargo", "Three-pack cargo mounts on each blade"], ["cargoFender", "Three-pack + fender eyelets"], ["all", "Three-pack + low-rider + fender eyelets"]]],
      ["tiFinish", "Titanium fork finish", "s", "brushed", [["brushed", "Brushed raw titanium"], ["paint", "Painted (lowers colour + finish)"]]],
      ["tiCrown", "Titanium fork crown", "s", "unicrown", [["unicrown", "Unicrown (blades bend in and weld to the steerer)"], ["segmented", "Segmented (machined crown block, straight blades welded under it)"]]],
      ["bladeLogoColor", "Blade logo colour (rigid forks: logo text = 'Logo on the lowers')", "c", "#e8e8e8"]] },
    crankset: { label: "Crankset", fields: [
      ["length", "Crank length (0 = as in the analysis)", "n", 0, "mm"],
      ["material", "Arms", "s", "alloy", [["carbon", "Carbon"], ["alloy", "Aluminium"]]],
      ["color", "Arm colour", "c", "#151517"], ["finish", "Arm finish", "s", "matte", FIN],
      ["logoText", "Logo on the arms", "t", ""], ["logoColor", "Logo colour", "c", "#d4a017"],
      ["bootColor", "Arm-end boots / accents", "c", ""],
      ["shape", "Arm shape", "s", "generic", SHP("crank")], ["insertColor", "Pedal insert colour (shapes with an insert)", "c", "#1a1a1c"],
      ["extractorColor", "Crank-bolt cap colour (non-drive)", "c", "#141416"]] },
    chainring: { label: "Chainring", fields: [
      ["teeth", "Teeth (0 = as in the analysis)", "n", 0, "T"], ["color", "Colour", "c", "#18181a"], ["finish", "Finish", "s", "anodised", FIN],
      ["teeth2", "Inner ring teeth for a 2x crank (0 = 1x, one ring)", "n", 0, "T", { min: 24, max: 46, zero: true, int: true }],
      // shape presets live in parts3d.js (SHAPES.ring / SHAPES.mount / SHAPES.chain): add a preset there, it shows up here
      ["shape", "Web shape", "s", "xsync2", SHP("ring")], ["mount", "Mounting", "s", "sram3", SHP("mount")],
      ["profile", "Tooth profile", "s", "nw", [["nw", "Narrow-wide (alternating thick / thin teeth)"], ["std", "Standard teeth"]]],
      ["accentColor", "Machined chamfer colour (blank = same as the ring)", "c", ""],
      ["logoText", "Engraved text (auto = the shape's own, blank = none)", "t", "auto"], ["logoColor", "Engraving colour", "c", "#8c8d91"],
      ["chainColor", "Chain", "s", "silver", SHP("chain")]] },
    rear: { label: "Rear cog / cassette", fields: [
      ["type", "Type", "s", "singlespeed", [["singlespeed", "Singlespeed cog + spacers"], ["sram12", "SRAM Eagle 12-speed"], ["sramRoad12", "SRAM AXS 12-speed road (10-33)"], ["shimano12", "Shimano 12-speed"]]],
      ["teeth", "Cog teeth (0 = as in the analysis)", "n", 0, "T"], ["color", "Cog colour", "c", "#1a1a1c"], ["spacerColor", "Spacer colour", "c", "#1a1a1c"],
      ["brandText", "Text on the cog", "t", ""],
      ["cogShape", "Singlespeed cog shape", "s", "wmfg", SHP("cog")], ["lockringColor", "Lockring colour", "c", "#2a2b2e"]] },
    wheels: { label: "Wheels", fields: [
      ["rimMaterial", "Rims", "s", "alloy", [["carbon", "Carbon (woven)"], ["carbonUD", "Carbon (smooth UD, no weave)"], ["alloy", "Aluminium"]]],
      ["rimColor", "Rim colour", "c", "#111112"], ["rimFinish", "Rim finish", "s", "matte", FIN],
      ["rimInner", "Rim inside width", "n", 30, "mm"], ["rimOuter", "Rim outside width", "n", 35, "mm"], ["rimDepth", "Rim depth", "n", 24, "mm"],
      ["spokes", "Spokes per wheel", "n", 28, ""], ["spokeColor", "Spoke colour", "c", "#1b1b1d"],
      ["hubColor", "Hub colour (flanges, end caps)", "c", "#151517"], ["hubShellColor", "Hub barrel colour (blank = same)", "c", ""], ["hubFinish", "Hub barrel finish", "s", "anodised", FIN],
      ["hubText", "Text on the hubs", "t", ""],
      ["rimLogo", "Big logo on the rim sides (two per side, reading round the wheel)", "t", ""], ["rimLogoColor", "Big logo colour (same as rim = tone-on-tone gloss)", "c", "#1c1c1f"],
      ["decalText", "Model text on the rims", "t", ""], ["decalColor", "Model text colour", "c", "#e8e8e8"],
      ["decalAccent", "Accent after the model text (e.g. XXX)", "t", ""], ["decalAccentColor", "Accent colour", "c", "#ff4f6a"],
      ["rimBadge", "Box logo before the model text", "s", "no", [["no", "No"], ["yes", "Yes"]]]] },
    tyres: { label: "Tyres", fields: [
      ["width", "Width", "n", 61, "mm"], ["tread", "Tread", "s", "trail", [["xc", "Fast XC (low, close knobs)"], ["trail", "Trail (taller knobs)"], ["gravel", "Gravel (small file tread)"], ["road", "Road slick (no knobs)"]]],
      ["sidewall", "Sidewalls", "s", "black", [["black", "Black"], ["tan", "Tan / skinwall"]]],
      ["brandText", "Text on the sidewall", "t", ""], ["textColor", "Sidewall text colour", "c", "#d8d8d8"]] },
    brakes: { label: "Brakes", fields: [
      ["style", "Caliper shape", "s", "shimano", [["shimano", "Shimano-style 4-piston"], ["sram", "SRAM-style 4-piston"], ["hope-x2", "Hope X2 (CNC one-piece, 2-piston)"]]],
      ["leverStyle", "Lever shape", "s", "std", [["std", "Standard (matches the caliper)"], ["hope-xcr", "Hope XCR Pro (radial, slim blade)"]]],
      ["bodyColor", "Caliper / lever colour", "c", "#5c5f66"], ["finish", "Finish", "s", "anodised", FIN],
      ["bladeMaterial", "Lever blade", "s", "alloy", [["alloy", "Aluminium"], ["carbon", "Carbon"]]], ["bladeColor", "Lever blade colour", "c", "#c8cacc"],
      ["logoText", "Logo on the caliper", "t", ""], ["logoColor", "Caliper logo colour", "c", "#8e9196"],
      ["hoseColor", "Hose colour", "c", "#151517"],
      ["dropLeverColor", "Drop bars: shift / brake lever blade colour (blank = caliper colour; carbon if 'Lever blade' is carbon)", "c", ""],
      ["rotorF", "Front rotor", "n", 180, "mm"], ["rotorStyle", "Rotor look", "s", "shimano", [["shimano", "Black spider, 2-piece"], ["sram", "One-piece steel"], ["hope", "Hope floating (alloy carrier)"]]],
      ["rotorCarrier", "Rotor carrier colour (Hope floating)", "c", "#c4c6c9"]] },
    cockpit: { label: "Stem & bar", fields: [
      ["barType", "Bar", "s", "flat", [["flat", "Flat / riser (MTB)"], ["drop", "Drop bar (gravel)"]]],
      ["barWidth", "Bar width", "n", 760, "mm"], ["barRise", "Bar rise", "n", 20, "mm"], ["backsweep", "Backsweep", "n", 8, "°"], ["upsweep", "Upsweep", "n", 5, "°"],
      ["stemLength", "Stem length", "n", 50, "mm"], ["stemRise", "Stem rise", "n", 0, "°"],
      ["barColor", "Bar colour", "c", "#141416"], ["barMaterial", "Bar", "s", "alloy", [["alloy", "Aluminium"], ["carbon", "Carbon (woven look)"], ["carbonUD", "Carbon (unidirectional, smooth)"]]],
      ["stemColor", "Stem colour", "c", "#141416"], ["gripColor", "Grips / tape colour", "c", "#1a1a1a"],
      // shape presets live in parts3d.js (SHAPES.stem / headset / topCap / grip / gripType)
      ["stemShape", "Stem body", "s", "forged", SHP("stem")], ["stemClampH", "Stem steerer-clamp height", "n", 40, "mm", { min: 28, max: 55 }],
      ["faceplate", "Faceplate", "s", "4", [["4", "4-bolt"], ["2", "2-bolt"]]], ["stemFinish", "Stem finish", "s", "anodised", FIN],
      ["stemLogo", "Logo on the stem", "t", ""], ["stemLogoColor", "Stem logo colour", "c", "#d8d8d8"], ["boltColor", "Stem / collar bolts", "c", "#1a1a1c"],
      ["spacers", "Spacers under the stem (-1 = this bike's setting)", "n", -1, "mm", { min: -1, max: 60 }], ["spacerColor", "Spacer colour (blank = stem colour)", "c", ""],
      ["headset", "Headset top", "s", "zs", SHP("headset")], ["headsetColor", "Headset colour", "c", "#151517"],
      ["topCap", "Top cap", "s", "flat", SHP("topCap")], ["topCapColor", "Top cap colour (blank = stem colour)", "c", ""],
      ["barClamp", "Bar clamp diameter", "s", "35", [["35", "35 mm"], ["31.8", "31.8 mm"]]], ["barFinish", "Bar finish", "s", "anodised", FIN],
      ["barLogo", "Logo on the bar", "t", ""], ["barLogoColor", "Bar logo colour", "c", "#e0e0e0"],
      ["barText2", "Second text on the bar (further out)", "t", ""], ["barText2Color", "Second text colour", "c", "#9a9ca0"], ["barBand", "Centre graphic band colour (blank = none)", "c", ""],
      ["gripType", "Grips", "s", "lockon1", SHP("gripType")], ["gripLength", "Grip length", "n", 135, "mm", { min: 90, max: 165 }],
      ["gripPattern", "Grip pattern (drop bars always get tape)", "s", "waffle", SHP("grip")], ["collarColor", "Grip collar colour", "c", "#1a1a1c"],
      ["leverInboard", "Brake lever: distance inboard of the grip", "n", 18, "mm", { min: 0, max: 80 }], ["leverAngle", "Brake lever angle below level", "n", 22, "°", { min: 0, max: 60 }],
      ["routing", "Rear hose / dropper routing", "s", "external", [["external", "Along the down tube"], ["internal", "Internal (ports on the down tube)"], ["headset", "Through the headset (FSA ACR-style integrated)"]]],
      // drop-bar geometry (published on every drop bar's spec sheet)
      ["widthAt", "Drop bar: width is measured", "s", "hoods", [["hoods", "At the hoods / tops (most brands)"], ["drops", "At the drop ends (e.g. Salsa)"]]],
      ["dropReach", "Drop bar: reach", "n", 78, "mm"], ["dropDrop", "Drop bar: drop", "n", 122, "mm"], ["dropFlare", "Drop bar: flare of the drops", "n", 12, "°"],
      ["dropFlareOut", "Drop bar: flare-out (outsweep) at the hoods", "n", 0, "°"], ["dropSweep", "Drop bar: backsweep of the tops", "n", 0, "°"], ["dropRise", "Drop bar: rise of the tops", "n", 0, "mm"],
      ["spacersAbove", "Spacers on top of the stem", "n", 0, "mm"]] },
    seatpost: { label: "Seatpost", fields: [
      ["type", "Type", "s", "dropper", [["dropper", "Dropper"], ["rigid", "Rigid"]]],
      ["travel", "Dropper travel", "n", 150, "mm"], ["stack", "Collar to rails, post down", "n", 30, "mm"], ["collar", "Collar height", "n", 12, "mm"], ["stanchion", "Stanchion diameter", "n", 26, "mm"],
      ["color", "Colour", "c", "#141416"], ["stanchionColor", "Stanchion colour", "c", "#0e0e10"],
      ["head", "Head / saddle clamp", "s", "generic", SHP("postHead")], ["collarColor", "Collar colour (blank = post colour)", "c", ""],
      ["boltColor", "Saddle-clamp bolts (blank = steel)", "c", ""],
      ["logoText", "Logo on the outer tube", "t", ""], ["logoColor", "Logo colour", "c", "#9a9ca0"]] },
    saddle: { label: "Saddle", fields: [
      ["shape", "Shape", "s", "shortNose", [["shortNose", "Short nose with cut-out"], ["midCutout", "Mid-length with cut-out (270 mm)"], ["classic", "Classic long nose"], ["flat", "Flat profile"]]],
      ["length", "Length (0 = the shape's)", "n", 0, "mm"], ["width", "Width (0 = the shape's)", "n", 0, "mm"],
      ["top", "Top", "s", "cover", [["cover", "Padded cover"], ["lattice", "3D-printed lattice"]]],
      ["color", "Cover / lattice colour", "c", "#303032"], ["shellColor", "Shell colour (lattice saddles)", "c", "#141416"],
      ["railMaterial", "Rails", "s", "alloy", [["alloy", "Round metal (7 mm)"], ["carbon", "Oval carbon (7x10)"]]],
      ["railColor", "Rail colour", "c", "#c8c8ca"], ["brandText", "Text on the back", "t", ""], ["textColor", "Text colour", "c", "#8c8e92"]] },
    pedals: { label: "Pedals", fields: [
      ["type", "Type", "s", "flat", [["flat", "Flat with pins"], ["clip", "Clip-in (trail SPD)"], ["candy", "Crankbrothers Candy (open body, eggbeater wings)"]]],
      ["color", "Colour", "c", "#151517"], ["pinColor", "Pins / cleat mechanism (Candy: wings)", "c", "#c8c8ca"],
      ["springColor", "Spring colour (Candy)", "c", "#121214"], ["capColor", "End cap / traction inserts (Candy)", "c", "#c3c5c9"]] }
  };
  const ORDER = Object.keys(CATS);

  // ---------------------------------------------------------------- facts about the real part (not drawn)
  // Every category also carries: brand, model, product link and notes. They are kept with the part so a later
  // edit (by W or by Claude) can go back to the product page. Marked "info" so tools know they aren't drawn.
  const INFO = [["brand", "Brand", "t", "", "info"], ["model", "Model / variant", "t", "", "info"], ["url", "Product link", "t", "", "info"], ["notes", "Notes (what's assumed)", "t", "", "info"]];
  const INFO_KEYS = INFO.map(f => f[0]);
  for (const c of ORDER) for (const f of INFO) if (!CATS[c].fields.some(x => x[0] === f[0])) CATS[c].fields.push(f.slice());
  // bookkeeping keys a part may carry besides its fields
  const META = ["id", "cat", "name", "base", "builtIn", "fromFile", "inBrowser", "src", "missing", "preview", "adjusted"];

  // ---------------------------------------------------------------- base models and per-bike adjustments
  // A part can be built on another one: { id, cat, name, base: "<id of the base part>", ...only what's different }.
  // Everything it doesn't set comes from the base (and the base's base), so a fix to the base reaches every part built on it.
  // A bike can also adjust sizes of the part it shows without making a new part: design.parts.adj = { cockpit: { stemLength: 90 } }.
  // ADJUST lists the sizes a bike may adjust (looks stay with the part). Blank / missing = the part's own value.
  const LEGACY_CK = ["barType", "barWidth", "barRise", "backsweep", "upsweep", "stemLength", "stemRise", "spacers"];   // what a bike with no cockpit part sets itself
  const ADJUST = {
    fork: ["a2c", "offset", "travel", "clearance"],
    crankset: ["length"],
    chainring: ["teeth"],
    rear: ["teeth"],
    tyres: ["width"],
    brakes: ["rotorF"],
    cockpit: ["stemLength", "stemRise", "spacers", "spacersAbove", "stemClampH", "barWidth", "barRise", "backsweep", "upsweep",
      "dropReach", "dropDrop", "dropFlare", "dropFlareOut", "dropSweep", "dropRise", "widthAt", "leverInboard", "leverAngle", "gripLength"],
    seatpost: ["travel"]
  };

  // ---------------------------------------------------------------- allowed ranges for numbers
  // "cat.key": { min, max, zero: 0 also allowed (means "as in the analysis" / "none"), int: whole numbers }.
  // A field can carry its own range as a 6th entry instead: ["teeth", "Teeth", "n", 0, "T", { min: 26, max: 40, zero: true, int: true }].
  // min / max may be functions of the part (e.g. bar width depends on flat or drop bar).
  // A number field with no range here is still checked for being a real number (tests/parttest.js lists it).
  const LIMITS = {
    "fork.travel": { min: 30, max: 200, zero: true }, "fork.a2c": { min: 340, max: 620, zero: true }, "fork.offset": { min: 30, max: 60, zero: true },
    "fork.stanchion": { min: 26, max: 40, zero: true }, "fork.lower": { min: 20, max: 52 }, "fork.legSpacing": { min: 100, max: 170 },
    "crankset.length": { min: 140, max: 185, zero: true },
    "chainring.teeth": { min: 26, max: 52, zero: true, int: true, hardMin: 20, hardMax: 54 },   // MTB 28–36, 1x gravel / road 38–50
    "rear.teeth": { min: 9, max: 52, zero: true, int: true },
    "wheels.rimInner": { min: 13, max: 45 }, "wheels.rimOuter": { min: 16, max: 55 }, "wheels.rimDepth": { min: 10, max: 70 }, "wheels.spokes": { min: 16, max: 48, int: true },
    "tyres.width": { min: 23, max: 90 },
    "brakes.rotorF": { min: 140, max: 230 },
    "cockpit.barWidth": { min: p => p && p.barType === "drop" ? 360 : 560, max: p => p && p.barType === "drop" ? 560 : 840 },
    "cockpit.barRise": { min: 0, max: 80 }, "cockpit.backsweep": { min: 0, max: 45 }, "cockpit.upsweep": { min: 0, max: 15 },
    "cockpit.stemLength": { min: 20, max: 150 }, "cockpit.stemRise": { min: -45, max: 45 },
    "cockpit.dropReach": { min: 55, max: 100 }, "cockpit.dropDrop": { min: 85, max: 150 }, "cockpit.dropFlare": { min: 0, max: 40 }, "cockpit.dropFlareOut": { min: 0, max: 20 },
    "cockpit.dropSweep": { min: 0, max: 25 }, "cockpit.dropRise": { min: 0, max: 50 }, "cockpit.spacersAbove": { min: 0, max: 30 },
    "fork.clearance": { min: 25, max: 70, zero: true }, "fork.bladeDepth": { min: 20, max: 60, zero: true }, "fork.bladeWidth": { min: 18, max: 45, zero: true },
    "fork.tipDepth": { min: 12, max: 35, zero: true }, "fork.tipWidth": { min: 10, max: 30, zero: true },
    "seatpost.travel": { min: 50, max: 250, zero: true }, "seatpost.stack": { min: 10, max: 90 }, "seatpost.collar": { min: 0, max: 30 }, "seatpost.stanchion": { min: 20, max: 36 },
    "saddle.length": { min: 200, max: 300, zero: true }, "saddle.width": { min: 120, max: 175, zero: true }
  };
  // extra select values that are accepted but not offered in the editor (older bikes)
  const EXTRA_OK = { "rear.type": ["auto"] };
  const FREE = { min: -10000, max: 10000 };
  function limitsOf(cat, f, p) {
    const L = (f && f[5] && typeof f[5] === "object" ? f[5] : LIMITS[cat + "." + (f && f[0])]) || null; if (!L) return null;
    const v = x => typeof x === "function" ? x(p) : x;
    return { min: v(L.min), max: v(L.max), zero: !!L.zero, int: !!L.int, hardMin: L.hardMin != null ? v(L.hardMin) : v(L.min), hardMax: L.hardMax != null ? v(L.hardMax) : v(L.max) };
  }
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const normHex = s => { s = s.toLowerCase(); return s.length === 4 ? "#" + s[1] + s[1] + s[2] + s[2] + s[3] + s[3] : s; };
  const colourish = f => f[2] === "c" || (f[2] === "t" && /(colou?r|outline)$/i.test(f[0]));   // text fields that hold a colour or "" (e.g. decalOutline)
  function lev(a, b) {
    a = a.toLowerCase(); b = b.toLowerCase(); const m = a.length, n = b.length, d = []; for (let i = 0; i <= m; i++) d[i] = [i];
    for (let j = 1; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    return d[m][n];
  }
  // closest name in a list, or "" when nothing is close
  function didYouMean(word, list) {
    let best = "", bd = 1e9; for (const w of list) { const d = lev(String(word), String(w)); if (d < bd) { bd = d; best = w; } }
    return best && bd <= Math.max(2, Math.floor(String(word).length / 3)) ? best : "";
  }
  const fieldOf = (cat, k) => CATS[cat] && CATS[cat].fields.find(f => f[0] === k);

  // ---------------------------------------------------------------- checking a part
  // validate(part) → [{ level: "error" | "warn", field, msg }]. "error" = would be drawn wrong (complete() fixes it
  // by clamping or using the default); "warn" = unusual, check it. Driven entirely by CATS, so new fields are covered.
  function validate(p) {
    const out = [], add = (level, field, msg) => out.push({ level, field, msg });
    if (!p || typeof p !== "object" || Array.isArray(p)) { add("error", "", "not a part (needs { id, cat, name, ... })"); return out; }
    if (typeof p.id !== "string" || !p.id.trim()) add("error", "id", "missing id");
    else if (!/^[a-z0-9][a-z0-9._-]*$/i.test(p.id)) add("warn", "id", `id "${p.id}" should be letters, numbers and dashes only (e.g. w-brand-model-variant)`);
    if (!CATS[p.cat]) { const g = didYouMean(p.cat, ORDER); add("error", "cat", `unknown category "${p.cat}"` + (g ? ` (did you mean "${g}"?)` : "") + `; use one of ${ORDER.join(", ")}`); return out; }
    if (typeof p.name !== "string" || !p.name.trim()) add("warn", "name", "missing name");
    if (p.base !== undefined && p.base !== "") {
      const b = typeof p.base === "string" ? rawOnly(p.base) : null;
      if (typeof p.base !== "string") add("error", "base", "base should be the id of another part");
      else if (p.base === p.id) add("error", "base", "a part can't be its own base");
      else if (!b) { const g = didYouMean(p.base, all().map(q => q.id)); add("error", "base", `base part "${p.base}" not found` + (g ? ` (did you mean "${g}"?)` : "") + "; drawn from the category defaults instead"); }
      else if (b.cat !== p.cat) add("error", "base", `base part "${p.base}" is a ${b.cat}, not a ${p.cat}`);
      else { const chain = baseChain(p); if (chain.loop) add("error", "base", `base parts go round in a loop (${chain.ids.join(" → ")})`); }
    }
    const C = CATS[p.cat], keys = C.fields.map(f => f[0]);
    const flatOf = q => { try { return flatten(q); } catch (e) { return q; } };
    for (const k of Object.keys(p)) {
      if (META.includes(k) || k.startsWith("_") || keys.includes(k)) continue;
      const g = didYouMean(k, keys); add("warn", k, `"${k}" isn't a ${C.label.toLowerCase()} field, so it isn't drawn` + (g ? ` (did you mean "${g}"?)` : ""));
    }
    for (const f of C.fields) {
      const [k, lab, t, , x] = f; if (!(k in p) || p[k] === undefined) continue; const v = p[k];
      if (colourish(f)) {
        if (t === "t" && v === "") continue;
        if (typeof v !== "string" || !HEX.test(v.trim())) add("error", k, `${lab}: "${v}" isn't a colour; use #rrggbb (e.g. #1a1a1c)`);
      } else if (t === "s") {
        const ok = x.map(o => o[0]).concat(EXTRA_OK[p.cat + "." + k] || []);
        if (!ok.includes(String(v))) { const g = didYouMean(v, ok); add("error", k, `${lab}: "${v}" isn't an option` + (g ? ` (did you mean "${g}"?)` : "") + `; options: ${ok.join(", ")}`); }
      } else if (t === "n") {
        const n = typeof v === "string" && v.trim() !== "" ? +v : v;
        if (typeof n !== "number" || !isFinite(n)) { add("error", k, `${lab}: "${v}" isn't a number`); continue; }
        if (typeof v === "string") add("warn", k, `${lab}: "${v}" is text; write it as a plain number`);
        const L = limitsOf(p.cat, f, flatOf(p));
        if (!L) { if (n < FREE.min || n > FREE.max) add("error", k, `${lab}: ${n} is far outside any sensible size`); continue; }
        if (L.zero && n === 0) continue;
        if (n < L.hardMin || n > L.hardMax) add("error", k, `${lab}: ${n}${x ? " " + x : ""} is outside ${L.hardMin}–${L.hardMax}${L.zero ? " (or 0)" : ""}`);
        else if (n < L.min || n > L.max) add("warn", k, `${lab}: ${n}${x ? " " + x : ""} is unusual (expected ${L.min}–${L.max}${L.zero ? " or 0" : ""})`);
        if (L.int && n !== Math.round(n)) add("warn", k, `${lab}: ${n} will be drawn as ${Math.round(n)} (whole numbers only)`);
      } else if (t === "t") {
        if (v !== null && typeof v === "object") add("error", k, `${lab}: should be text`);
        else if (k === "url" && v && !/^https?:\/\//i.test(String(v))) add("warn", k, `Product link should start with https://`);
        else if (x !== "info" && String(v).length > 40) add("warn", k, `${lab}: long text (${String(v).length} letters) may not fit on the part`);
      }
    }
    // a few checks across fields
    if (p.cat === "wheels" && +p.rimOuter > 0 && +p.rimInner > 0 && +p.rimOuter <= +p.rimInner) add("error", "rimOuter", "Rim outside width must be bigger than the inside width");
    if (p.cat === "fork" && p.type !== "rigid" && (("travel" in p && !(+p.travel > 0)) || ("a2c" in p && !(+p.a2c > 0)))) add("warn", "travel", "a suspension fork needs travel and axle-to-crown above 0 (or set Type: rigid)");
    if (p.cat === "tyres" && "width" in p && +p.width > 0 && +p.width < 23) add("warn", "width", "tyre width is in mm (2.4 in ≈ 61 mm)");
    return out;
  }
  // complete part with every value made safe to draw: numbers coerced and clamped, bad colours / options → default.
  // Never throws; extra (unknown) fields are kept as they are.
  function sanitize(cat, p) {
    if (!CATS[cat]) return null;
    const src = p && typeof p === "object" ? p : {}, o = { cat };
    for (const k of Object.keys(src)) if (k !== "cat") o[k] = src[k];
    o.cat = cat;
    for (const f of CATS[cat].fields) {
      const [k, , t, d, x] = f; let v = o[k];
      if (v === undefined || v === null) { o[k] = d; continue; }
      if (colourish(f)) {
        if (t === "t" && v === "") continue;
        o[k] = typeof v === "string" && HEX.test(v.trim()) ? normHex(v.trim()) : d;
      } else if (t === "s") {
        const ok = x.map(q => q[0]).concat(EXTRA_OK[cat + "." + k] || []); o[k] = ok.includes(String(v)) ? String(v) : d;
      } else if (t === "n") {
        v = typeof v === "string" && v.trim() !== "" ? +v : v;
        if (typeof v !== "number" || !isFinite(v)) { o[k] = d; continue; }
        const L = limitsOf(cat, f, o) || FREE;
        if (!(L.zero && v === 0)) v = Math.min(L.hardMax != null ? L.hardMax : L.max, Math.max(L.hardMin != null ? L.hardMin : L.min, v));
        if (L.int) v = Math.round(v);
        o[k] = v;
      } else if (t === "t") {
        o[k] = typeof v === "object" ? d : String(v).slice(0, x === "info" ? 2000 : 60);
      }
    }
    if (typeof o.name !== "string" || !o.name.trim()) o.name = typeof o.name === "number" ? String(o.name) : "My " + CATS[cat].label.toLowerCase();
    if (cat === "wheels" && o.rimOuter <= o.rimInner) o.rimOuter = o.rimInner + 5;
    return o;
  }

  // ---------------------------------------------------------------- generic parts that ship with the app
  const C = (id, cat, name, v) => ({ id, cat, name, builtIn: true, ...v });
  const CATALOG = [
    C("fox34sc120", "fork", "Fox 34 Step-Cast Factory 120 (black)", { travel: 120, a2c: 530, offset: 44, stanchion: 34, lower: 41, legSpacing: 140, stanchionFinish: "kashima", lowerColor: "#121214", lowerFinish: "gloss", crownColor: "#121214", crownFinish: "anodised", stepCast: "yes", brandText: "FOX", decalColor: "#f26b21", decalOutline: "#ffffff", modelText: "34", arch: "front" }),
    C("fox34_130", "fork", "Fox 34 Factory 130 (black)", { travel: 130, a2c: 551, offset: 44, stanchion: 34, lower: 42, legSpacing: 142, stanchionFinish: "kashima", lowerColor: "#121214", lowerFinish: "gloss", crownColor: "#121214", brandText: "FOX", decalColor: "#f26b21", decalOutline: "#ffffff", modelText: "34", arch: "front" }),
    C("sidUlt120", "fork", "RockShox SID Ultimate 120", { travel: 120, a2c: 529, offset: 44, stanchion: 35, lower: 42, legSpacing: 140, stanchionFinish: "black", lowerColor: "#0f0f11", lowerFinish: "gloss", crownColor: "#0f0f11", brandText: "SID", decalColor: "#ffffff", decalOutline: "#c8102e", modelText: "ULTIMATE", arch: "rear" }),
    C("sidUlt110", "fork", "RockShox SID Ultimate 110", { travel: 110, a2c: 519, offset: 44, stanchion: 35, lower: 42, legSpacing: 140, stanchionFinish: "black", lowerColor: "#0f0f11", lowerFinish: "gloss", crownColor: "#0f0f11", brandText: "SID", decalColor: "#ffffff", decalOutline: "#c8102e", modelText: "ULTIMATE", arch: "rear" }),
    C("sidSL100", "fork", "RockShox SID SL 100", { travel: 100, a2c: 503, offset: 44, stanchion: 32, lower: 39, legSpacing: 136, stanchionFinish: "black", lowerColor: "#0f0f11", lowerFinish: "gloss", crownColor: "#0f0f11", brandText: "SID SL", decalColor: "#ffffff", decalOutline: "", modelText: "", arch: "rear" }),
    C("pike130", "fork", "RockShox Pike 130", { travel: 130, a2c: 551, offset: 44, stanchion: 35, lower: 43, legSpacing: 144, stanchionFinish: "black", lowerColor: "#0f0f11", lowerFinish: "matte", crownColor: "#0f0f11", brandText: "PIKE", decalColor: "#ffffff", decalOutline: "#c8102e", modelText: "", arch: "rear" }),
    C("pike140", "fork", "RockShox Pike 140", { travel: 140, a2c: 561, offset: 44, stanchion: 35, lower: 43, legSpacing: 144, stanchionFinish: "black", lowerColor: "#0f0f11", lowerFinish: "matte", crownColor: "#0f0f11", brandText: "PIKE", decalColor: "#ffffff", decalOutline: "#c8102e", modelText: "", arch: "rear" }),
    // road / gravel carbon fork: legSpacing = blade centres at the dropout (100 mm hub + 12 mm of dropout)
    C("rigid", "fork", "Carbon gravel / road fork (12 x 100, flat mount)", { type: "rigid", style: "gravel", weave: "ud", travel: 0, a2c: 0, offset: 0, stanchion: 0, lower: 30, legSpacing: 112, lowerColor: "#121214", lowerFinish: "gloss", crownColor: "#121214", brandText: "", modelText: "" }),
    C("fork-canyon-endurace-al-blue", "fork", "Canyon Endurace AL Disc carbon fork (matte blue, 12 x 100)", { type: "rigid", style: "gravel", weave: "ud", travel: 0, a2c: 0, offset: 0, stanchion: 0, lower: 30, legSpacing: 112, lowerColor: "#4a86cc", lowerFinish: "matte", crownColor: "#4a86cc", brandText: "", modelText: "" }),
    // ---- gravel forks with published numbers. Each is built on the generic "rigid" base above (base: ...), so it only lists what's
    // different; a size variant is built on its model (e.g. the 52 mm Columbus on the 47 mm one).
    C("fork-enve-g-47", "fork", "ENVE G-Series gravel fork, 47 mm rake (50 mm tyres)", { base: "rigid", a2c: 395, offset: 47, clearance: 50, mounts: "fender", lowerFinish: "matte", crownFinish: "matte",
      brandText: "ENVE", bladeLogoColor: "#e8e8e8", brand: "ENVE", model: "G-Series Gravel Fork, 700c/650b, 12 x 100, flat mount",
      url: "https://worldwidecyclery.com/products/enve-g-series-gravel-fork-700c-650b-1-5-tapered-47mm-rake-12-x-100mm-black", notes: "395 a2c, 47 rake, 700 x 50 max, fender mounts, flat mount (retailer spec sheet). Blade shape is the generic carbon shape." }),
    C("fork-columbus-futura-cross-47", "fork", "Columbus Futura Cross carbon fork, 47 mm rake (47 mm tyres)", { base: "rigid", a2c: 395, offset: 47, clearance: 47, mounts: "fender", shoulders: "square", lowerFinish: "gloss",
      brandText: "COLUMBUS", bladeLogoColor: "#d8d8d8", brand: "Columbus", model: "Futura Cross, 12 mm thru-axle, flat mount (up to 180 mm rotor)",
      url: "https://metal-guru.com/products/futura-cross-fork", notes: "395 a2c; rake 47 or 52 with the Multi-Rake inserts; 700 x 47 max; mudguard eyelets (Metal-Guru spec). 56 mm crown, 515 g." }),
    C("fork-columbus-futura-cross-52", "fork", "Columbus Futura Cross carbon fork, 52 mm rake", { base: "fork-columbus-futura-cross-47", offset: 52, model: "Futura Cross, 52 mm rake insert" }),
    C("fork-salsa-waxwing", "fork", "Salsa Waxwing Carbon V2 fork (50 mm tyres, three-pack + low-rider + fender)", { base: "rigid", a2c: 405, offset: 50, clearance: 50, mounts: "all", lowerFinish: "gloss",
      brandText: "SALSA", bladeLogoColor: "#d8d8d8", brand: "Salsa", model: "Waxwing Carbon V2, 700c/650b, 12 x 100, flat mount 160",
      url: "https://worldwidecyclery.com/products/salsa-waxwing-carbon-v2-fork-700c-650b-100x12mm-thru-axle-1-1-8-tapered-carbon-flat-mount-disc-black", notes: "405 a2c, 50 offset, 700 x 50 / 650b x 56 max, three-pack, mid-blade low-rider and fender mounts (retailer spec sheet)." }),
    // titanium fork made with the frame: its axle-to-crown and offset are whatever goes on the frame drawing, so it is drawn to the analysis numbers
    // ---- A Ti builder's own fork options (typical quotes): carbon $160, 47 or 52 rake, 700 x 55 max; Ti $350, unicrown or segmented crown
    C("fork-builder-carbon-47", "fork", "Builder's carbon gravel fork, 47 mm rake (55 mm tyres)", { base: "rigid", offset: 47, clearance: 55, lowerFinish: "matte", crownFinish: "matte", brand: "Custom builder",
      model: "Carbon fork, tapered 1-1/8 to 1-1/2, 12 x 100, flat mount", notes: "Typical builder quote: $160, max 700C x 55, 47 or 52 mm rake (no 55). Axle-to-crown isn't published: ask your builder, then set it under Adjust sizes. Until then it's drawn to the analysis number." }),
    C("fork-builder-carbon-52", "fork", "Builder's carbon gravel fork, 52 mm rake (55 mm tyres)", { base: "fork-builder-carbon-47", offset: 52 }),
    C("fork-ti-frame", "fork", "Titanium fork built with the frame (raw, unicrown, three-pack + fender)", { type: "rigid", style: "ti", tiFinish: "brushed", travel: 0, a2c: 0, offset: 0, stanchion: 0, lower: 30, legSpacing: 112,
      mounts: "cargoFender", brandText: "", modelText: "", axleColor: "#141414", notes: "Ti forks are made to order with the frame: set axle-to-crown, offset and tyre clearance on the drawing (Adjust sizes / the analysis)." }),
    C("fork-ti-frame-plain", "fork", "Titanium fork built with the frame (raw, unicrown, no mounts)", { base: "fork-ti-frame", mounts: "none" }),
    C("fork-ti-frame-segmented", "fork", "Titanium fork built with the frame (raw, segmented crown, three-pack + fender)", { base: "fork-ti-frame", tiCrown: "segmented",
      notes: "Builders often offer a Ti fork ($350) with a unicrown or a segmented crown. Design it with the frame: it's longer than a carbon fork." }),
    C("fork-enve-adventure-49", "fork", "ENVE Adventure fork, 49 mm rake (398 a2c, three-pack + low-rider + fender)", { base: "rigid", a2c: 398, offset: 49, clearance: 53, mounts: "all", lowerFinish: "matte", crownFinish: "matte",
      brandText: "ENVE", bladeLogoColor: "#e8e8e8", brand: "ENVE", model: "Adventure Fork, 12 x 100, flat mount 140, reversible dropout chip",
      url: "https://worldwidecyclery.com/products/enve-composites-adventure-fork-1-5-tapered-flat-mount-disc-carbon-12-x-100mm-axle-49-55-rake-black",
      notes: "398 a2c with 49 rake, or 406 a2c with 55.5 rake (dropout chip); 53 mm tyres in the spec table (the text also says 700 x 50 and 29 x 2.3); three-pack (3 kg), rack + fender mounts, dynamo routing (retailer spec)." }),
    C("fork-enve-adventure-55", "fork", "ENVE Adventure fork, 55.5 mm rake (406 a2c)", { base: "fork-enve-adventure-49", a2c: 406, offset: 55.5 }),
    // gravel suspension forks (100 mm hub). Drawn with the suspension fork's post-mount tabs; the real forks are flat mount.
    C("fox32tc-gravel40", "fork", "Fox 32 Taper-Cast gravel fork, 40 mm, 45 offset", { type: "suspension", travel: 40, a2c: 435.5, offset: 45, stanchion: 32, lower: 38, legSpacing: 118, stanchionFinish: "kashima",
      lowerColor: "#121214", lowerFinish: "gloss", crownColor: "#121214", crownFinish: "anodised", stepCast: "no", brandText: "FOX", decalColor: "#f26b21", decalOutline: "#ffffff", modelText: "32", arch: "front",
      brand: "FOX", model: "32 Taper-Cast Gravel, 12 x 100 Kabolt, flat mount 160/180", url: "https://www.bikeradar.com/news/fox-32-tc-gravel-fork/",
      notes: "40 mm: 435.5 a2c; 50 mm: 445.5; offset 45 or 50; 700 x 50 max (BikeRadar). Lower-leg size assumed. Flat-mount brake drawn as post mount." }),
    C("fox32tc-gravel50", "fork", "Fox 32 Taper-Cast gravel fork, 50 mm, 50 offset", { base: "fox32tc-gravel40", travel: 50, a2c: 445.5, offset: 50 }),
    C("rudy-xplr40", "fork", "RockShox Rudy Ultimate XPLR, 40 mm, 45 offset", { type: "suspension", travel: 40, a2c: 435, offset: 45, stanchion: 30, lower: 37, legSpacing: 118, stanchionFinish: "black",
      lowerColor: "#0f0f11", lowerFinish: "gloss", crownColor: "#0f0f11", brandText: "RUDY", decalColor: "#ffffff", decalOutline: "", modelText: "ULTIMATE", arch: "rear",
      brand: "RockShox", model: "Rudy Ultimate XPLR Race Day 2, 700c, 12 x 100, flat mount",
      url: "https://www.modernbike.com/rockshox-rudy-ultimate-xplr-race-day-2-suspension-fork---700c-40-mm-12-x-100-mm-45-mm-offset-gloss-black-a2",
      notes: "40 mm travel, 435 a2c, 45 offset, 30 mm stanchions, 700 x 50 max (retailer spec). Lower-leg size assumed. Flat-mount brake drawn as post mount." }),
    C("fork-ritchey-wcs-adventure-29", "fork", "Ritchey WCS Carbon Adventure fork 29 (483 a2c, 50 offset, 15 x 110)", { base: "rigid-mtb", a2c: 483, offset: 50, mounts: "cargoFender", lowerFinish: "matte",
      brandText: "RITCHEY", bladeLogoColor: "#e8e8e8", brand: "Ritchey", model: "WCS Carbon Adventure, Boost 15 x 110, post mount 160 (180 max)", url: "https://theradavist.com/ritchey-wcs-carbon-adventure-fork",
      notes: "483 a2c, 50 offset, 29 x 2.4 max, three mounts per blade, rack/fender mounts, dynamo routing (The Radavist). Suspension-corrected for a 100 mm fork." }),
    C("rigid-mtb", "fork", "Rigid carbon MTB fork (suspension-corrected, 15 x 110)", { type: "rigid", style: "mtb", weave: "twill", travel: 0, a2c: 0, offset: 0, stanchion: 0, lower: 30, legSpacing: 128, lowerColor: "#121214", lowerFinish: "gloss", crownColor: "#121214", brandText: "", modelText: "" }),

    C("cr-gx", "crankset", "SRAM GX Eagle (aluminium, black)", { material: "alloy", color: "#141416", finish: "matte", logoText: "GX EAGLE", logoColor: "#bfc1c4" }),
    C("cr-xt", "crankset", "Shimano XT (grey)", { material: "alloy", color: "#5c5f66", finish: "anodised", logoText: "XT", logoColor: "#e6e6e6", bootColor: "#2a2b2e" }),
    C("ring-blk", "chainring", "Direct-mount chainring, black", { color: "#18181a" }),
    C("ring-xsync2-blk", "chainring", "SRAM X-Sync 2 direct-mount ring, black", { shape: "xsync2", mount: "sram3", profile: "nw", color: "#141416", finish: "anodised", logoText: "X-SYNC 2", logoColor: "#8c8d91", chainColor: "silver" }),
    // SRAM X-Sync 2 for DUB, 6 mm offset = 49 mm chainline on a 73 mm shell (non-Boost); the Boost ring is 3 mm offset = 52 mm
    C("ring-xsync2-32-49", "chainring", "SRAM X-Sync 2 DUB 32T, 6 mm offset (49 mm chainline), black", { teeth: 32, shape: "xsync2", mount: "sram3", profile: "nw", color: "#141416", finish: "anodised", logoText: "X-SYNC 2", logoColor: "#8c8d91", chainColor: "silver" }),
    C("ring-xsync2-gold", "chainring", "SRAM X-Sync 2 direct-mount ring, gold", { shape: "xsync2", mount: "sram3", profile: "nw", color: "#c9a24a", finish: "anodised", logoText: "X-SYNC 2", logoColor: "#6e5420", chainColor: "gold" }),
    C("ring-wolftooth", "chainring", "Wolf Tooth direct-mount ring (SRAM), black", { shape: "wolftooth", mount: "sram3", profile: "nw", color: "#141416", finish: "anodised", logoText: "WOLF TOOTH", logoColor: "#8c8d91" }),
    C("ring-raceface", "chainring", "Race Face Cinch narrow-wide ring, black", { shape: "raceface", mount: "cinch", profile: "nw", color: "#141416", finish: "anodised", accentColor: "#b8babd", logoText: "RACE FACE", logoColor: "#9a9ca0" }),
    C("ring-104bcd", "chainring", "104 BCD narrow-wide 4-bolt ring, black", { shape: "solid", mount: "bcd104", profile: "nw", color: "#141416", finish: "anodised", logoText: "" }),
    C("ss-silver", "rear", "Singlespeed cog, silver steel", { type: "singlespeed", color: "#c8cacc", spacerColor: "#1a1a1c" }),
    C("ss-stamped", "rear", "Stamped singlespeed cog (6 holes), silver", { type: "singlespeed", cogShape: "stamped", color: "#c8cacc", spacerColor: "#c8cacc", lockringColor: "#c8cacc" }),
    C("ss-alloy-blk", "rear", "Wide alloy singlespeed cog, black", { type: "singlespeed", cogShape: "alloy", color: "#1a1a1c", spacerColor: "#1a1a1c", lockringColor: "#1a1a1c" }),
    C("cs-eagle", "rear", "SRAM Eagle 12-speed cassette", { type: "sram12", color: "#c8cacc" }),
    C("cs-xt", "rear", "Shimano XT 12-speed cassette", { type: "shimano12", color: "#c8cacc" }),
    C("wh-road-alloy", "wheels", "Road aluminium wheels, 24 spokes (black)", { rimMaterial: "alloy", rimColor: "#111112", rimFinish: "anodised", rimInner: 21, rimOuter: 25, rimDepth: 24, spokes: 24 }),
    C("wh-alloy", "wheels", "Generic aluminium wheels, 28 spokes", { rimMaterial: "alloy", rimColor: "#111112", rimFinish: "anodised", rimInner: 30, rimOuter: 35, rimDepth: 24, spokes: 28 }),
    C("ty-trail24", "tyres", "Trail tyres 29 × 2.4", { width: 61, tread: "trail", sidewall: "black" }),
    C("ty-trail26", "tyres", "Trail tyres 29 × 2.6", { width: 66, tread: "trail", sidewall: "black" }),
    C("ty-xc24", "tyres", "XC tyres 29 × 2.4, tan wall", { width: 61, tread: "xc", sidewall: "tan" }),
    C("ty-gravel45", "tyres", "Gravel tyres 700 × 45", { width: 45, tread: "gravel", sidewall: "tan" }),
    // generic tyres for new bikes (the wheel size comes from the bike's geometry, so these fit any rim)
    C("ty-road-33", "tyres", "Road / light-gravel tyres 33 mm, black (Terreno Dry look)", { width: 33, tread: "gravel", sidewall: "black" }),
    C("ty-road-28", "tyres", "Road tyres 28 mm, black", { width: 28, tread: "gravel", sidewall: "black" }),
    C("ty-gravel-40", "tyres", "Gravel tyres 40 mm, black", { width: 40, tread: "gravel", sidewall: "black" }),
    C("ty-plus-50", "tyres", "Gravel / road-plus tyres 50 mm, black", { width: 50, tread: "gravel", sidewall: "black" }),
    C("ty-mtb-24", "tyres", "Trail tyres 2.4 in, black", { width: 61, tread: "trail", sidewall: "black" }),
    C("br-xt", "brakes", "Shimano XT 4-piston", { style: "shimano", bodyColor: "#5c5f66", rotorF: 180, rotorStyle: "shimano" }),
    C("br-sram", "brakes", "SRAM Maven / Code look", { style: "sram", bodyColor: "#141416", bladeColor: "#141416", rotorF: 200, rotorStyle: "sram" }),
    // Hope XCR Pro X2: one-piece CNC 2-piston caliper, radial lever with carbon blade, black hose; Hope floating rotors
    C("br-hope-xcr-x2", "brakes", "Hope XCR Pro X2 (black)", { style: "hope-x2", leverStyle: "hope-xcr", bodyColor: "#1a1a1c", finish: "anodised", bladeMaterial: "carbon", bladeColor: "#141416",
      logoText: "HOPE", logoColor: "#b9bbbf", hoseColor: "#151517", rotorF: 160, rotorStyle: "hope", rotorCarrier: "#1a1a1c" }),
    C("ck-trail", "cockpit", "50 mm stem, 760 mm riser bar", { barType: "flat", barWidth: 760, barRise: 20, backsweep: 8, upsweep: 5, stemLength: 50, stemRise: 0 }),
    C("ck-road", "cockpit", "100 mm stem, 420 mm road drop bar", { barType: "drop", barWidth: 420, stemLength: 100, stemRise: -6, barClamp: "31.8", stemShape: "xc" }),
    C("ck-road-120", "cockpit", "120 mm stem, 440 mm road drop bar (Canyon Endurace 2XL stock)", { barType: "drop", barWidth: 440, stemLength: 120, stemRise: -6, barClamp: "31.8", stemShape: "xc" }),
    C("ck-gravel", "cockpit", "80 mm stem, 440 mm drop bar", { barType: "drop", barWidth: 440, stemLength: 80, stemRise: -6, barClamp: "31.8", stemShape: "xc" }),
    C("ck-cnc-carbon", "cockpit", "40 mm CNC stem, 800 mm 35 mm carbon riser bar", { barType: "flat", barWidth: 800, barRise: 20, backsweep: 8, upsweep: 5, stemLength: 40, stemRise: 0, stemShape: "cnc", stemClampH: 40,
      barClamp: "35", barMaterial: "carbon", barFinish: "matte", barLogo: "CARBON 35", barLogoColor: "#9a9ca0", gripType: "lockon1", gripPattern: "waffle", topCap: "flat" }),
    C("ck-round-318", "cockpit", "50 mm rounded stem, 760 mm 31.8 alloy bar, 2-collar grips", { barType: "flat", barWidth: 760, barRise: 15, backsweep: 9, upsweep: 4, stemLength: 50, stemRise: 0, stemShape: "round",
      barClamp: "31.8", faceplate: "4", gripType: "lockon2", gripPattern: "diamond", topCap: "domed", stemFinish: "polished", stemColor: "#b9bbbf", boltColor: "#b9bbbf", spacerColor: "#141416" }),
    // ---- drop bars with published geometry, each built on the generic 80 mm stem / 440 drop bar (ck-gravel): only the bar differs.
    C("ck-road-compact", "cockpit", "Compact road bar 420 (75 reach / 125 drop / 3° flare), 100 mm stem", { base: "ck-gravel", barWidth: 420, stemLength: 100, dropReach: 75, dropDrop: 125, dropFlare: 3 }),
    C("ck-venturemax", "cockpit", "Ritchey VentureMax 440 (76 / 102, 24° flare, 6° flare-out, 6° sweep)", { base: "ck-gravel", barWidth: 440, widthAt: "hoods", dropReach: 76, dropDrop: 102, dropFlare: 24, dropFlareOut: 6, dropSweep: 6,
      barLogo: "RITCHEY", barLogoColor: "#d8d8d8", brand: "Ritchey", model: "RL1 / Comp / WCS VentureMax, 31.8", url: "https://www.sjscycles.co.uk/handlebars/ritchey-rl1-venturemax-handlebar-318mm-black-440mm/",
      notes: "76 reach, 102 drop, 24° drop flare, 6° flare-out, 6° backsweep; width measured at the first bend (retailer spec)." }),
    C("ck-cowchipper", "cockpit", "Salsa Cowchipper 460 (68 / 116, 24° flare)", { base: "ck-gravel", barWidth: 460, widthAt: "hoods", dropReach: 68, dropDrop: 116, dropFlare: 24,
      barLogo: "SALSA", barLogoColor: "#d8d8d8", brand: "Salsa", model: "Cowchipper (alloy / carbon / Deluxe), 31.8", url: "https://www.road.cc/content/review/salsa-cowchipper-drop-bar-283319",
      notes: "68 reach, 116 drop, 12° drop angle, 24° flare; road.cc says width is measured centre to centre where the levers clamp." }),
    C("ck-zipp-xplr70", "cockpit", "Zipp Service Course 70 XPLR 440 (70 / 115, 11° flare, 5° flare-out, 3° sweep)", { base: "ck-gravel", barWidth: 440, dropReach: 70, dropDrop: 115, dropFlare: 11, dropFlareOut: 5, dropSweep: 3,
      barLogo: "ZIPP", barLogoColor: "#d8d8d8", brand: "Zipp", model: "Service Course 70 XPLR, 31.8", url: "https://bikepacking.com/gear/zipp-service-course-70-xplr-handlebar/",
      notes: "Zipp: 70 reach, 115 drop, 5° flare (whole drop rotated out = flare-out here) and 11° outsweep below the lever (= drop flare here), 3° backsweep on the tops." }),
    C("ck-easton-ec70ax", "cockpit", "Easton EC70 AX carbon 440 (80 / 120, 16° flare)", { base: "ck-gravel", barWidth: 440, widthAt: "hoods", dropReach: 80, dropDrop: 120, dropFlare: 16, barMaterial: "carbonUD", barFinish: "matte",
      barLogo: "EASTON", barLogoColor: "#d8d8d8", brand: "Easton", model: "EC70 AX, 31.8", url: "https://eastoncycling.com/products/ec70-ax-bar",
      notes: "80 reach, 120 drop, 16° flare; width c-c at the hoods, drops 68 mm wider (Easton)." }),
    C("ck-enve-g", "cockpit", "ENVE G-Series gravel bar 440 (80 / 120, 12° flare)", { base: "ck-gravel", barWidth: 440, widthAt: "hoods", dropReach: 80, dropDrop: 120, dropFlare: 12, barMaterial: "carbonUD", barFinish: "matte",
      barLogo: "ENVE", barLogoColor: "#d8d8d8", brand: "ENVE", model: "G-Series Gravel Handlebar, 31.8",
      url: "https://www.bikeradar.com/reviews/components/handlebars-and-stems/handlebars/handlebars-road/enve-g-series-gravel-handlebar-review/",
      notes: "80 reach, 120 drop, width across the tops (BikeRadar); 12° flare from retailer listings. BikeRadar measured a 44 cm bar at 56 cm across the drop ends, so the real flare may be more." }),
    C("ck-butano", "cockpit", "Ritchey WCS Butano 440 (73 / 115, 18° flare, 5° sweep)", { base: "ck-gravel", barWidth: 440, dropReach: 73, dropDrop: 115, dropFlare: 18, dropSweep: 5,
      barLogo: "RITCHEY", barLogoColor: "#d8d8d8", brand: "Ritchey", model: "WCS Butano (internal routing), 31.8", url: "https://dismountbikeshop.com/products/ritchey-wcs-butano-bar",
      notes: "73 reach, 115 drop, 18° flare, 5° backsweep (shop spec; it also lists '18° flare out', not drawn)." }),
    C("ck-redshift-kitchen-sink", "cockpit", "Redshift Kitchen Sink 470 (68 / 110, 25° flare, 7° sweep, 20 rise)", { base: "ck-gravel", barWidth: 470, dropReach: 68, dropDrop: 110, dropFlare: 25, dropSweep: 7, dropRise: 20,
      barLogo: "REDSHIFT", barLogoColor: "#d8d8d8", brand: "Redshift", model: "Kitchen Sink, 31.8 (loop sold separately)", url: "https://www.sjscycles.co.uk/handlebars/redshift-kitchen-sink-handlebar-318mm-black-470mm",
      notes: "68 reach, 110 drop, 25° flare, 7° sweep, 20 mm rise (SJS Cycles; the 44 cm lists 70 reach). The optional loop isn't drawn." }),
    C("ck-salsa-woodchipper", "cockpit", "Salsa Woodchipper 440 (56 / 114, 25° flare)", { base: "ck-gravel", barWidth: 440, widthAt: "drops", dropReach: 56, dropDrop: 114, dropFlare: 25,
      barLogo: "SALSA", barLogoColor: "#d8d8d8", brand: "Salsa", model: "Woodchipper, 31.8", url: "https://www.cahabacycles.com/products/salsa-woodchipper-drop-handlebar-aluminum-31-8mm-44cm-black",
      notes: "56 reach, 114 drop, 25° flare, 38° drop angle (the drops' own tilt, not drawn). The shop says width is 'measured at center'; drawn as measured at the drops, so the hoods sit narrower. Check yours." }),
    C("ck-pnw-coast", "cockpit", "PNW Coast 480 (65 / 105, 20° flare)", { base: "ck-gravel", barWidth: 480, widthAt: "hoods", dropReach: 65, dropDrop: 105, dropFlare: 20,
      barLogo: "PNW", barLogoColor: "#d8d8d8", brand: "PNW Components", model: "Coast, 31.8 (480 / 520)", url: "https://road.cc/review/pnw-components-coast-handlebar-280457",
      notes: "65 reach, 105 drop, 20° flare (about 40 mm wider each side at the drops); width hood to hood (road.cc)." }),
    C("ck-curve-walmer", "cockpit", "Curve Walmer 460 (65 / 110, 29° flare, 7° sweep)", { base: "ck-gravel", barWidth: 460, widthAt: "hoods", dropReach: 65, dropDrop: 110, dropFlare: 29, dropSweep: 7,
      barLogo: "CURVE", barLogoColor: "#d8d8d8", brand: "Curve", model: "Walmer, 31.8 (40–60 cm at the hoods)", url: "https://www.curvecycling.com/products/walmer-bars",
      notes: "65 reach (60 on 55/60 cm), 110 drop, 29° flare, 7° sweep; 460 at the hoods, 610 across the drops (Curve)." }),
    C("ck-gravel-highrise", "cockpit", "80 mm +30° high-rise stem, 440 mm drop bar", { base: "ck-gravel", stemRise: 30,
      notes: "A high-rise stem (e.g. Redshift ShockStop +30°, 80 / 100 mm, 40 mm stack) lifts the bar without a long stack of spacers." }),
    // ---- MTB bars + stems
    C("ck-raceface-next-r35", "cockpit", "Race Face Next R 35 carbon 800 / 20 rise, 40 mm stem", { base: "ck-cnc-carbon", barWidth: 800, barRise: 20, backsweep: 8, upsweep: 5, barMaterial: "carbonUD", barFinish: "matte",
      barLogo: "RACEFACE", barLogoColor: "#d8d8d8", brand: "Race Face", model: "Next R 35 (10 / 20 / 35 rise), 8° back, 5° up", url: "https://dismountbikeshop.com/products/raceface-next-r-35-handlebar",
      notes: "10 / 20 / 35 rise, 8° backsweep, 5° upsweep, 800 mm, UD carbon matte (shop spec)." }),
    C("ck-jones-sg-loop-710", "cockpit", "Jones SG 2.5 Loop H-Bar 710 (45° sweep, 63 rise)", { base: "ck-trail", barWidth: 710, barRise: 63, backsweep: 45, upsweep: 0, stemLength: 60, barClamp: "31.8",
      barLogo: "JONES", barLogoColor: "#d8d8d8", brand: "Jones", model: "H-Bar SG 2.5 Loop, aluminium, 31.8", url: "https://dismountbikeshop.com/products/jones-sg-25-aluminum-riser-loop-h-bar",
      notes: "45° sweep, 2.5 in (63.5 mm) rise, 660 / 710 mm (shop spec). Drawn as a swept riser bar: the front loop isn't drawn." }),
    C("ck-oneup-carbon35", "cockpit", "OneUp 35 mm stem 50, OneUp carbon bar 800 / 20 rise", { base: "ck-cnc-carbon", barWidth: 800, barRise: 20, backsweep: 8, upsweep: 5, stemLength: 50, barClamp: "35",
      barLogo: "ONEUP", barLogoColor: "#d8d8d8", stemLogo: "ONEUP", brand: "OneUp", model: "Carbon handlebar 35 (20 / 35 rise), 8° back, 5° up", notes: "Rise 20 or 35, 8° backsweep, 5° upsweep, 800 mm (OneUp)." }),
    C("ck-oneup-carbon35-r35", "cockpit", "OneUp carbon bar 800 / 35 rise, 50 mm stem", { base: "ck-oneup-carbon35", barRise: 35 }),
    C("ck-renthal-apex-fatbar35", "cockpit", "Renthal Apex 35 stem 50, Fatbar 35 alloy 800 / 20 rise", { base: "ck-trail", barWidth: 800, barRise: 20, backsweep: 7, upsweep: 5, stemLength: 50, stemShape: "apex", barClamp: "35",
      barLogo: "RENTHAL", barLogoColor: "#d8d8d8", stemLogo: "RENTHAL", brand: "Renthal", model: "Apex 35 stem + Fatbar 35 (10 / 20 / 30 / 40 rise), 7° back, 5° up", notes: "Fatbar 35: 7° backsweep, 5° upsweep, 800 mm (Renthal)." }),
    C("ck-sqlab-30x-16", "cockpit", "SQlab 30X 16° bar 780 / 15 rise, 50 mm stem", { base: "ck-trail", barWidth: 780, barRise: 15, backsweep: 16, upsweep: 4, stemLength: 50, barClamp: "31.8",
      barLogo: "SQLAB", barLogoColor: "#d8d8d8", brand: "SQlab", model: "30X 16° (also 7 / 9 / 12°; rise 15 / 30 / 45)", url: "https://www.bikeperfect.com/reviews/sqlab-30x-16-degree-handlebar-review",
      notes: "16° backsweep, 4° upsweep, 15 / 30 / 45 rise, 780 mm, 31.8 clamp (Bike Perfect)." }),
    C("oneup150", "seatpost", "OneUp V3 dropper 150", { type: "dropper", travel: 150 }),
    C("oneup180", "seatpost", "OneUp V3 dropper 180", { type: "dropper", travel: 180 }),
    C("oneup210", "seatpost", "OneUp V3 dropper 210", { type: "dropper", travel: 210 }),
    C("post-rigid", "seatpost", "Rigid seatpost", { type: "rigid", travel: 0 }),
    C("sa-short", "saddle", "Short-nose MTB saddle", { shape: "shortNose" }),
    C("sa-classic", "saddle", "Classic long-nose saddle", { shape: "classic" }),
    C("pe-flat", "pedals", "Flat pedals, black", { type: "flat" }),
    C("pe-clip", "pedals", "Trail clip-in pedals", { type: "clip" })
  ];

  // ---------------------------------------------------------------- storage
  const load = () => { try { const v = JSON.parse(localStorage.getItem(STORE) || "[]"); return Array.isArray(v) ? v.filter(p => p && p.id && CATS[p.cat]) : []; } catch (e) { return []; } };
  const save = list => { try { localStorage.setItem(STORE, JSON.stringify(list)); return true; } catch (e) { return false; } };
  const fileParts = () => (Array.isArray(root.MY_PARTS) ? root.MY_PARTS : []).filter(p => p && p.id && CATS[p.cat]).map(p => ({ ...p, fromFile: true }));
  // newest wins: browser edits of a file part (same id) replace it. Entries are the raw parts (as typed);
  // get() / complete() hand out safe copies.
  function all() {
    const out = new Map();
    for (const p of CATALOG) out.set(p.id, p);
    for (const p of fileParts()) out.set(p.id, p);
    for (const p of load()) out.set(p.id, { ...p, inBrowser: true, fromFile: fileParts().some(f => f.id === p.id) });
    warnOnce();
    return [...out.values()];
  }
  const byCat = cat => all().filter(p => p.cat === cat);
  // renamed parts: old id → new id (saved bikes keep working)
  const RENAMED = {};
  const raw = id => all().find(p => p.id === id) || (RENAMED[id] ? all().find(p => p.id === RENAMED[id]) : null) || null;
  const rawOnly = raw;
  // the chain of base parts under p: { ids: [p.id, base, base's base, ...], parts, loop }
  function baseChain(p) {
    const ids = [p.id], parts = [], seen = new Set([p.id]); let q = p, loop = false;
    while (q && typeof q.base === "string" && q.base) {
      if (seen.has(q.base)) { loop = true; ids.push(q.base); break; }
      const b = raw(q.base); if (!b || b.cat !== p.cat) break;
      seen.add(b.id); ids.push(b.id); parts.push(b); q = b;
    }
    return { ids, parts, loop };
  }
  // p with every value its base parts give it (the part's own values win). Bookkeeping and the base's name / id aren't inherited.
  const NOT_INHERITED = ["id", "name", "base", "builtIn", "fromFile", "inBrowser", "src", "missing", "preview", "adjusted"];
  function flatten(p) {
    if (!p || !p.base) return p;
    const out = {}, chain = baseChain(p).parts.reverse();
    for (const b of chain) for (const k of Object.keys(b)) if (!NOT_INHERITED.includes(k)) out[k] = b[k];
    for (const k of Object.keys(p)) out[k] = p[k];
    return out;
  }
  const get = id => { const p = raw(id); return p ? sanitize(p.cat, flatten(p)) : null; };
  // the same part straight from my_parts.js (ignoring any copy saved in this browser)
  const fileVersion = id => fileParts().find(p => p.id === id) || null;
  const strip = p => { const o = {}; for (const k of Object.keys(p || {})) if (!["builtIn", "fromFile", "inBrowser", "src", "missing", "preview"].includes(k)) o[k] = p[k]; return o; };
  function upsert(part) { const list = load().filter(p => p.id !== part.id); list.push(strip(part)); return save(list); }
  function remove(id) { return save(load().filter(p => p.id !== id)); }
  function newId(cat) { return "my-" + cat + "-" + Date.now().toString(36); }
  // a complete part: every schema field filled in, every value safe to draw (see sanitize)
  function complete(cat, p) { return sanitize(cat, flatten(p)) || { cat }; }
  // the part's value for each field before this bike's adjustments, and the adjustments that apply
  function adjOf(design, cat) {
    const a = design && design.parts && design.parts.adj && design.parts.adj[cat], keys = ADJUST[cat] || [], out = {};
    if (!a || typeof a !== "object") return out;
    for (const k of keys) if (a[k] !== undefined && a[k] !== null && a[k] !== "") out[k] = a[k];
    return out;
  }

  // ---------------------------------------------------------------- id clashes between the three sources
  // conflicts() → [{ id, level, msg }]
  function conflicts() {
    const out = [], cat = new Map(CATALOG.map(p => [p.id, p])), file = Array.isArray(root.MY_PARTS) ? root.MY_PARTS.filter(p => p && typeof p === "object") : [], br = load(), seen = new Map();
    for (const p of file) {
      if (!p.id) continue;
      if (seen.has(p.id)) out.push({ id: p.id, level: "error", msg: `my_parts.js has two parts with id "${p.id}"; only the last one is used` });
      seen.set(p.id, p);
      const c = cat.get(p.id); if (c) out.push({ id: p.id, level: "warn", msg: `my_parts.js part "${p.id}" has the same id as the catalogue part "${c.name}" and replaces it` + (c.cat !== p.cat ? ` (and it's a different category: ${c.cat} vs ${p.cat})` : "") });
    }
    for (const p of br) {
      const f = seen.get(p.id), c = cat.get(p.id);
      if (f) out.push({ id: p.id, level: "warn", shadow: true, msg: `This browser has its own edited copy of "${f.name || p.id}" from my_parts.js; the file version is hidden until you reset it` + (f.cat !== p.cat ? ` (different category: ${f.cat} vs ${p.cat})` : "") });
      else if (c && c.cat !== p.cat) out.push({ id: p.id, level: "error", msg: `"${p.id}" is used by a catalogue ${c.cat} part and a ${p.cat} part saved in this browser` });
    }
    return out;
  }
  // everything wrong with one library part (its values + id clashes)
  function problems(id) { const p = raw(id); return p ? validate(strip(p)).concat(conflicts().filter(c => c.id === id).map(c => ({ level: c.level, field: "id", msg: c.msg, shadow: c.shadow }))) : []; }
  // every part with problems: [{ id, name, src, problems }]
  function report() {
    const out = [];
    for (const p of all()) { const pr = problems(p.id); if (pr.length) out.push({ id: p.id, name: p.name, src: p.inBrowser ? "browser" : p.fromFile ? "my_parts.js" : "catalogue", problems: pr }); }
    for (const p of Array.isArray(root.MY_PARTS) ? root.MY_PARTS : []) if (!p || !p.id || !CATS[p.cat]) out.push({ id: p && p.id || "?", name: p && p.name || "", src: "my_parts.js", problems: validate(p).filter(x => x.level === "error").concat(p && p.id ? [] : [{ level: "error", field: "id", msg: "missing id" }]) });
    return out;
  }
  let warned = false;
  function warnOnce() {
    if (warned || typeof window === "undefined" || !root.console) return; warned = true;
    try { for (const r of report()) for (const q of r.problems) if (!q.shadow) console.warn(`Cyclic Labs part "${r.id}" (${r.src}): ${q.msg}`); } catch (e) {}
  }

  // ---------------------------------------------------------------- live preview while a part is being edited
  // setPreview(part) → resolve() shows that part for its category on every bike until setPreview(null).
  let PREVIEW = null;
  function setPreview(p) { PREVIEW = p && CATS[p.cat] ? p : null; }

  // ---------------------------------------------------------------- what a bike shows
  // Each category: the selected library part, or one built from the bike's older settings (designs saved before the library).
  function legacy(cat, o) {
    const FP = root.FrameParts || {};
    switch (cat) {
      case "fork": return get(o.fork) || get("sidUlt120");
      case "crankset": return { ...(o.groupset === "shimanoXT" ? get("cr-xt") : get("cr-gx")), length: o.crankLen === "auto" || o.crankLen == null ? 0 : +o.crankLen };
      case "chainring": return get("ring-blk");
      case "rear": return o.groupset === "sramEagle" ? get("cs-eagle") : o.groupset === "shimanoXT" ? get("cs-xt") : { ...get("ss-silver"), type: o.groupset === "singlespeed" ? "singlespeed" : "auto" };
      case "wheels": return { ...get("wh-alloy"), rimDepth: +o.rimDepth || 24, spokes: +o.spokes || 28 };
      case "tyres": return { ...get("ty-trail24"), width: +o.tyreWidth || 61, tread: +o.tyreWidth < 50 ? "gravel" : "trail", sidewall: o.tyreSide === "tan" ? "tan" : "black" };
      case "brakes": return { ...(o.brakes === "sram" ? get("br-sram") : get("br-xt")), rotorF: +o.rotorF || 180 };
      case "cockpit": return { id: "", cat, name: "This bike's numbers", barType: o.barType, barWidth: +o.barWidth, barRise: +o.barRise, backsweep: +o.backsweep, upsweep: o.upsweep == null ? 5 : +o.upsweep, stemLength: +o.stemLength, stemRise: +o.stemRise };
      case "seatpost": { const d = (FP.DROPPERS || {})[o.dropper] || { travel: 150, stack: 30, collar: 12, stanchion: 26 }; return { id: "", cat, name: d.label || "Dropper", type: d.travel > 0 ? "dropper" : "rigid", travel: d.travel, stack: d.stack, collar: d.collar, stanchion: d.stanchion || 26 }; }
      case "saddle": return { ...get("sa-short"), shape: o.saddle || "shortNose" };
      case "pedals": return { ...get("pe-flat"), type: o.pedals === "clip" ? "clip" : "flat" };
    }
    return null;
  }
  // design → { cat: complete part } (+ .src: "library" | "standard")
  function resolve(design) {
    const FP = root.FrameParts || {}, o = Object.assign({}, FP.DEFAULTS || {}, (design && design.parts) || {}), sel = o.sel || {};
    const out = {};
    for (const cat of ORDER) {
      const pv = PREVIEW && PREVIEW.cat === cat ? PREVIEW : null;
      const picked = pv || (sel[cat] ? get(sel[cat]) : null);
      // the bike's own cockpit numbers (no part picked) are already per bike; adjustments only add what those don't cover
      const base = picked || legacy(cat, o), adj = adjOf(design, cat);
      if (cat === "cockpit" && !picked && !pv) for (const k of LEGACY_CK) delete adj[k];
      const keys = Object.keys(adj);
      out[cat] = complete(cat, keys.length ? Object.assign({}, base, adj) : base); out[cat].src = pv ? "preview" : picked ? "library" : "standard";
      if (keys.length) out[cat].adjusted = keys;
      if (sel[cat] && !picked) out[cat].missing = sel[cat];
    }
    return out;
  }

  // ---------------------------------------------------------------- making a part match the real thing
  // What to look up on the product page / photo, per category (the full version is in PARTS_GUIDE.md).
  const CHECKLIST = {
    fork: ["Rigid forks: axle-to-crown, rake / offset, widest tyre, mounts (three-pack, low-rider, fender), blade logo", "Travel, axle-to-crown and offset (spec table)", "Stanchion size and colour (Kashima gold, black, silver)", "Lowers + crown colour and finish (gloss, matte, wet-look)", "Logo text, colour and outline on the lowers; logo layout (both legs, or big number split across the legs); arch in front (Fox) or behind (RockShox)", "Step-Cast or not; axle colour"],
    crankset: ["Arm length you ride (mm)", "Carbon or aluminium; arm colour + finish", "Logo text and colour on the arm", "Colour of the arm-end boots"],
    chainring: ["Teeth", "Colour and finish", "Mounting: SRAM 3-bolt / Shimano / Race Face Cinch direct mount, or 104 BCD", "Web shape (windows / arms) and machined-chamfer colour", "Narrow-wide or standard teeth", "Engraved text and its colour", "Chain colour"],
    rear: ["Singlespeed cog or cassette (which brand)", "Cog teeth", "Cog shape (wide steel base, stamped with holes, wide alloy)", "Cog, spacer and lockring colours", "Text printed on the cog"],
    wheels: ["Rim inside width, outside width and depth (mm)", "Carbon or aluminium; rim colour + finish", "Spoke count and colour", "Hub flange + barrel colour and hub text", "Big rim logo text + colour (tone-on-tone?)", "Model text, accent text (colours), box logo"],
    tyres: ["Width in mm (2.4 in ≈ 61 mm, 2.6 in ≈ 66 mm)", "Tread family: fast XC, trail or gravel", "Sidewall: black or tan/skinwall", "Sidewall text and its colour"],
    brakes: ["Caliper shape (Shimano, SRAM, Hope X2) and lever shape", "Caliper / lever colour, finish, logo", "Lever blade material and colour; hose colour", "Rotor size and look (2-piece, one-piece, floating carrier colour)"],
    cockpit: ["Stem length, rise (degrees), steerer-clamp height, body shape, 2- or 4-bolt faceplate", "Stem colour, finish, logo; bolt colour", "Spacer stack (mm) + colour; headset top style + colour; top cap style + colour",
      "Bar width, rise, backsweep, upsweep, clamp diameter (31.8 / 35)", "Spacers under and on top of the stem (Adjust sizes for this bike)", "Drop bars: reach, drop, flare, flare-out, tops backsweep / rise, and where the width is measured (hoods or drops)", "Bar material, colour, logo text, centre graphic band", "Grips: lock-on (1 or 2 collars) or push-on, length, pattern, colours", "Lever position on the bar; hose routing (external / internal)"],
    seatpost: ["Dropper or rigid; travel", "Collar height and collar-to-rails height", "Stanchion diameter and colour; body colour", "Head style (bolts), collar colour, logo on the outer tube"],
    saddle: ["Shape and length x width (mm)", "Padded cover or 3D-printed lattice; shell colour", "Rails: round metal or oval carbon; rail colour", "Text on the back"],
    pedals: ["Flat, clip-in or Crankbrothers Candy", "Body colour", "Pin / mechanism / wing colour", "Spring and end-cap colours (Candy)"]
  };
  // Close-ups that show each category best: [focus target, view, zoom]. Targets are FrameBike3D.focus() names;
  // views (null = the target's usual angle): "side" (drive side), "nds" (other side), "three", "ds3q", "nds3q", "front", "front3q",
  // "rear", "top", "lever", "stemtop" — see FOCUS_VIEWS in bike3d.js. Used by the
  // library editor (live preview) and tests/parttest.js.
  const SHOTS = {
    fork: [["fork", "front3q", 2.4], ["fork", "nds", 2.2]],
    crankset: [["crank", "ds3q", 3], ["crank", "nds3q", 3]],
    chainring: [["chainring", "side", 4], ["chainring", "ds3q", 3.4]],
    rear: [["rear", "ds3q", 3], ["rear", "side", 3.4]],
    wheels: [["front", "side", 1.3], ["hubR", "side", 4], ["hubF", "nds", 4]],
    tyres: [["front", "side", 1.4], ["front", "front3q", 2.2]],
    brakes: [["caliperF", "nds", 6], ["caliperR", "nds", 6.5], ["lever", "lever", 7]],
    cockpit: [["cockpit", null, 3.4], ["stem", "stemtop", 5], ["bar", "front", 2.6]],
    seatpost: [["saddle", "side", 2.2], ["saddle", "nds3q", 2.4]],
    saddle: [["saddle", "three", 3.2], ["saddle", "top", 3]],
    pedals: [["pedal", "ds3q", 5], ["pedal", "side", 5]]
  };
  // text to paste to Claude: the part as data + its link + what to do
  function requestText(p) {
    const C = CATS[p && p.cat] || { label: "part" }, part = strip(p), pr = validate(part);
    const url = part.url || "(paste the product link here)";
    return `Cyclic Labs: please make this ${C.label.toLowerCase()} match the real product exactly (follow PARTS_GUIDE.md).\n` +
      `Product link: ${url}\n` + (part.base ? `Built on the base part "${part.base}" (only the differences are stored).\n` : "") +
      `Make this match the product photo exactly: sizes, colours, finish, logos. Save it in my_parts.js with the same id, check it with tests/parttest.js, and tell me anything the 3D model can't show yet.\n` +
      (pr.length ? `Problems the app found:\n${pr.map(q => "- " + q.msg).join("\n")}\n` : "") +
      `Part as it is now:\n${JSON.stringify(part, null, 2)}\n`;
  }

  root.FramePartLib = { CATS, ORDER, CATALOG, INFO_KEYS, LIMITS, CHECKLIST, SHOTS, ADJUST, all, byCat, get, raw, fileVersion, upsert, remove, newId, complete, sanitize, validate, limitsOf, didYouMean,
    flatten, baseChain, adjOf, LEGACY_CK,
    conflicts, problems, report, setPreview, get preview() { return PREVIEW; }, requestText, resolve, load, save, STORE };
})(typeof window !== "undefined" ? window : globalThis);
