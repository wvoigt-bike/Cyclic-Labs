// ============================================================================
//  DESIGN CHAT PHRASEBOOK, PART 4 (chatextra.js) — offline, no AI model
//  Load after chat.js, chatplus.js, chatmore.js and chatjourney.js. It closes the
//  gaps found by probing hundreds more everyday phrasings (v10.6):
//   • tidy-up before reading   "reach=460 stack=640 ha=65.5", "reach460", "headangle 65",
//                              "chainstay 17.2 in", "saddle height 0.75 m", "200 kpa",
//                              "12st 6lb", "reach + 5mm", "more like 460", "top tube 35 by 0.9",
//                              "chainstays down 5", "no, 442", "can I make the reach 460?"
//   • guards against wrong edits "top tube 580" (= effective top tube, not a 580 mm tube),
//                              "is 460 reach too long?" (advice, nothing changed),
//                              "make the top tube oval", "I'm a heavy rider", "load the gravel bike"
//   • parts by name / kind     "use a Fox 32 fork", "swap to drop bars", "flat bars", "remove the dropper"
//   • results in words         "is it too heavy", "what's the weakest point", "what fails",
//                              "how stiff / comfortable is it"
//   • typical ranges           "what's a good head angle for gravel", "typical chainstay for a
//                              hardtail", "sanity check my geometry", "is my geometry normal"
//   • conversation             "same for stack", "that's wrong", "what was it before", "why did the
//                              trail change", "how do I change the reach", "ok", "nope", "huh"
//   • journey & your builder         "mark step 2 done", "I'm done with the checks", "tick all the checks",
//                              "copy the request", "start from a bike I like", timeline, warranty,
//                              paint, couplers / belt / gearbox, contact, what to send, customs …
//   • fallback                 anything still not understood gets suggestions on the same topic
//                              instead of a bare "I'm not sure".
//  Design edits still go through chat.js apply() (validated, reported old → new, undoable).
// ============================================================================
(function (root) {
  "use strict";
  // Saved-bike deletes from the chat. Built-in examples can't be deleted; every delete can be undone ("undo delete").
  function deleteBikeChat(t, raw0, ctx) {
    const App = ctx && ctx.App, Jn = root.FrameJourney;
    if (!App || !App.deleteBikes) return null;
    const openList = () => { try { if (Jn) Jn.open("w-bikes"); } catch (e) {} };
    const undoTip = "_Changed your mind? Say `undo delete` (or press **Undo** in Your bikes)._";
    if (/^(undo|undo the|undo that|reverse( the)?) delet(e|ion)$|^undelete( (it|that|the bikes?|the designs?))?$|^(bring|put) (it|that|them|the bikes?|the designs?|my bikes?) back$|^restore (the |my )?(deleted )?(bikes?|designs?)$/.test(t)) {
      if (!App.canUndoDelete()) return "There's nothing to bring back: no bike has been deleted since Cyclic Labs was opened.";
      const n = App.undoDelete(); return n === 1 ? "Brought it back. It's in **Your bikes** again." : `Brought back **${n} bikes**.`;
    }
    if (!/^(delete|remove|trash|bin|get rid of|erase|scrap)\b/.test(t)) return null;
    const list = App.savedList();
    // "delete my bikes" / "delete some designs" / "how do I delete a bike": open the list with the Delete buttons
    if (/^(delete|remove|trash|bin|get rid of|erase|scrap) (some |a |my |old |the |all )*(old |saved |other |extra )?(bikes|designs|variants|bike|design|variant|saved designs|saved bikes)$/.test(t) && !/^\w+( the| my| that)? (bike|design|variant)$/.test(t.replace(/^get rid of/, "x"))) {
      openList();
      return list.length ? "Opened **Your bikes**. Under **Saved bikes** each bike has a **Delete** button (click it twice), or tick several and press **Delete ticked**. Or tell me which one: `delete bike <name>`." : "You don't have any saved bikes yet, so there's nothing to delete. The built-in examples can't be deleted.";
    }
    // "delete this bike" = the one that's open now
    if (/^(delete|remove|trash|bin|get rid of|erase|scrap)( the| this| that| my)? (current |open )?(variant|design|bike|saved design)( (that'?s|i have) open| i'?m on)?$/.test(t)) {
      const cur = App.currentId(), s = list.find(x => x.id === cur);
      if (!s) return "The bike that's open now is a **built-in example**, so it can't be deleted. To delete one of your own, say `delete bike <name>` or open **Your bikes**.";
      const r = App.deleteBikes([s.id]);
      return `Deleted **${s.name}**${r.ok ? "" : " (this browser wouldn't save the change, so it may come back after a reload)"}. The first example is open now.\n${undoTip}`;
    }
    // "delete bike Gravel V2" / "delete the design called old hardtail" / "delete Gravel V2"
    const m = raw0.match(/^\s*(?:delete|remove|trash|bin|get rid of|erase|scrap)\s+(?:the\s+|my\s+)?(?:saved\s+)?(?:bike|design|variant)?\s*(?:called|named)?\s*["“']?(.+?)["”']?\s*$/i);
    if (!m || !m[1]) return null;
    const want = m[1].trim().toLowerCase();
    if (!want) return null;
    const named = /^\s*(?:delete|remove|trash|bin|get rid of|erase|scrap)\s+(?:the\s+|my\s+)?(?:saved\s+)?(?:bike|design|variant)\b/i.test(raw0);
    // without the word bike/design, only an exact name counts ("remove dropper" must never hit a bike called "… dropper")
    const exact = list.filter(x => x.name.trim().toLowerCase() === want);
    const hits = exact.length ? exact : named ? list.filter(x => x.name.toLowerCase().includes(want)) : [];
    if (!hits.length) {
      if (!named) return null;   // e.g. "remove the dropper": not about bikes, let the other handlers have it
      openList();
      return `I couldn't find a saved bike called “${m[1].trim()}”. Your saved bikes are listed in **Your bikes** (opened). The built-in examples can't be deleted.`;
    }
    if (hits.length > 1) { openList(); return `More than one saved bike matches “${m[1].trim()}”: ${hits.map(x => `**${x.name}**`).join(", ")}. Say the full name, or use the **Delete** buttons in **Your bikes** (opened).`; }
    const s = hits[0], r = App.deleteBikes([s.id]);
    return `Deleted **${s.name}**${s.garage ? " (it was in your garage)" : ""}${r.ok ? "" : " (this browser wouldn't save the change, so it may come back after a reload)"}.\n${undoTip}`;
  }

  const FC = root.FrameChat; if (!FC || !FC._plus) return;
  const P = FC._plus;
  const { setMany, geo, r1 } = P;
  const J = () => root.FrameJourney && root.FrameJourney.api;
  const FJ = () => root.FrameJourney;
  const later = fn => setTimeout(() => { try { fn(); } catch (e) { console.error(e); } }, 30);
  const fv = (ctx, id) => { const f = ctx.fld(id); return f ? f.get() : undefined; };
  const PAST = "_From two real orders with a Ti builder (2024–25); ask your builder for current details._";

  // ---------------------------------------------------------------- 1. tidy-up before the sentence is read
  const FIELD_START = "(?:reach|stack|ha|hta|head ?angle|sa|sta|seat ?angle|cs|chain ?stays?|bbd|bb drop|bb|st|seat ?tube|ht|head ?tube|wb|wheel ?base|ett|trail|offset|fork offset|a2c|axle to crown|crank|cranks|stem|spacers|bars?|tyres?|tires?|rider|saddle|rotor|chainring|cog)";
  const WHEELISH = /\b(wheels?|tyres?|tires?|rims?|29er|650 ?b|700 ?c?|27\.5|26er|inseam|height|tall|shoe|shoes|boot)\b|\d\s*[x×]\s*\d/;
  function pre4(s) {
    let t = String(s || "");
    const same = sameAs(t); if (same) return same;
    // glued words and glued numbers: "headangle 65", "reach460", "ha65", "cs440", "stack650mm"
    t = t.replace(/\b(head|seat|top|down)(angle|tube|tubes|stay|stays)\b/gi, "$1 $2")
      .replace(/\baxletocrown\b/gi, "axle to crown").replace(/\bforkoffset\b/gi, "fork offset").replace(/\bsaddleheight\b/gi, "saddle height")
      .replace(/\bstemlength\b/gi, "stem length").replace(/\bbarwidth\b/gi, "bar width").replace(/\b(tyre|tire)width\b/gi, "$1 width").replace(/\bfrontcent(re|er)\b/gi, "front cent$1")
      .replace(/\b(reach|stack|ha|hta|sa|sta|cs|wb|ett|bbd|trail|offset|stem|spacers|chainstays?)(\d)/gi, "$1 $2");
    // "reach=460 stack=640 ha=65.5" → "reach 460, stack 640, ha 65.5"
    if (/[a-z]\s*=\s*-?\d/i.test(t)) t = t.replace(/\s*=\s*(?=[-+]?\d)/g, " ");
    t = t.replace(new RegExp("(\\b" + FIELD_START + "\\s*[:]?\\s*(?:to\\s+)?[-+]?\\d+(?:\\.\\d+)?\\s*(?:mm|°|deg|degrees)?)\\s+(?=" + FIELD_START + "\\b)", "gi"), "$1, ");
    // "reach + 5mm" → "reach +5mm"
    t = t.replace(/([a-z])\s+([+-])\s+(?=\d)/gi, "$1 $2");
    // "more like 460", "closer to 460", "460ish"
    t = t.replace(/\b(more like|closer to|nearer to|something like|roughly|approximately|approx\.?|around|in the region of|ballpark)\s+(?=\d)/gi, "to ").replace(/(\d)\s*-?ish\b/gi, "$1");
    // pressure in kPa → psi; weight in stone + pounds → kg
    t = t.replace(/(\d+(?:\.\d+)?)\s*kpa\b/gi, (m, v) => `${Math.round(+v / 6.895)} psi`);
    t = t.replace(/\b(\d{1,2})\s*(?:st|stone)\s*(\d{1,2})\s*(?:lbs?|pounds?)\b/gi, (m, st, lb) => `${r1((+st * 14 + +lb) * 0.45359)} kg`);
    t = t.replace(/\b([5-9]|1\d|2\d)\s?st\b(?!\w)/gi, "$1 stone");
    const low = t.toLowerCase();
    // metres for lengths ("saddle height 0.75 m"), not for drops ("biggest drop 1 m")
    if (!/\b(drop|drops|huck|landing|jump|jumps|fall|height of)\b/.test(low) || /\bsaddle\b/.test(low))
      t = t.replace(/\b(0\.\d+|[12](?:\.\d+)?)\s*(?:m|metres?|meters?)\b/gi, (m, v) => /^(saddle|seat|stack|reach|wheel|chain|effective|ett|top|front|seat ?tube|head)/i.test(low) || /\b(saddle|stack|reach|wheelbase|chainstay|seat tube|top tube|front cent)/.test(low) ? `${Math.round(+v * 1000)} mm` : m);
    // "1 ft 6 in" / 1' 6" → inches (not a height: "I'm 6 foot 1" is chatplus's)
    if (!/\b(i'?m|i am|tall|height)\b/i.test(t)) t = t.replace(/(\d+)\s*(?:ft|feet|foot|')\s*(\d+(?:\.\d+)?)\s*(?:in|inch|inches|"|”)?(?!\w)/gi, (m, f, i) => `${r1((+f * 12 + +i) * 25.4)} mm`);
    // inches for frame lengths ("chainstay 17.2 in"): to mm before the field is picked, so it isn't read as a tube size
    if (!WHEELISH.test(low)) t = t.replace(/(\d+(?:\.\d+)?)\s*(?:inches|inch|in\b|")/gi, (m, v) => +v >= 3 && +v < 60 ? `${r1(+v * 25.4)} mm` : m);
    // "chainstays down 5" → minus (otherwise it reads as a tube diameter)
    t = t.replace(/\b(chain ?stays?|seat ?tube|head ?tube|top ?tube|down ?tube|seat ?stays?)\s+(up|down)\s+(?:by\s+)?(\d)/gi, (m, f, d, n) => `${f} ${d.toLowerCase() === "up" ? "plus" : "minus"} ${n}`);
    // "raise the front end 15mm" → stack
    if (/\d/.test(t)) t = t.replace(/\b(?:the )?front ?end\b/gi, "the stack");
    // "top tube 35 by 0.9" → "35 x 0.9"
    t = t.replace(/(\d+(?:\.\d+)?)\s*by\s*(\d(?:\.\d+)?)(?!\d)/gi, (m, a, b) => +b < 5 && +a > 8 ? `${a} x ${b}` : m);
    // "no, 442" / "actually 438" / "wait 445" → "make it 442"
    t = t.replace(/^\s*(?:no+|nah|nope|wait|actually|hmm+|err+|erm+|oh|sorry)\s*[,.!]?\s+(?=[+-]?\d)/i, "make it ");
    // "can I make the reach 460?", "could the stack be 650?" → do it
    if (/^\s*(?:can|could|may|might) (?:i|we|you) (?:please )?(?:make|set|have|get|try|put|change|go with|go to|do)\b.*\d/i.test(t)) t = t.replace(/\?+\s*$/, "");
    t = t.replace(/^\s*(?:can|could|may|might) (?:i|we|you) (?:please )?(make|set|have|get|try|put|change|go with|go to|do)\b\s*(?=.*\d)/i, (m, v) => /^(have|get|do)$/i.test(v) ? "" : v + " ")
      .replace(/^\s*(?:could|can) (?:the|my) (.+?) be (?:a |an )?([+-]?\d[^?]*)\?*\s*$/i, "$1 $2");
    // finish words: "actually make it blasted", "go with polished"
    t = t.replace(/^\s*(?:actually|no wait|wait|ok|okay|so|hmm)?[, ]*(?:make it|go with|do|change it to|switch to|let'?s do)\s+(brushed|blasted|bead ?blasted|polished|raw|painted|cerakote|matte|satin)\s*(?:finish)?\.?$/i, (m, f) => `${/^blast/i.test(f) ? "bead blasted" : f} finish`);
    // fork cages
    t = t.replace(/\banything ?cages?( mounts?)?( on the fork| on the fork legs| fork)?\b/gi, "fork cage mounts").replace(/\bcargo cages?( mounts?)?\b/gi, "fork cage mounts");
    // "reduce wall thickness on everything by 0.1" → all tubes
    if (/\b(wall|walls|thick|thicker|thinner|thickness|gauge)\b/i.test(t)) t = t.replace(/\b(?:on |for |of )?(?:everything|every tube|all of them|the whole frame|whole frame)\b/gi, " all tubes");
    // "shorter wheelbase 1180" → "wheelbase to 1180"; "rigid fork with 400 a2c" → "rigid fork, a2c 400"
    t = t.replace(/\b(?:shorter|longer|taller|lower|higher|bigger|smaller)\s+(wheel ?base|reach|stack|chain ?stays?|front cent(?:re|er)|ett|effective top tube)\s+(?:of |to |at )?(\d{3,4})\b/gi, "$1 to $2");
    t = t.replace(/\s+with (?:an? )?(\d+(?:\.\d+)?)\s*(?:mm)?\s*(a2c|offset|axle to crown|rake)\b/gi, ", $2 $1");
    // "put flat bars on it" → "flat bars"
    t = t.replace(/^\s*(?:put|fit|stick|throw|slap) (?:some |a |an |the )?((?:flat|riser|drop|road|gravel|mtb) (?:bars?|handlebars?))(?: on(?: it| the bike| there)?)?\s*$/i, "$1");
    // "make it bigger / smaller" = a size up / down
    t = t.replace(/^\s*(?:make it|make the (?:bike|frame)|go)\s+(bigger|larger)\s*$/i, "size up").replace(/^\s*(?:make it|make the (?:bike|frame)|go)\s+smaller\s*$/i, "size down");
    return t;
  }
  // whole sentences said another way → a phrasing the phrasebook already handles
  const SAME_AS = [
    [/\b(better|good|confident) (on|at|for|down) (the )?(descents?|descending|downhills?|the downs|steep stuff)\b|\bdescends? (better|well)\b|\bbetter descender\b/, "make it descend better"],
    [/\bclimb(s|ing)? (like a goat|well|better)\b|\bbetter (at|for) climbing\b|\bbetter climber\b/, "better climbing"],
    [/^(make it |i want it |more |a bit more |a more )?(more )?(playful|poppy|poppier|flickable|lively|livelier|fun|chuckable)( bike| please)?$/, "snappier rear end"],
    [/\b(twitchy|nervous|skittish|speed wobble|wobbly at speed|unstable at speed|squirrelly|darty)\b/, "more stable"],
    [/\b(sluggish|lazy steering|slow steering|slow handling|ponderous|steers like a truck|heavy steering|dull steering)\b/, "quicker steering"],
    [/\b(wheel ?flop|front wheel flops|flops? (over|around|in))\b/, "less trail"],
    [/\b(frame|bike|it) (feels |is |seems )?(too big|too long|too roomy|too stretched)\b/, "it feels too stretched out"],
    [/\b(hands? (go|goes|get|gets|going) numb|numb hands|wrist pain|sore wrists|too much weight on (my )?hands|palms hurt)\b/, "more upright position"],
    [/^how strong is (it|the frame|this)\??$|^is it strong\??$|^will it hold( up)?\??$/, "is it strong enough"],
    [/^how long (will|would|does|should) (the frame|it|this frame|my frame|the bike) last\??$|^what'?s the (frame'?s )?(life|lifespan)\??$/, "how long will it last"],
    [/^(start over|start again|start fresh|begin again) with a new (design|bike|frame)$|^(i want to |let'?s )?(design|make|build) a new (bike|frame)$/, "new bike"],
    [/^(what can you change|what can i change here|what (are|is) (all )?the (fields|settings|options)|show (me )?(all )?(the )?(settings|fields)|all (the )?(settings|fields)|list (all )?settings)\??$/, "list fields"],
    [/^(1 ?x ?(9|10|11|12|13)|1x only please|one by(\s\w+)?|single ring)$/, "1x only"],
    [/^(2 ?x ?(9|10|11|12)|double ring|two rings|2 chainrings)$/, "front derailleur mount"],
    [/^(make it |go |switch to |turn on )?(dark|darker|night)$|^(lights? off|too bright|it'?s too bright|dim (it|the screen)|easier on the eyes)$/, "night mode"],
    [/^(make it |go |switch to )?(light|lighter|brighter|bright)$|^(lights? on|too dark|it'?s too dark)$/, "light mode"],
    [/^(show me |show |go to )?(the )?drive ?side( view)?$/, "side view"],
    [/^how (low|high) is (the |my )?(bb|bottom bracket)\??$|^(bb|bottom bracket) height\?$/, "what's the bb height"],
    [/^what (have i|did i|i'?ve) changed( so far| today| in this chat)?\??$|^what'?s changed( so far)?\??$|^(list|show) (my |the )?(edits|changes)( so far)?$/, "what changed"],
    [/^(save over it|overwrite( it)?|save (my |the )?changes( to it)?|update (it|the design|the saved design)|keep (the )?changes)$/, "save changes"],
    [/^(double|single|triple) ?butted( tubing| tubes| tubeset)?$|^butted tubing please$/, "butted tubes"],
    [/^(i )?(paid|sent|transferred) (the )?(50 ?%|50 percent|fifty percent|half|first half|first payment)( deposit)?$/, "I paid the deposit"],
    [/^(revision|rev|drawing|r) ?(\d) (arrived|came|is here|came in)$|^(i )?(got|received) (a |the )?(new|revised|updated|second|next|another) drawing( from ((?:waltly|my builder|the builder|your builder|builder)|them))?$|^((?:waltly|my builder|the builder|your builder|builder)|they) sent (a |the )?(new|revised|updated|second|next|another) drawing$/, "the builder sent a revised drawing"],
    [/^(i )?approved (r\d|the final drawing|drawing r?\d|it)$|^(i'?ve )?(signed off|said yes to) (the )?(drawing|r\d)$/, "I've approved the drawing"],
    [/\b(frame'?s|frame is|it'?s|it is) (on (the|its) way|in transit|en route|coming)\b|^(on (its|the) way|in transit)$/, "frame shipped"],
    [/^where'?s (my|the) (frame|order|bike)\??$|^(any|what'?s the) (news|update) on (my|the) (frame|order)\??$/, "order status"],
    [/^(what|which) questions (do i have|are open|have i got)\??$|^(my|open) questions\??$/, "show my questions"],
    [/^(do|are) (the )?(thru ?-?)?axles (come with it|included|come with the frame)\??$|^(is|does) (a |the )?(seat ?clamp|hanger|derailleur hanger) (included|come with it)\??$/, "what's included?"],
    [/^(build|make|design) me an? (gravel|road|hardtail|mtb|mountain|touring|bikepacking|xc|trail|enduro|cx|cyclocross) bike$/, null]
  ];
  function sameAs(raw) {
    const low = String(raw).toLowerCase().replace(/[’']/g, "'").replace(/[.!]+$/, "").trim();
    for (const [re, to] of SAME_AS) if (to && re.test(low)) return to;
    { const k = low.match(/^(?:build|make|design) me an? (gravel|road|hardtail|mtb|mountain|touring|bikepacking|xc|trail|enduro|cx|cyclocross) bike$/); if (k) return `new ${k[1].replace(/^(mtb|mountain|xc|trail|enduro)$/, "hardtail").replace(/^(cx|cyclocross|bikepacking|touring)$/, "gravel")} bike`; }
    { const k = low.match(/^i (?:wear|take|have|am|'m) (?:a )?(?:size )?(\d{1,2}(?:\.5)?)\s*(us|uk|eu)(?: shoes?)?$|^i (?:wear|take) (?:a )?(us|uk|eu) (?:size )?(\d{1,2}(?:\.5)?)(?: shoes?)?$/); if (k) return `${(k[2] || k[3]).toUpperCase()} ${k[1] || k[4]} shoes`; }
    let m;
    // "how does it compare to my gravel bike", "difference between this and the canyon"
    if ((m = low.match(/^(?:how does (?:it|this|my (?:design|bike)) compare (?:to|with|against)|(?:what'?s the )?differences? between this(?: one)? and|compare this (?:one )?(?:to|with)|how is (?:it|this) different (?:from|to)|how different is (?:it|this) (?:from|to)) (?:the |my )?(.+?)\??$/))) return "compare geometry with " + m[1];
    return null;
  }
  const baseRewrite = FC.rewrite;
  FC.rewrite = (raw, ctx) => { const t = pre4(raw); return baseRewrite ? baseRewrite(t, ctx) : t; };
  FC._pre4 = pre4;

  // spelling fixer: never "fix" these real words into setting names ("step" → "stem", "heavy" → "head")
  const PROTECT = new Set(("step steps done heavy heavier timeline warranty paint painted credit card contact order orders ordering size sizes weeks week " +
    "light lighter beginner everything normal typical good weakest stiff stiffer stiffness comfortable comfy fails fail failing stress original reset default " +
    "level sloping nope yeah sure huh okay cool wrong before same too why which instead weight weigh light quote price prices cost costs ship shipping " +
    "warranty guarantee couplers coupler belt gearbox pinion rohloff paypal card visa deposit balance customs tariff tariffs duty email mail send sent " +
    "request summary journal question questions answer answered checks check tick ticked untick finish finished complete").split(" "));
  const baseFix = FC.typofix;
  if (baseFix) FC.typofix = (raw, ctx) => {
    const fixed = baseFix(raw, ctx); if (!fixed) return fixed;
    const a = String(raw).split(/(\s+)/), b = String(fixed).split(/(\s+)/);
    if (a.length !== b.length) return fixed;
    const out = b.map((tok, i) => PROTECT.has(a[i].toLowerCase().replace(/[^a-z]/g, "")) ? a[i] : tok).join("");
    return out === raw ? null : out;
  };

  // ---------------------------------------------------------------- 2. typical ranges by kind of bike
  // Rough ranges for production bikes of each kind (not rules: custom frames sit outside them on purpose).
  const KINDS = {
    road: { name: "road", headAngle: [71.5, 73.5], seatAngle: [73, 74.5], chainstay: [405, 420], bbDrop: [68, 75], trail: [55, 62], forkOffset: [43, 50], tireWidth: [25, 32] },
    gravel: { name: "gravel", headAngle: [70, 72], seatAngle: [73, 75], chainstay: [415, 445], bbDrop: [65, 80], trail: [60, 80], forkOffset: [45, 55], tireWidth: [38, 55] },
    touring: { name: "touring / bikepacking", headAngle: [70, 72], seatAngle: [72.5, 74], chainstay: [440, 470], bbDrop: [65, 80], trail: [55, 70], forkOffset: [45, 55], tireWidth: [38, 60] },
    xc: { name: "XC hardtail", headAngle: [66, 69], seatAngle: [73.5, 76], chainstay: [425, 440], bbDrop: [50, 65], trail: [80, 110], forkOffset: [42, 51], tireWidth: [55, 62] },
    trail: { name: "trail hardtail", headAngle: [64, 66.5], seatAngle: [74.5, 77.5], chainstay: [420, 440], bbDrop: [50, 70], trail: [100, 130], forkOffset: [42, 51], tireWidth: [58, 66] },
    enduro: { name: "aggressive / enduro hardtail", headAngle: [62.5, 64.5], seatAngle: [76, 78], chainstay: [430, 450], bbDrop: [50, 70], trail: [115, 140], forkOffset: [42, 51], tireWidth: [60, 66] }
  };
  const RANGE_FIELDS = [["headAngle", "geometry.headAngle", "°"], ["seatAngle", "geometry.seatAngle", "°"], ["chainstay", "geometry.chainstay", "mm"], ["bbDrop", "geometry.bbDrop", "mm"], ["trail", null, "mm"], ["forkOffset", "geometry.forkOffset", "mm"], ["tireWidth", "geometry.tireWidth", "mm"]];
  const RANGE_NAME = { headAngle: "head angle", seatAngle: "seat angle", chainstay: "chainstay", bbDrop: "BB drop", trail: "trail", forkOffset: "fork offset", tireWidth: "tyre width" };
  function kindFromText(t) {
    if (/\b(road|race bike|endurance road|crit)\b/.test(t)) return "road";
    if (/\b(tour(ing|er)?|bikepack(ing)?|expedition|loaded)\b/.test(t)) return "touring";
    if (/\b(gravel|cx|cyclo ?cross|all ?road|adventure)\b/.test(t)) return "gravel";
    if (/\b(xc|cross ?country|marathon)\b/.test(t)) return "xc";
    if (/\b(enduro|aggressive|downhill|dh|park|freeride|long travel)\b/.test(t)) return "enduro";
    if (/\b(trail|hardtail|mtb|mountain bike|mountain)\b/.test(t)) return "trail";
    return null;
  }
  function kindOfDesign(ctx) {
    const d = ctx.App.design(), g = d.geometry, travel = +d.use.forkTravel || 0;
    try { const s = J() && J().project().spec.type; if (/road/i.test(s || "")) return "road"; if (/gravel/i.test(s || "")) return "gravel"; if (/tour|bikepack/i.test(s || "")) return "touring"; } catch (e) {}
    if (travel >= 130 || +g.headAngle < 64.5) return travel >= 150 || +g.headAngle < 63.5 ? "enduro" : "trail";
    if (travel > 0) return travel <= 110 ? "xc" : "trail";
    if (+g.tireWidth <= 34) return "road";
    if (+g.headAngle >= 69) return "gravel";
    return +d.use.condition >= 3 ? "trail" : "gravel";
  }
  function valueOf(ctx, key) { if (key === "trail") return geo(ctx).trail; const rf = RANGE_FIELDS.find(x => x[0] === key); return rf ? +fv(ctx, rf[1]) : NaN; }
  const fmtR = (k, [lo, hi], u) => `${lo}–${hi}${u === "°" ? "°" : " mm"}`;
  function keyFromText(t) {
    if (/\bhead ?(tube )?angle\b|\bhta?\b/.test(t)) return "headAngle";
    if (/\bseat ?(tube )?angle\b|\bsta?\b/.test(t)) return "seatAngle";
    if (/\bchain ?stays?\b|\brear cent(re|er)\b|\bcs\b/.test(t)) return "chainstay";
    if (/\bbb drop\b|\bbottom bracket drop\b|\bbb height\b/.test(t)) return "bbDrop";
    if (/\btrail\b(?! ?(bike|riding|hardtail))/.test(t)) return "trail";
    if (/\b(fork )?offset\b|\brake\b/.test(t)) return "forkOffset";
    if (/\b(tyre|tire) (width|size)\b|\b(tyres|tires|tyre|tire)\b/.test(t)) return "tireWidth";
    if (/\breach\b/.test(t)) return "reach";
    if (/\bstack\b/.test(t)) return "stack";
    return null;
  }
  function sizeAdvice(ctx, k) {
    const v = +fv(ctx, "geometry." + k);
    return `**${k === "reach" ? "Reach" : "Stack"}** depends on your size and how you like to sit, not on the kind of bike: it's **${v} mm** now. The best guide is a bike that already fits you: \`overlay my current bike\`, a garage bike under \`compare with …\`, or \`help me figure out what I want\` (asks your height). ±10 mm of reach is a noticeable change.`;
  }

  // ---------------------------------------------------------------- 3. results in words
  const GROUP = { topTube: "top tube", downTube: "down tube", seatTube: "seat tube", headTube: "head tube", chainstay: "chainstays", seatStay: "seat stays", dropout: "dropouts", bbShell: "BB shell", seatpost: "seatpost", ssBridge: "bridge", ssMono: "wishbone", csYoke: "yoke" };
  const needResult = ctx => { const r = ctx.App.result && ctx.App.result(); return r || null; };
  const ENG_HINT = ctx => ctx.App.uiMode && ctx.App.uiMode() !== "eng" ? " `engineering mode` shows the details." : "";
  const SIM = "\n_Simulation estimate only; it may contain mistakes. Your frame builder or frame designer has the final say._";
  function weakest(ctx) {
    const r = needResult(ctx); if (!r) return "The analysis hasn't finished yet; ask again in a second.";
    const out = [], fat = r.fatigue, fails = r.isoTests.filter(x => !x.pass);
    if (fat && fat.site) out.push(`**Fatigue**: the weakest spot is **${fat.site.name}** (estimated life ${isFinite(fat.lifeYears) ? (fat.lifeYears >= 100 ? "100+" : Math.round(fat.lifeYears)) + " years" : "no limit"} for the riding you set).`);
    if (fails.length) out.push(`**Lab tests**: ${fails.map(x => `${x.name} fails${x.peakGroup && GROUP[x.peakGroup] ? ` (worst at the ${GROUP[x.peakGroup]})` : ""}`).join("; ")}.`);
    else out.push(`**Lab tests**: all ${r.isoTests.length} pass.`);
    const bad = ctx.App.checks().filter(c => c.status === "fail" || c.status === "warn").slice(0, 4);
    if (bad.length) out.push(`**Builder checks to look at**: ${bad.map(c => `${c.item} (${c.value}; want ${c.target})`).join(" · ")}.`);
    const g = fails[0] && fails[0].peakGroup;
    if (g && GROUP[g]) out.push(`_Try \`beef up the ${GROUP[g]}\` or \`bigger ${GROUP[g]}\`, then ask again._`);
    else if (fat && fat.site && /down tube/i.test(fat.site.name)) out.push("_Try `beef up the down tube` or `bigger down tube`._");
    return out.join("\n") + ENG_HINT(ctx) + SIM;
  }
  function weightAnswer(ctx) {
    const r = needResult(ctx); if (!r) return "The analysis hasn't finished yet; ask again in a second.";
    const by = Object.entries(r.massByGroup || {}).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, g]) => `${GROUP[k] || k} ${Math.round(g)} g`);
    return `**Tube weight**: ${Math.round(r.massG).toLocaleString()} g${by.length ? ` (${by.join(", ")})` : ""}. That's the tubes only: dropouts, machined head tube / BB shell, bosses and welds add to it on the real frame. Lighter: \`lighter tubes\` or \`thinner top tube wall\`, then check \`what's the weakest point\`.`;
  }
  function stiffAnswer(ctx) {
    const r = needResult(ctx); if (!r) return "The analysis hasn't finished yet; ask again in a second.";
    const s = r.stiffness || {}, T = s.tbis || {}, out = [];
    for (const k of ["L", "M"]) if (T[k] && isFinite(T[k].k)) out.push(`${T[k].label}: **${Math.round(T[k].k)} N/mm** (typical band ${T[k].band[0]}–${T[k].band[1]})`);
    if (isFinite(s.bbLateral)) out.push(`BB sideways: ${Math.round(s.bbLateral)} N/mm`);
    return out.length ? "**Stiffness** (estimated, frame only):\n• " + out.join("\n• ") + "\n_Stiffer: `bigger down tube`, `bigger chainstays`. Softer: `smaller top tube`, `thinner seat stays`._" + SIM : "No stiffness numbers for this design yet.";
  }
  function comfortAnswer(ctx) {
    const r = needResult(ctx); if (!r || !r.comfort) return "The analysis hasn't finished yet; ask again in a second.";
    const c = r.comfort;
    return `**Seated comfort**: ${Math.round(c.k)} N/mm at the saddle (${String(c.rating && c.rating.label || "").toLowerCase()}). Most give comes from the tyres and seatpost, not the frame. More comfort: \`tyre pressure -2\`, \`2.4 tyres\`, a \`carbon 27.2 post\` or \`leaf-spring post\`; on the frame, \`thinner seat stays\` or \`smaller top tube\`.` + SIM;
  }

  // ---------------------------------------------------------------- 4. why things changed
  const WHY = {
    trail: "**Trail** comes from the head angle, the fork offset and the front tyre's size. Slacker head angle or less offset = more trail; a bigger front tyre adds a little.",
    wheelbase: "**Wheelbase** = front centre + rear centre. It grows with reach, a slacker head angle, a longer fork (axle-to-crown), less BB drop, and longer chainstays.",
    effectiveTopTube: "**Effective top tube** is measured level from the head-tube top back to the seat-tube line, so it grows with reach, and with a slacker seat angle or a taller stack.",
    bbHeight: "**BB height** = rear axle height (tyre radius) − BB drop. More BB drop or a smaller rear tyre lowers it.",
    frontCentre: "**Front centre** (BB to front axle) grows with reach, a slacker head angle, a longer fork and more offset.",
    stack: "**Stack** is one of your inputs here, so it only changes when you change it (the head tube length follows it)."
  };
  function whyAnswer(ctx, t) {
    const k = /\btrail\b/.test(t) ? "trail" : /\bwheel ?base\b/.test(t) ? "wheelbase" : /\b(ett|effective top tube|top tube)\b/.test(t) ? "effectiveTopTube" : /\b(bb|bottom bracket) height\b/.test(t) ? "bbHeight" : /\bfront cent/.test(t) ? "frontCentre" : /\bstack\b/.test(t) ? "stack" : null;
    const last = ctx.state.last && ctx.state.last.items && ctx.state.last.items[0];
    const lf = last && ctx.fld(last.id);
    const lead = lf ? `You changed **${lf.label}** (${last.old} → ${last.now}). ` : "";
    if (k) return lead + WHY[k];
    if (lf) return lead + "Changing one number moves the others that are worked out from it (the _Knock-on_ line): " + Object.values(WHY).slice(0, 3).join(" ");
    return null;
  }

  // ---------------------------------------------------------------- 5. more your builder answers (from the two real order threads)
  const FAQ2 = [
    [/\b(change (it|things|stuff|anything|the design|the geometry) (after|once) (the drawing|i approve|approval|i confirm|production))\b/,
      "Before you confirm the drawing: yes, send every change in **one** reply and they revise it. **After** you confirm, production starts and changes are refused (\"too late to change now\"); a real 2025 order hit exactly that with a reach error. Read every number twice before you approve."],
    [/\b(how long (until|till|before) (i get|i have|it arrives|it'?s here|my frame)|time ?line|how many weeks|how many months|how long (does|will) (it|the whole thing|everything|the order) take|total time|from order to (delivery|door)|when (would|will|could) i (get|have) (it|my frame)|lead ?time)\b/,
      `**Timeline** (the two real orders): request → questions and quote (a few days) → 50% deposit → first drawing **3–4 days** later → revisions → you confirm → production quoted ~5 weeks, really **6.5–7 weeks** (longer around Chinese holidays) → finish proof → photos, balance → shipping (tracking shows after 1–6 days). Plan on roughly **2–3 months** door to door. ${PAST}`],
    [/\b(credit card|debit card|visa|mastercard|amex|bank transfer|wire transfer|wise|crypto|cash|apple pay|google pay|pay by card)\b/,
      `Both real orders paid by **PayPal Goods & Services** (deposit and balance, ~4.75% fee added). PayPal can be funded by a card. For a bank transfer or anything else, ask your builder. ${PAST}`],
    [/\b(warranty|guarantee|guaranteed|lifetime|crash replacement|if it (breaks|cracks)|crack(s|ed)?)\b/,
      `Warranty didn't come up in the two order threads Cyclic Labs learned from, so **ask your builder** for their terms in writing before you pay (\`ask my builder what warranty the frame has\` adds it to your questions). ${PAST}`],
    [/^(is it|is (?:waltly|my builder|the builder|your builder|builder)|is this|are they) (expensive|pricey|cheap|costly|good value|worth it)\??$|\bhow expensive\b/,
      `A custom-geometry Ti frame was **$900** in the 2025 order, plus options (carbon fork $160 or Ti fork $350, headset ~$50, finish ~$50, engraving $80, 3D yoke $100) and ~$300 shipping to the US with customs; PayPal adds ~4.75%. \`how much does the frame cost?\` lists it. ${PAST}`],
    [/\b(paint|painted|powder ?coat|cerakote|anodi[sz]e|anodi[sz]ed|colou?r(ed)? frame|colou?rs? on the frame)\b/,
      "The real orders were **brushed, bead blasted, or brushed + blasted** (they send a proof of where the two meet), head-tube engraving or anodising from your own image (~$80 engraved). For full paint or Cerakote, ask your builder (or have it done locally: raw Ti paints fine after blasting). Say `painted finish` to put it on the spec sheet."],
    [/\b(s ?& ?s|s and s|couplers?|travel (frame|bike)|split(table)? (frame|rear|triangle)|belt ?drive|gates|rohloff|pinion|gear ?box|eccentric|ebb|sliders?|sliding dropouts?|single ?speed)\b/,
      "Your builder lists **S&S couplers, belt drive, Rohloff and Pinion gearboxes** as custom options on their custom-frame page. A belt needs a splittable rear triangle; a Rohloff or singlespeed needs sliders, an eccentric BB or rocker dropouts. Ask how they tension it and what it costs. Say `note for my builder: belt drive, split drive-side seat stay` to put it in your request."],
    [/\b(what (do|should) i (need to )?(send|give|tell|email)( them| (?:waltly|my builder|the builder|your builder|builder))?|what (info|information|details) do they need|what do (they|waltly|my builder|your builder) (need|want) from me|what does (waltly|the builder|my builder|your builder|they) (need|want)( from me)?|what to send)\b/,
      "Your builder wants **everything in one email**: geometry (stack, reach, head and seat angles, head tube and seat tube length, chainstay, BB drop), your weight and riding, and every option (head tube/headset, fork, BB, exact chainrings, biggest tyre, routing, mounts, finish, logos). Cyclic Labs builds that email: `what's missing on the spec`, then `write my request`."],
    [/\b(contact|get in touch|reach out|email address|e-?mail them|how do i (talk|write) to|who do i (talk|write|email) to|website)\b.*\b((?:waltly|my builder|the builder|your builder|builder)|them|builder)?\b|\b((?:waltly|my builder|the builder|your builder|builder)'?s?) (email|website|site|contact)\b/,
      "Email your builder's sales address (from their website). A sales rep answers within a few days and stays your contact for the whole order. Log what they say here: `the builder said …`."],
    [/\b(how do i (start|place|begin|make) (an |my |the )?order|how do i order|how to order|start (an|my|the) order|place (an|my|the) order|ready to order|i want to order|order (a|my|the) frame)\b/,
      "To order: 1) finish the design (`go to step 2`), 2) run the checks (`go to step 3`), 3) fill the spec sheet (`what's missing on the spec`), 4) `write my request` and email it to your builder in **one** message, 5) say `I sent the request`. Then pay the deposit, check each drawing (`scan a drawing`), and approve only when every number is right."],
    [/\b(what are the steps|steps of the (order|process)|order process|how does the process work|what happens next with (?:waltly|my builder|the builder|your builder|builder)|the process)\b/,
      "**The order, step by step**: request (one email) → questions + quote → 50% deposit → first drawing (3–4 days) → revisions → you confirm (no changes after that!) → production (~6.5–7 weeks) → finish proof → finished-frame photos → balance → shipping. Cyclic Labs tracks each: `order progress`."],
    [/\b(what happens|then what|what next) (after|once|when) i (approve|confirm|sign off|say yes)\b|\bafter (approval|i approve|confirming)\b/,
      "After you confirm the drawing, **production starts and changes are refused** (\"too late to change now\"). Next: production (~6.5–7 weeks), a finish proof to approve, finished-frame photos, the balance by PayPal with your address and phone number, then FedEx/UPS. Tick each in step 5 or say e.g. `production started`."],
    [/\b(customs|import duty|duties|vat|gst|tariffs?|import tax)\b.*\b(uk|britain|england|scotland|eu|europe|germany|france|netherlands|canada|australia|nz|new zealand|ireland|sweden|norway|switzerland|japan)\b|\b(uk|eu|europe|canada|australia)\b.*\b(customs|duty|duties|vat|gst|tariffs?|import)\b/,
      `The real orders shipped to the **US** with customs included in the ~$300 shipping. Outside the US, your country's import duty and VAT/GST usually apply on arrival; ask your builder whether their quote includes them and how they declare the value. ${PAST}`],
    [/\b(can|do|will) (they|(?:waltly|my builder|the builder|your builder|builder)) (make|build|do|supply|offer) (a |the )?(ti |titanium )?forks?\b|\b(?:waltly|my builder|the builder|your builder|builder) (ti |titanium )?fork\b(?!.*\b(cost|price|much)\b)/,
      "Yes: a **builder's carbon fork** (~$160, 47 or 52 mm rake, no 55, tapered steerer, tyres up to 700C × 55) or a **Ti fork** (~$350, unicrown or segmented crown). A Ti fork must be designed **with** the frame: it's longer than a carbon fork, so adding one later breaks the geometry. Say `builder's carbon fork` or `ti fork` to put it on the spec sheet."],
    [/\b(what if|what happens if) (the |their |(?:waltly|my builder|the builder|your builder|builder)'?s )?drawing (is|has|was) (wrong|a mistake|an error|off|different)|\b(mistake|error|wrong number) (in|on) the drawing\b/,
      "Before you confirm: list every difference in **one** reply and they send a revised drawing; Cyclic Labs helps (`scan a drawing` → drawing checklist → change request). **After** you confirm, it's too late: a real 2025 order found a reach error after production started. So read every number twice."],
    [/\b(what('?s| is) a (drawing )?round|drawing rounds?|r1|r2|revision rounds?)\b/,
      "A **drawing round** is one CAD drawing from your builder (R1 is the first). Cyclic Labs reads it (`scan a drawing`, or `type the drawing numbers in`), compares every number with what you asked for, and writes your change request. Each revised drawing is the next round."],
    [/\b(disc brakes?|rim brakes?|flat ?mount|post ?mount|brake mounts?)\b.*\b(do|can|offer|support)\b|\b(do|can) (they|(?:waltly|my builder|the builder|your builder|builder)) (do|make|build) (disc|flat mount|post mount)/,
      "Yes. The real orders used **flat mount** discs (rotors 140/160 or 160/180; the carbon fork wants 160 minimum and they leaned to 180 front). MTB frames use post mount. Say `flat mount 160/180` for the spec sheet."],
    [/\b(copy|clone|replicate|same as) (the )?(geometry|geo) (of|from) (my|a|an)\b.*\b(bike|frame)\b|\bcan (they|(?:waltly|my builder|the builder|your builder|builder)) copy\b/,
      "Your builder says they can copy the geometry of a bike you already own if you send its geometry table. In Cyclic Labs: `start from a bike I like` (paste its chart), then change what you want."],
    [/\b(steel|aluminium|aluminum|carbon frame|scandium)\b.*\b(frame|instead|option|do they)\b/,
      "Cyclic Labs models **titanium (3Al-2.5V)** frames like your builder's. You can change the material numbers (`open the rider panel`: stiffness, strengths, density), but the welds, tube choices and checks are tuned for Ti."],
    [/\b(ship(s|ping)? (to|into) (canada|the uk|uk|europe|the eu|australia|new zealand|nz|japan|germany|france|ireland|switzerland|norway|sweden|mexico|brazil|asia|internationally|worldwide|my country|abroad)|international shipping|ship internationally|ship worldwide)\b/,
      `The two real orders went to the **US** by express courier (FedEx 2024, UPS 2025, through a shipping agent), ~$300 with customs included. For another country, ask your builder for a shipping quote and whether it covers import duty and VAT/GST (usually charged on arrival). ${PAST}`],
    [/\b(how long (does|is) shipping|shipping time|how long to ship|delivery time|what courier|which courier|what carrier|which carrier|courier do they use|fedex or ups)\b/,
      `Shipping went **FedEx (2024) / UPS (2025)** through a shipping agent; tracking took 1–6 days to appear, then normal express times. ${PAST}`]
  ];
  function faq2(t) { for (const [re, a] of FAQ2) if (re.test(t)) return a; return null; }

  // ---------------------------------------------------------------- 6. parts by name or kind
  const GENERIC = new Set("fork forks carbon gravel road mm rake offset stem stems bar bars handlebar handlebars cockpit drop riser with the and a an of black blue raw matte tyre tyres tire tires mounts three pack low rider fender for mtb mountain rigid suspension travel factory ultimate thru axle x wheel wheels wheelset saddle saddles pedal pedals crank cranks crankset post seatpost dropper brake brakes rotor rotors chainring ring cassette derailleur set new other different".split(" "));
  const VERB_PART = /\b(use|fit|put|install|swap|switch|try|show|give it|go with|run|want|change to|change the fork to|pick)\b/;
  const CAT_WORDS = { fork: /\bforks?\b/, cockpit: /\b(stem|bars?|handlebars?|cockpit)\b/, crankset: /\b(cranks?|crankset)\b/, chainring: /\b(chainring|ring)\b/, wheels: /\bwheels?\b|\bwheelset\b/, tyres: /\b(tyres?|tires?)\b/, brakes: /\b(brakes?|rotors?)\b/, seatpost: /\b(seat ?post|post|dropper)\b/, saddle: /\bsaddle\b/, pedals: /\bpedals?\b/, rear: /\b(derailleur|cassette|rear mech)\b/ };
  function partByName(ctx, t) {
    const lib = root.FramePartLib; if (!lib) return null;
    const cats = Object.keys(CAT_WORDS).filter(c => CAT_WORDS[c].test(t));
    const U = ctx.words(t).filter(w => !GENERIC.has(w) && !/^(use|fit|put|install|swap|switch|to|try|show|give|it|go|run|want|change|pick|on|in|my|me|please|i|i'd|like|instead|for|one)$/.test(w) && w.length > 1);
    if (!U.length) return null;
    let best = null, bs = 0;
    if (!U.some(u => /[a-z]/.test(u))) return null;
    for (const p of lib.all()) {
      if (cats.length && !cats.includes(p.cat)) continue;
      const D = ctx.words(p.name).filter(w => !GENERIC.has(w) && w.length > 1);
      const hitW = U.filter(u => D.some(d => d === u || (u.length >= 4 && d.startsWith(u)) || (d.length >= 4 && u.startsWith(d))));
      const hits = hitW.length;
      if (!hits || !hitW.some(u => /[a-z]{2}/.test(u))) continue;
      const s = hits / U.length - D.length * 0.005;
      if (s > bs) { bs = s; best = p; }
    }
    return bs >= 0.6 ? best : null;
  }
  function pickPart(ctx, p, note) {
    const lib = root.FramePartLib, before = ctx.snapshot(), d = ctx.App.design();
    d.parts = d.parts || {}; d.parts.sel = d.parts.sel || {};
    const old = d.parts.sel[p.cat], oldP = old && lib.raw(old);
    if (old === p.id) return `**${(lib.CATS[p.cat] || {}).label || p.cat}** is already ${p.name}.`;
    d.parts.sel[p.cat] = p.id; ctx.record(before, "part");
    if (!ctx.App.isReal()) ctx.App.setReal(true);
    return `**${(lib.CATS[p.cat] || {}).label || p.cat}** (realistic view): ${oldP ? oldP.name : old || "default"} → ${p.name}` + (note ? `\n_${note}_` : "");
  }
  // drop bars need a drop-bar part; flat / riser bars only swap the part when the bike has drop bars now
  // (otherwise chatmore's "flat bars" / "riser bars" set the rise on the bar you have)
  const isDropNow = ctx => { const lib = root.FramePartLib, d = ctx.App.design(), id = d.parts && d.parts.sel && d.parts.sel.cockpit, p = id && lib && lib.raw(id); return !!p && (p.dropReach != null || /\bdrop bar\b|\broad bar\b|\bgravel bar\b/i.test(p.name)); };
  const BAR_KIND = [[/\b(drop|road|gravel|curly|drops)\s*(bars?|handlebars?)\b|\bdrop ?bars?\b/, t => /\broad\b/.test(t) ? "ck-road" : "ck-gravel", () => true],
    [/\b(riser)\s*(bars?|handlebars?)\b/, () => "ck-trail", isDropNow], [/\b(flat|straight|mtb|mountain)\s*(bars?|handlebars?)\b/, () => "ck-round-318", isDropNow]];

  // ---------------------------------------------------------------- 7. the early handlers (before anything else reads the sentence)
  function stepDone(ctx, which) {
    const a = J(); if (!a) return "The build journey isn't loaded on this page.";
    const go = s => later(() => FJ().go(s));
    if (which === "start") { go("design"); return "**Step 1 · Start** done: on to **Design**."; }
    if (which === "design") { a.setDesignDone(true); go("check"); return "**Design** marked ready (it's in your journal). On to **step 3 · Check**: say `what's next` for the list."; }
    if (which === "check") {
      const cp = a.checkProgress();
      if (cp.all) { go("builder"); return "All checks are ticked. On to **step 4 · Builder**."; }
      return `${cp.done} of ${cp.total} checks are ticked. Tick the rest in step 3, or say \`tick all the checks\` if you've looked at them all.`;
    }
    if (which === "builder") { go("final"); return "On to **step 5 · Final**. Approving a drawing stays a button press there, so it's always deliberate."; }
    if (which === "final") { go("final"); return "Step 5's **Mark as approved** button records the approval; after that, tick production, proof, photos, shipping and arrival (or say `frame shipped`, `it arrived`)."; }
    return null;
  }
  const STEP_WORD = { 1: "start", 2: "design", 3: "check", 4: "builder", 5: "final", one: "start", two: "design", three: "check", four: "builder", five: "final", start: "start", design: "design", designing: "design", check: "check", checks: "check", checking: "check", waltly: "builder", builder: "builder", final: "final" };
  function tickAllChecks(ctx) {
    const a = J(); if (!a) return null;
    const keys = (a.MANUAL || []).map(m => m.key).concat(["checklist", "toe", "geocheck"]).concat(ctx.App.uiMode && ctx.App.uiMode() === "eng" ? ["abuse", "iso", "comfort"] : []);
    keys.forEach(k => a.setReviewed(k, true));
    const cp = a.checkProgress();
    return `Ticked ${keys.length} checks in step 3 (${cp.done} of ${cp.total} now).${cp.all ? " Say `next step` for step 4 · Builder." : ""}`;
  }

  const EARLY_FIRST = (raw0, t, ctx) => {
    let m;
    // help on one topic
    if ((m = t.match(/^(?:help|examples?|how do i do|commands for|help me with|help with)\s+(?:with |on |for )?(?:the )?(geometry|geo|angles|tubes?|tubing|fork|forks|wheels?|tyres?|tires?|parts|cockpit|bars|stem|fit|toe|toe overlap|results|strength|engineering|order|ordering|(?:waltly|my builder|the builder|your builder|builder)|spec|spec sheet|journal|steps|journey|questions|look|theme|colours?|colors?)$/))) {
      const k = m[1];
      const H = [[/geo|angle/, "`reach 460` · `stack +10` · `head angle 1° slacker` · `seat angle 74` · `chainstay 435` · `bb drop 70` · `trail 100` · `wheelbase 1200 using the reach` · `HA 65 SA 76 CS 440` · `slacker but keep the trail` · `sanity check my geometry`"],
        [/tub/, "`down tube 44.5 x 1.2` · `top tube wall 0.9` · `seat stays 19mm` · `beef up the down tube` · `lighter tubes` · `butted down tube 1.2/0.9/1.2` · `44 teardrop down tube` · `oval chainstays` · `all walls 1.0`"],
        [/fork/, "`fork a2c 540` · `fork offset 47` · `reduced offset fork` · `140mm fork` · `rigid fork` · `use the Pike 140 fork` · `builder's carbon fork` · `ti fork`"],
        [/wheel|tyre|tire/, "`29 x 2.4 tyres` · `700x45` · `650b` · `make it a mullet` · `front tyre 29x2.6` · `tyre clearance 8` · `tyre pressure 25`"],
        [/part|cockpit|bar|stem/, "`stem 70` · `bars 780 wide` · `drop bars` · `20mm of spacers` · `slam the stem` · `flip the stem` · `use the Fox 34 fork` · `hide the wheels` · `realistic view`"],
        [/fit/, "`saddle height 750` · `inseam 86 cm` · `fit me a 32er` · `I feel cramped` · `more upright position` · `overlay my current bike`"],
        [/toe/, "`shoe size 45` · `US 11 shoes` · `midfoot cleats` · `add mudguards` · `toe overlap?` · `165mm cranks`"],
        [/result|strength|engineering/, "`is it strong enough` · `what's the weakest point` · `how long will it last` · `how stiff is it` · `how comfortable is it` · `engineering mode` · `lab tests`"],
        [/order|(?:waltly|my builder|the builder|your builder|builder)|spec|step|journey|question|journal/, "`go to step 3` · `what's next` · `what's missing on the spec` · `T47` · `wireless shifting` · `write my request` · `I paid the deposit` · `the builder said …` · `ask my builder …` · `order help`"],
        [/look|theme|colou?r/, "`night mode` · `light mode` · `raw titanium theme` · `accent colour orange` · `themes` · `make the seatpost blue`"]];
      const h = H.find(([re]) => re.test(k));
      if (h) return `**${k[0].toUpperCase() + k.slice(1)}**: ${h[1]}`;
    }
    if (/\b(inches|imperial|metric|units?|freedom units)\b/.test(t) && !/\d/.test(t) && !/\b(reach|stack|geometry|geo|trail|wheelbase|chainstay|angle|tube|in inches)\b.*\binches\b|\bwhat'?s the\b/.test(t)) return "Cyclic Labs works in **mm and degrees**. You can type other units (`reach 18 in`, `stack 64 cm`, `saddle height 0.75 m`, `I weigh 180 lb`, `14 stone`, `1.7 bar`) and they're converted. To read numbers in inches: `what's the reach in inches` or `geometry in inches`.";
    // ---- questions about your builder that would otherwise hit a setting ("can they make a fork", "do they do disc brakes", tariffs)
    if (/^(can|do|does|will|would|could|are|is) (they|(?:waltly|my builder|the builder|your builder|builder)|you guys|the builder|the factory)\b/.test(t) || /\b(tariffs?|customs|import (duty|tax)|duties)\b/.test(t)) {
      const f = faq2(t); if (f) return f;
      if (/\b(tariffs?|customs|import (duty|tax)|duties)\b/.test(t)) return `**Customs and tariffs**: the real orders shipped to the **US** with customs included in the ~$300 shipping, and US buyers reported that worked with tariffs. Elsewhere, import duty and VAT/GST are usually charged on arrival; ask your builder what their quote covers. ${PAST}`;
    }
    // ---- BikeCAD files ("load a bikecad file")
    if (/\b(bikecad|\.bcad)\b/.test(t) && !/\?$/.test(raw0.trim())) { later(() => { const b = document.querySelector("#btnImport"); if (b) b.click(); }); return "Pick the **BikeCAD (.bcad)** file: the new-bike walkthrough checks its numbers before it builds the bike."; }
    // ---- "what reach should I have" (size-dependent)
    if ((m = t.match(/^(?:what|how much|which) (reach|stack) (?:should|do|would|will|can) i\b|^(?:what'?s|what is) (?:the )?right (reach|stack)\b/))) return sizeAdvice(ctx, m[1] || m[2]);
    // ---- "as short as possible" and friends: what limits it
    if ((m = t.match(/\bas (short|long|slack|steep|low|high|light|stiff|small|big|tight) as (?:possible|it can be|it can go|it goes|you can)\b|\b(shortest|minimum|min) (?:possible )?(chain ?stays?|cs)\b/))) {
      if (/\bchain ?stays?|\bcs\b/.test(t) && /short|min/.test(t)) return "The shortest chainstay is set by **tyre room** and **chainring room**. Try a number and read the Builder checks `Tyre to chainstays & yoke` and `Chainring to drive-side chainstay` (want ≥ 6 mm and ≥ 3 mm): e.g. `chainstay 420`, then `what's the weakest point`. A yoke (`yoke length 110`) or S-bend stays let them go shorter; your builder's 3D-printed yoke allowed a shorter stay in one real order.";
      if (/\blight\b/.test(t)) return "Lightest that still passes: the **comfort explorer & optimiser** searches tube sizes for you (`open the comfort explorer`). By hand: `lighter tubes`, then check `what's the weakest point` after each step.";
      return "There's no single “as … as possible” here: each number trades against something (tyre room, toe overlap, pedal strikes, the strength checks). Try a value, then `sanity check my geometry` and `what's the weakest point`.";
    }
    // ---- "mark step 2 done", "I'm done with the checks", "finished designing"
    if ((m = t.match(/^(?:mark |tick )?(?:step )?(1|2|3|4|5|one|two|three|four|five)(?: step)? (?:as )?(?:done|complete|completed|finished|ok)$|^(?:mark|tick) step (1|2|3|4|5|one|two|three|four|five)(?: as)?(?: done| complete| finished)?$|^(?:i'?m |i am |we'?re )?(?:done|finished) (?:with )?(?:the )?(step (?:1|2|3|4|5)|start|design(?:ing)?|checks?|checking|(?:waltly|my builder|the builder|your builder|builder)|builder)(?: step| page)?$|^(?:the )?(design|checks?) (?:is |are )?(?:all )?(?:done|finished|complete)$/)))
      return stepDone(ctx, STEP_WORD[(m[1] || m[2] || (m[3] || "").replace(/^step /, "") || m[4] || "").trim()]);
    if (/^(tick|check|mark) (off )?(all|every)( of)? (the )?checks?( as (done|ok|reviewed))?$|^all (the )?checks are (done|ok|fine|good)$/.test(t)) return tickAllChecks(ctx);

    // ---- "rigid fork with 400 a2c", "140 fork with 44 offset": the fork change, then its number
    if ((m = t.match(/^(.*\bfork\b.*?)\s+with (?:an? )?(\d+(?:\.\d+)?)\s*(?:mm)?\s*(a2c|axle to crown|offset|rake)$/))) {
      const r1x = ctx.inner(m[1]), r2x = ctx.inner(`${/offset|rake/.test(m[3]) ? "fork offset" : "fork a2c"} ${m[2]}`);
      return [r1x, r2x].filter(Boolean).join("\n");
    }
    // ---- "overlay my gravel bike": straight to overlay.js (otherwise "gravel" reads as terrain)
    if (/^(overlay|ghost|show (the |my )?(.+?) (as an overlay|over this|on top))\b/.test(t) && !/^overlay (off|on|solid|fit|differences?|colou?r|opacity|help)\b/.test(t)) {
      const ex = (FC.extra || []).map(h => { try { return h(raw0, t, { apply: ctx.apply, fields: ctx.fields, App: ctx.App }); } catch (e) { return null; } }).find(Boolean);
      if (ex) return ex;
    }
    if (/^(which|what) (bike|design) (am i|are we) comparing( it)? (with|to|against)\??$|^what am i comparing (with|to|against)\??$|^compar(ing|ed) (with|to) what\??$/.test(t)) {
      const sel = document.querySelector("#compareSelect"), o = sel && sel.selectedOptions[0];
      return sel && sel.value ? `Comparing with **${o.textContent.trim()}**. \`stop comparing\` turns it off; \`compare geometry with ${o.textContent.trim().split(" ")[0].toLowerCase()}\` lists the differences.` : "Not comparing with anything. `compare with my gravel bike` (or any bike's name) does.";
    }
    // ---- 3D view moves the chat can't do
    if (/^(spin|rotate|turn|orbit|swivel)( it| the bike| the frame| the model| the view)?( around| round| 360)?$/.test(t)) return "Drag the 3D view to turn it (right-drag or two fingers to pan). Jump to an angle: `side view` · `non drive side` · `3/4 view` · `top view` · `rear view`.";
    if (/^zoom( in| out| closer| further)?$|^(get )?closer$|^make it bigger on (the )?screen$/.test(t)) return "Scroll (or pinch) on the 3D view to zoom. `fullscreen` gives it the whole screen.";
    if (/^(show me |show |go to )?(the )?front( on)?( view)?$|^(look|view) (at it )?from the front$/.test(t)) return "There's no head-on front view. Nearest: `rear view` (end-on from behind), `3/4 view` or `top view`.";
    // ---- "what is the trail in inches"
    if ((m = t.match(/^(?:what(?:'?s| is) )?(?:the |my )?(trail|wheel ?base|front cent(?:re|er)|effective top tube|ett|reach|stack|bb height|bb drop|chain ?stays?|head tube|seat tube)(?: length)? in inches\??$/))) {
      const k = m[1].replace(/\s/g, ""), i = geo(ctx), map = { trail: i.trail, wheelbase: i.wheelbase, frontcentre: i.frontCentre, frontcenter: i.frontCentre, effectivetoptube: i.effectiveTopTube, ett: i.effectiveTopTube, bbheight: i.bbHeight,
        reach: +fv(ctx, "geometry.reach"), stack: +fv(ctx, "geometry.stack"), bbdrop: +fv(ctx, "geometry.bbDrop"), chainstay: +fv(ctx, "geometry.chainstay"), chainstays: +fv(ctx, "geometry.chainstay"), headtube: +fv(ctx, "geometry.headTube"), seattube: +fv(ctx, "geometry.seatTube") };
      const v = map[k]; if (isFinite(v)) return `**${m[1][0].toUpperCase() + m[1].slice(1)}**: ${r1(v)} mm = **${(v / 25.4).toFixed(2)} in**.`;
    }
    // ---- "how big is the down tube", "what wall is the top tube"
    if ((m = t.match(/^(?:how (?:big|thick|wide|fat|heavy)|what(?:'?s| is| are)?(?: the)? (?:size|wall|diameter|od|thickness|gauge)(?: of)?|what (?:size|wall|diameter|od|gauge) (?:is|are)|what(?:'?s| is| are))\s+(?:is |are )?(?:the |my )?(top tube|down tube|seat tube|head tube|chain ?stays?|seat ?stays?|seat ?post)(?: wall| od| diameter| size| tube)?\??$/))) {
      const key = { "top tube": "topTube", "down tube": "downTube", "seat tube": "seatTube", "head tube": "headTube" }[m[1]] || (/chain/.test(m[1]) ? "chainstay" : /stay/.test(m[1]) ? "seatStay" : "seatpost");
      const T = ctx.App.design().tubes[key]; if (T) {
        const sz = T.shape === "biaxial" && T.htH ? `${T.htH}×${T.htW} → ${T.bbH}×${T.bbW} mm (biaxial)` : T.h && T.w ? `${T.h}×${T.w} mm` : `Ø${T.od} mm`;
        return `**${m[1][0].toUpperCase() + m[1].slice(1)}**: ${sz}, wall ${T.wall} mm${+T.buttWall > 0 ? ` (butted: ${T.buttWall} mm ends, ${T.buttLength} mm long)` : ""}${key === "seatpost" && T.type ? ` · ${((ctx.fld("tubes.seatpost.type") || {}).options || []).find(o => o[0] === T.type)?.[1] || T.type}` : ""}. Change: \`${m[1]} ${T.od || 40} x ${T.wall}\`.`;
      }
    }
    // ---- "what fork am I running"
    if (/^(what|which) fork (am i|is it|is on|does it have|have i got)\b|^what'?s the fork\??$/.test(t)) {
      const g = ctx.App.design().geometry, lib = root.FramePartLib, sel = (ctx.App.design().parts || {}).sel || {}, p = lib && sel.fork && lib.raw(sel.fork);
      return `**Fork**: ${p ? p.name + " (drawn in the realistic view)" : "default for the view"} · analysis uses axle-to-crown **${g.forkA2C} mm**, offset **${g.forkOffset} mm**, ${+ctx.App.design().use.forkTravel ? ctx.App.design().use.forkTravel + " mm travel" : "rigid"}. Spec sheet: ${(J() && J().project().spec.fork) || "not decided"}.`;
    }
    // ---- "is the head angle slack?", "is the seat angle steep enough"
    if ((m = t.match(/^(?:is|isn'?t) (?:the |my )?(head|seat) (?:tube )?angle (?:too |very |quite |really )?(steep|slack|ok|okay|normal|fine|steep enough|slack enough)\b/))) {
      const k = m[1] + "Angle", kind = kindFromText(t) || kindOfDesign(ctx), R = KINDS[kind][k], v = valueOf(ctx, k);
      return `**${m[1][0].toUpperCase() + m[1].slice(1)} angle ${v}°**: ${v < R[0] ? "slacker than" : v > R[1] ? "steeper than" : "inside"} the usual ${R[0]}–${R[1]}° for a ${KINDS[kind].name} bike. ${m[1] === "head" ? "Slacker = calmer at speed, steeper = quicker steering." : "Steeper = more over the pedals for climbing."}`;
    }
    // ---- "save this as Gravel V3"
    if ((m = raw0.match(/^\s*save\s+(?:this|it|the design|the bike|my design|my bike)\s*(?:design|bike)?\s+as\s+(?:a\s+new\s+(?:design|bike)\s+)?["“']?(.+?)["”']?\s*$/i))) return ctx.App.saveNew(m[1].trim());
    // ---- deleting saved bikes: "delete bike Gravel V2", "delete this bike", "delete my bikes", "undo delete"
    { const bikeReply = deleteBikeChat(t, raw0, ctx); if (bikeReply) return bikeReply; }
    // ---- "Your builder: the yoke clears a 40T ring" (a message, not a setting)
    if ((m = raw0.match(/^\s*(?:waltly|the builder|builder|sales)\s*:\s*(.+)$/i)) && J() && J().journalOn && !J().journalOn()) return "The build journal is turned **off**, so I didn't log that. Say `turn the journal on` (or Help → Build journal → On) to use it again; nothing was deleted.";
    if ((m = raw0.match(/^\s*(?:waltly|the builder|builder|sales)\s*:\s*(.+)$/i)) && J()) { J().addEntry("from", m[1].trim()); return `**📨 Journal · builder said**: ${m[1].trim()}\n_\`show my journal\` lists it._`; }
    // ---- "add a question about the steerer length"
    if ((m = raw0.match(/^\s*(?:add|make|note|put down|write down)\s+(?:a\s+)?question\s+(?:about|on|re|regarding|for (?:waltly|my builder|the builder|your builder|builder) about)\s+(?:the\s+)?(.+?)\??\s*$/i)) && J()) {
      const q = `What about the ${m[1].trim()}?`, ok = J().addQuestion(q);
      return ok === "dup" ? "That question is already on your list." : `**Question for your builder** (added to the list in step 4): ${q}\n_Reword it in step 4 if you like; \`show my questions\` lists them._`;
    }
    // ---- "engrave my name on the head tube"
    if (/\bengrav(e|ed|ing)\b/.test(t) && !/\?$/.test(raw0.trim()) && !/:/.test(raw0) && J()) {
      const a = J(), opt = a.SPEC.find(f => f.k === "logos").opts.find(o => /engraving/i.test(o));
      if (opt) a.setSpec("logos", opt);
      const txt = raw0.trim().replace(/^./, c => c.toUpperCase());
      if (FC._more && FC._more.setNote) FC._more.setNote(ctx, "engrave", txt);
      const note = `**Note for your builder**: ${txt}`;
      return `**Spec sheet · Logos & engraving**: ${opt ? opt.split(" (")[0] : "engraving"} (~$80 in the 2025 order; send them the image or text)\n` + note;
    }
    // ---- payment methods (before the generic "how do I pay" answer)
    if (/\b(bank transfer|wire transfer|credit card|debit card|visa|mastercard|amex|apple pay|google pay|crypto|cash|pay by card)\b/.test(t)) { const f = faq2(t); if (f) return f; }
    // ---- groupsets → spec sheet crank (+ shifting)
    if ((m = t.match(/^(?:i'?m |i am |i'?ll be |we'?re )?(?:using|running|going with|go with|use|fitting|i use|i have|i'?ll use|groupset:?|group ?set:?|group:?|drivetrain:?)?\s*(shimano|sram|campag(?:nolo)?|campy)?\s*(grx|ultegra|dura ?ace|105|tiagra|sora|claris|deore|slx|xt|xtr|cues|red|force|rival|apex|gx|nx|sx|x01|xx1|xx|x0|eagle|ekar|chorus|record|super record|potenza)((?:\s+(?:di2|axs|etap|eagle|transmission|mechanical|mech|wireless|electronic|1x|2x|12 ?speed|11 ?speed|13 ?speed|t-?type|groupset|group))*)\s*(?:groupset|group|drivetrain)?$/)) && (m[1] || !/^(red|force|record|105|xt|apex|sx|nx|gx|xx)$/.test(m[2] + (m[3] || "")))) {
      const brand = m[1] ? (/^camp/.test(m[1]) ? "Campagnolo" : m[1] === "sram" ? "SRAM" : "Shimano") : (/^(grx|ultegra|dura ?ace|105|tiagra|sora|claris|deore|slx|xt|xtr|cues)$/.test(m[2]) ? "Shimano" : /^(ekar|chorus|record|super record|potenza)$/.test(m[2]) ? "Campagnolo" : "SRAM");
      const extra = (m[3] || "").trim(), name = `${brand} ${m[2].replace(/\b\w/g, c => c.toUpperCase()).replace(/^Grx$/, "GRX").replace(/^Xtr$/, "XTR").replace(/^Slx$/, "SLX").replace(/^Xt$/, "XT").replace(/^Gx$/, "GX").replace(/^Nx$/, "NX").replace(/^Sx$/, "SX").replace(/^Xx1$/, "XX1").replace(/^X01$/, "X01").replace(/^Xx$/, "XX").replace(/^X0$/, "X0")}${extra ? " " + extra.replace(/\baxs\b/, "AXS").replace(/\bdi2\b/, "Di2") : ""}`;
      const a = J(); if (!a) return null;
      a.setSpec("crank", name);
      const out = [`**Spec sheet · Crankset & spindle**: ${name}`];
      const sh = /\b(axs|etap|wireless)\b/.test(extra) || (brand === "SRAM" && /\b(transmission|t-?type)\b/.test(extra)) ? "Wireless (brake hoses only)" : /\b(di2|electronic)\b/.test(extra) ? "Electronic, wired" : /\b(mechanical|mech)\b/.test(extra) ? "Mechanical cables" : null;
      if (sh) { a.setSpec("shifting", sh); out.push(`**Spec sheet · Shifting**: ${sh}`); }
      if (/\b(transmission|t-?type)\b/.test(extra) || /^(eagle)$/.test(m[2]) && /transmission/.test(extra)) out.push("_SRAM Transmission mounts straight to the frame: ask for a **UDH** dropout (`UDH`)._");
      out.push(`_Your builder also needs the **exact chainrings** (\`chainrings: 40T\`) and the BB to suit the spindle (${/SRAM/.test(brand) ? "DUB 28.99 mm" : brand === "Shimano" ? "24 mm" : "check the spindle"}: \`T47\` fits all)._`);
      return out.join("\n");
    }
    // ---- "44mm head tube" / "52mm head tube" = the headset standard, not a 44 mm long head tube (chatmore knows the standards)
    if ((m = t.match(/^(?:a |the )?(44|52|56) ?mm (?:head ?tube|ht)$|^(?:head ?tube|ht) (44|52|56) ?mm$/))) {
      const n = +(m[1] || m[2]);
      return `_(read as the ${n} mm head-tube standard; its length is \`head tube length …\`)_\n` + ctx.inner(n === 44 ? "44mm straight head tube" : n === 52 ? "52/52 head tube" : "44/56 tapered head tube");
    }
    if (/^(a |an )?(tapered|integrated|internal|external|press ?fit|zero ?stack|semi ?integrated) (head ?tube|headset)$/.test(t)) {
      const mtb = +ctx.App.design().use.forkTravel > 0;
      if (/tapered/.test(t)) return ctx.inner(mtb ? "44/56 tapered head tube" : "42/52 integrated headset");
      if (/external|press ?fit/.test(t)) return ctx.inner("44mm straight head tube");
      return "“Integrated” covers a few: `52/52 head tube` (cables through the headset, FSA ACR / Aeroset), `42/52 integrated headset` (road standard), or `44 straight head tube` (classic, external lower cup). Say one and it goes on the spec sheet.";
    }
    // ---- seatpost setback / offset (not the fork's offset)
    if (/\b(seat ?post|post) (setback|set back|offset|layback)\b|\b(setback|layback|zero offset|zero setback|inline|in-line|straight) (seat ?)?post\b/.test(t)) {
      const n = ctx.numbersIn(t)[0];
      if (/\b(zero|inline|in-line|straight)\b/.test(t) || (n && n.v === 0)) return `An inline (zero-setback) post moves the saddle forward by the old post's setback. Cyclic Labs measures **sit bones behind the post clamp** (${fv(ctx, "geometry.saddleSetback")} mm now), so for the same saddle position just leave it; to move the saddle: \`saddle forward 20mm\`.`;
      if (n) return setMany(ctx, [["geometry.saddleSetback", r1(+fv(ctx, "geometry.saddleSetback") + n.v)]], "post setback", `A ${n.v} mm setback post moves the saddle ${n.v} mm further behind the clamp. Say \`undo\` if you meant the saddle was already measured that way.`);
    }
    // ---- flat-landing limit
    if (/\b(flat ?landing|huck to flat|drop to flat)\b.*\b(limit|max|maximum|biggest|how (big|high|far))\b|\b(how (big|high) (a )?(drop|huck)|biggest (drop|huck) it (can|will) take)\b/.test(t) && !/\d/.test(t)) {
      const s2 = ctx.App.summary(); if (!s2) return "The analysis hasn't finished yet; ask again in a second.";
      return `**Flat-landing limit**: about **${s2.landing}**: the biggest drop to flat ground (rider weight on the bike) before a tube starts to yield. Your setting for the biggest drop you'll do: ${fv(ctx, "use.dropHeight") || "auto"} (\`biggest drop 1 m\`).`;
    }
    // ---- fork travel up / down by a number
    if ((m = t.match(/\b(?:fork )?travel (up|down|plus|minus|\+|-) ?(?:by )?(\d+)|\b(more|less) (?:fork )?travel by (\d+)|\b(\d+) ?mm (more|less) (?:fork )?travel\b/)) && ctx.fld("use.forkTravel")) {
      const up = /^(up|plus|\+|more)$/.test(m[1] || m[3] || m[6]), d = +(m[2] || m[4] || m[5]), f = ctx.fld("use.forkTravel");
      const v = +f.get() + (up ? d : -d), o = f.options.reduce((a, b) => Math.abs(b[0] - v) < Math.abs(a[0] - v) ? b : a);
      return setMany(ctx, [["use.forkTravel", o[0]]], "fork", o[0] !== v ? `Nearest option is ${o[1]}.` : null);
    }
    // ---- duplicate and call it …
    if ((m = raw0.match(/^\s*(?:duplicate|copy|clone)\s*(?:this|it)?\s*(?:design|bike)?\s*(?:and|then|,)?\s*(?:call|name|save)\s*(?:it|as)?\s*(?:as)?\s*["“']?(.+?)["”']?\s*$/i))) return ctx.App.saveNew(m[1].trim());
    // ---- print / share / send
    if (/^(print|print (it|this|the summary|summary|the build summary|my build))$/.test(t)) { later(() => J() && J().openSummary()); return "Opened the **build summary**: use its Print button (or Ctrl+P) to print or save as PDF."; }
    if (/^(share|send|email|export) (this|it|the|my) (design|bike|file|project)( to (a friend|someone|my mate|a mate))?$|^(share|send) (it|this) to (a friend|someone|my mate|a mate)$/.test(t)) { later(() => { const b = document.querySelector("#btnExport"); if (b) b.click(); }); return "Exporting the design as a file (check your downloads): send that file; they open it with **Import file** in Cyclic Labs."; }
    if (/^(send|email|mail) (it|this|my request|the request|my design|everything) to (waltly|the builder|my builder|your builder|them)$|^(send|email) (to )?(?:waltly|my builder|the builder|your builder|builder)$/.test(t)) { later(() => J() && J().openRequest()); return "Cyclic Labs doesn't send email itself. I've opened **your request to your builder**: press Copy, paste it into one email to your builder, then say `I sent the request`."; }
    // ---- order log odds and ends
    if (/^(i )?(got|have|had) (a )?(reply|response|answer|email|message) (back )?from (waltly|the builder|my builder|your builder|them)$|^((?:waltly|my builder|the builder|your builder|builder)|they|the builder) (replied|responded|got back to me|answered|emailed( me)?)$/.test(t)) return "Log it so it's kept with this bike: `the builder said …` (paste their words). Questions they asked you? `ask my builder …` keeps your open questions in one list.";
    if ((m = raw0.match(/\b(?:they|waltly|the builder)\s+quoted\s+(?:me\s+)?(?:us\s?)?(\$?\s?[\d,.]+\s*(?:usd|\$|dollars)?)|\bquote\s+(?:is|was|came (?:in )?at|of)\s+(\$?\s?[\d,.]+\s*(?:usd|\$|dollars)?)/i)) && J()) {
      J().addEntry("from", `Quote: ${(m[1] || m[2]).trim()}`);
      return `**${J().journalOn && !J().journalOn() ? "Noted" : "📨 Journal · builder said"}**: Quote: ${(m[1] || m[2]).trim()}\n_Next: the 50% deposit by PayPal Goods & Services; say \`I paid the deposit\` when it's done._`;
    }
    if ((m = raw0.match(/\btracking(?: number| no\.?| #| code)?\s*(?:is|:)?\s*([A-Z0-9]{8,})\b/i)) && J()) {
      J().addEntry("note", `Tracking number: ${m[1]}`); J().setAfter("ship", true);
      return `**${J().journalOn && !J().journalOn() ? "Noted" : "📝 Journal"}**: Tracking number ${m[1]}\n✅ **Shipped** ticked in step 5. _Tracking can take 1–6 days to show (shipping agent)._`;
    }
    if (/\b(frame|it) (is|has been|got) (welded|built|finished|done)\b|\b(welding|production) (is )?(done|finished|complete)\b/.test(t) && !/\b(design|check|step|said|says|told|wrote|replied|emailed)\b/.test(t) && J()) {
      J().addEntry("from", raw0.trim().replace(/^./, c => c.toUpperCase())); J().setAfter("build", true);
      return (J().journalOn && !J().journalOn() ? "" : "**📨 Journal**: " + raw0.trim() + "\n") + "✅ **Production** ticked. _Next they send a finish proof, then finished-frame photos before the balance._";
    }
    if (/\b(drawing number|drawing no\.?|drawing #)\b/.test(t) && /\b(set|is|=|to)\b/.test(t)) { later(() => FJ() && FJ().go("final")); return "The drawing number you approve is typed in **step 5** (box above “Mark as approved”), from the drawing's title block. Opening step 5."; }
    if (/^(un ?approve|undo (the )?approval|cancel (the )?approval|unapprove (the )?drawing|i didn'?t approve( it)?( yet)?)$/.test(t)) { later(() => FJ() && FJ().go("final")); return "Approval is undone with the **Undo approval** button in step 5 (two clicks, so it's deliberate). Opening step 5."; }
    if (/\bwhat (did|has|have) (waltly|the builder|my builder|your builder|they|sales) (say|said|replied|reply|told me|written|write)\b|\b(messages|last message|latest message|replies) from (waltly|the builder|my builder|your builder|them)\b/.test(t) && J()) {
      const j = J().project().journal.filter(e => e.kind === "from").slice(-5).reverse();
      if (!j.length) return "Nothing from your builder in the journal yet. Log their replies with `the builder said …`.";
      return "**What your builder said** (newest first):\n" + j.map(e => `• ${new Date(e.at).toLocaleDateString()}: ${e.text}`).join("\n") + "\n_`show my journal` has everything._";
    }
    if ((m = t.match(/^(?:when|what day|what date) (?:did|was) (?:i |we |it |the |my )?(pay(?:ing)? the deposit|paid the deposit|deposit paid|pay the balance|paid the balance|send the request|sent the request|request sent|get the (?:first )?drawing|first drawing|approve|approved|approval|confirm the drawing|production start|it ship|ship|shipped|it arrive|arrive|the frame arrive)\??$|^how long (?:ago|since) (?:did )?(?:i |we )?(pay the deposit|paid the deposit|send the request|sent the request|get the first drawing|approve|approved|it shipped|ship)\??$/)) && J()) {
      const q = m[1] || m[2], pr = J().project();
      const map = [[/deposit/, "process", "quote", "the deposit"], [/balance/, "after", "photos", "the balance"], [/request/, "process", "request", "the request"], [/drawing/, "process", "r1", "the first drawing"], [/approv|confirm/, "process", "approve", "the approval"], [/production/, "after", "build", "production"], [/ship/, "after", "ship", "shipping"], [/arriv/, "after", "arrived", "the frame arriving"]];
      const hit = map.find(([re]) => re.test(q)); if (!hit) return null;
      const d = (pr[hit[1]] || {})[hit[2]];
      if (!d) return `No date for ${hit[3]} yet: it isn't ticked. Say e.g. \`${hit[2] === "quote" ? "I paid the deposit" : hit[2] === "request" ? "I sent the request" : hit[2] === "r1" ? "got the first drawing" : hit[2] === "ship" ? "frame shipped" : hit[2] === "arrived" ? "it arrived" : "production started"} on 2026-10-01\`.`;
      const days = Math.round((Date.now() - new Date(d + "T12:00:00").getTime()) / 864e5);
      return `${hit[3][0].toUpperCase() + hit[3].slice(1)}: **${new Date(d + "T12:00:00").toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}** (${days <= 0 ? "today" : days === 1 ? "yesterday" : days + " days ago"}).`;
    }

    // ---- "top tube 580" is the effective top tube; "down tube 650" can't be set directly
    if ((m = t.match(/^(?:set |make |change )?(?:the |my )?(top tube|tt|toptube)(?: length)?(?: to| =| is| of| at)?\s*(\d+(?:\.\d+)?)\s*(mm|cm)?\s*(?:long|length)?$/)) && (+m[2] >= 200 || m[3] === "cm"))
      return ctx.inner(`effective top tube ${m[3] === "cm" ? +m[2] * 10 : +m[2]}`);
    if ((m = t.match(/^(?:set |make |change )?(?:the |my )?(down tube|seat stays?|dt|ss)(?: length)?(?: to| =| is| of)?\s*(\d{3}(?:\.\d+)?)\s*(mm)?$/))) {
      const i = geo(ctx), dt = i.frontTriangle && i.frontTriangle.downTube;
      return `The ${/^d/.test(m[1]) ? "down tube" : "seat stays"}' length isn't a setting: it follows from the geometry${dt && /^d/.test(m[1]) ? ` (the down tube is **${Math.round(dt)} mm** now, head tube to BB)` : ""}. Change reach, stack, head angle or chainstay instead, e.g. \`reach +10\`. For its diameter and wall: \`${/^d/.test(m[1]) ? "down tube" : "seat stays"} 44.5 x 1.0\`.`;
    }
    // ---- shaped tubes that the your builder list doesn't have
    if (/\b(oval|ovali[sz]ed|biaxial|teardrop|tear drop|aero|shaped|square|hex|hydroformed|flattened|ovalised)\b/.test(t) && (m = t.match(/\b(top tube|seat tube|head tube|tt|ht)\b/)) && !/\b(down tube|chain ?stays?|seat stays?)\b/.test(t))
      return `Cyclic Labs draws and analyses the ${m[1].replace(/^tt$/, "top tube").replace(/^ht$/, "head tube")} as a round tube; your builder's tube list only has shaped **down tubes, seat stays and chainstays** (e.g. \`44 teardrop down tube\`, \`oval chainstays\`). To ask anyway: \`note for my builder: ${t.match(/\b(oval|ovali[sz]ed|biaxial|teardrop|tear drop|aero|shaped|square|hex|hydroformed|flattened)\b/)[1]} ${m[1].replace(/^tt$/, "top tube").replace(/^ht$/, "head tube")}\`.`;

    // ---- "is 460 reach too long?", "is a 64 head angle too slack for gravel" → advice only, nothing changes
    if (/^(is|isn'?t|would|will|wouldn'?t|is a|is an|are)\b/.test(t) && /\b(too|ok|okay|fine|normal|reasonable|sensible|crazy|extreme|weird|good|bad|right|enough|long|short|slack|steep|high|low|much|little)\b/.test(t) && /\d/.test(t) && !/\b(pass|strong|toe|clear|fit|heavy|deposit|paid|shipped|sent)\b/.test(t)) {
      const k = keyFromText(t), n = ctx.numbersIn(t);
      if (k && n.length) {
        const v = n[0].v;
        if (k === "reach" || k === "stack") return sizeAdvice(ctx, k) + `\n_${v} would be ${v - +fv(ctx, "geometry." + k) >= 0 ? "+" : ""}${r1(v - +fv(ctx, "geometry." + k))} mm from now: say \`${k} ${v}\` to try it (\`undo\` takes it back)._`;
        const kind = kindFromText(t) || kindOfDesign(ctx), R = KINDS[kind][k], u = k.endsWith("Angle") ? "°" : "mm";
        if (!R) return null;
        const verdict = v < R[0] ? (k.endsWith("Angle") ? "slacker / lower than" : "below") : v > R[1] ? (k.endsWith("Angle") ? "steeper than" : "above") : "inside";
        const cmd = k === "trail" ? `trail ${v}` : `${RANGE_NAME[k]} ${v}`;
        return `**${v}${u === "°" ? "°" : " mm"} ${RANGE_NAME[k]}** is ${verdict} the usual ${fmtR(k, R, u)} for a ${KINDS[kind].name} bike (now: ${r1(valueOf(ctx, k))}${u === "°" ? "°" : " mm"}). Outside isn't wrong for a custom frame, just unusual: know why you want it. Say \`${cmd}\` to try it.`;
      }
    }
    // ---- "what's a good / typical / normal head angle for gravel", "typical chainstay for a hardtail"
    if (/\b(good|typical|normal|usual|common|recommended|standard|sensible|average|ideal|best)\b/.test(t) && /^(what('?s| is| are)?|whats|typical|normal|usual|recommended|good|ideal|best|average|what would be)\b/.test(t)) {
      const k = keyFromText(t);
      if (k === "reach" || k === "stack") return sizeAdvice(ctx, k);
      if (k) {
        const kind = kindFromText(t) || kindOfDesign(ctx), R = KINDS[kind][k], u = k.endsWith("Angle") ? "°" : "mm";
        if (R) return `A typical **${RANGE_NAME[k]}** for a ${KINDS[kind].name} bike is **${fmtR(k, R, u)}** (production bikes; rough). This design: ${r1(valueOf(ctx, k))}${u === "°" ? "°" : " mm"}.` + (kindFromText(t) ? "" : ` _(Guessed ${KINDS[kind].name} from this design; add “for road / gravel / XC / trail / enduro” to ask about another kind.)_`);
      }
    }
    // ---- sanity check
    if (/\b(sanity ?check|is (my|the|this) (geometry|geo|design|bike) (normal|ok|okay|sensible|reasonable|weird|sane|right|good)|check (my|the) (geometry|geo)|anything (weird|odd|unusual|wrong) (about|with|in) (my|the) (geometry|geo|design)|does (my|the) (geometry|geo) make sense|how does (my|the|this) (geometry|geo) compare)\b/.test(t)) {
      const kind = kindFromText(t) || kindOfDesign(ctx), K = KINDS[kind];
      const rows = RANGE_FIELDS.map(([k, , u]) => { const v = valueOf(ctx, k), R = K[k]; if (!R || !isFinite(v)) return null; const ok = v >= R[0] && v <= R[1];
        return `${ok ? "✓" : "⚠"} ${RANGE_NAME[k]} ${r1(v)}${u === "°" ? "°" : " mm"} (usual ${fmtR(k, R, u)})`; }).filter(Boolean);
      const odd = rows.filter(r => r[0] === "⚠").length;
      return `**Against typical ${K.name} bikes** (rough ranges; custom frames often step outside on purpose):\n${rows.join("\n")}\n_${odd ? `${odd} outside the usual range: fine if that's the point, otherwise ask \`what's a good ${rows.find(r => r[0] === "⚠").slice(2).split(" ")[0]} for ${kind}\`.` : "Everything is in the usual range."} Reach and stack depend on your size: compare with a bike that fits (\`overlay my current bike\`)._`;
    }

    // ---- results in words
    if (!/\b(i|i'?m|rider|my weight|bike weight|weigh \d)\b/.test(t) && /\b(too heavy|how heavy|heavy is it|frame weight|weight of (the |my )?(frame|tubes)|how much (does|will) (it|the frame|this) weigh|what does (it|the frame) weigh|is it heavy|lightweight enough|light enough)\b/.test(t)) return weightAnswer(ctx);
    if (/\b(weakest|weak (point|spot|link)|highest stress|most stress(ed)?|where (would|will|does) it (break|crack|fail)|what (fails|is failing|will fail|breaks|would break)|which (test|tests|part) fails?|why (does|did|is) it fail(ing)?|critical (spot|point|joint)|where('?s| is) it weakest)\b/.test(t)) return weakest(ctx);
    if (/\b(how stiff|is it stiff|stiff enough|stiffness)\b/.test(t) && !/\b(stiffness \(e\)|material|\d)\b/.test(t)) return stiffAnswer(ctx);
    if (/\b(how comfortable|is it comfortable|comfy enough|how comfy|comfort (rating|level)|how (harsh|plush|smooth) (is it|will it be)|will it be (harsh|comfortable|plush))\b/.test(t)) return comfortAnswer(ctx);

    // ---- riders described in words
    if (/^(i'?m|i am) (a )?(heavy|big|bigger|large|clydesdale|heavier)( rider| guy| girl| person| dude)?$|^(heavy|big|clydesdale) rider$/.test(t))
      return "Rider weight is what sets the tube sizes here, so tell me the number: `I weigh 105 kg` (or `230 lb`, `16 stone`). It's " + fv(ctx, "rider.riderKg") + " kg now. Carrying loads too? `bikepacking bags` or `rack and panniers` puts it on the spec sheet.";
    if (/^(i'?m|i am) (a )?(light|lightweight|small|light ?weight|skinny)( rider| guy| girl| person)?$/.test(t))
      return "Tell me the number: `I weigh 60 kg` (or `130 lb`). Rider weight is " + fv(ctx, "rider.riderKg") + " kg now, and it sets how thin the tubes can go.";
    if (/^(i'?m|i am) (a )?(beginner|novice|new rider|new to (riding|mtb|cycling|this|bikes))\b/.test(t) && ctx.fld("use.aggression"))
      return setMany(ctx, [["use.aggression", 0.8]], "rider", "Smooth riding style (this only changes the strength loads). For the shape, `help me figure out what I want` asks a few plain questions.");

    // ---- open a design by name ("load the gravel bike", "switch to the canyon", "pull up my hardtail")
    if ((m = t.match(/^(?:load|switch to|swap to|pull up|bring up|open up|go to|open|show me|take me to)\s+(?:the |my |that |our )?(.+?)(?:\s+(?:bike|design|build|one|frame))?$/)) && !/\b(panel|window|page|step|sheet|journal|garage|settings|tab|tubes?|geometry|wheels|spec|request|summary|checklist|toe|lab|iso|stress|parts|stays|bends|seatpost|post|riding|rider|bikes|sag|fork sag|bottles?|cages?|bosses|chat|help|tour|scanner|scan|drawing|calculix|explorer|comfort|joints|start|design|check|final|(?:waltly|my builder|the builder|your builder|builder)|questions|notes|view|mode|overlay|file|bikecad|chart|size|new)\b/.test(m[1])) {
      const d = ctx.matchDesign(m[1]);
      if (d && d.id !== ctx.App.currentId()) { ctx.App.openDesign(d.id); ctx.hist.length = 0; return `Opened **${d.name}**.`; }
      if (d) return `**${d.name}** is already open.`;
    }
    // ---- parts by name / kind: "use a Fox 32 fork", "swap to drop bars", "flat bars", "remove the dropper"
    if (root.FramePartLib && !/\b((?:waltly|my builder|the builder|your builder|builder)|ti fork|titanium fork|own fork|spec|note)\b/.test(t)) {
      for (const [re, id, when] of BAR_KIND) if (re.test(t) && !/\d/.test(t) && !/\b(width|wide|rise|sweep|reach|flare)\b/.test(t) && when(ctx)) {
        const p = root.FramePartLib.raw(id(t)); if (p) return pickPart(ctx, p, "Bar type for the 3D view and fit; the frame doesn't change. Sizes: `bar width 440`, `stem 90`.");
      }
      if (VERB_PART.test(t) && /\b(fork|stem|bar|bars|cockpit|crank|crankset|wheels?|tyres?|tires?|saddle|pedals?|brakes?|post|seatpost)\b/.test(t)) {
        const p = partByName(ctx, t);
        if (p) return pickPart(ctx, p, p.cat === "fork" ? "The 3D view and fit use it. For the analysis, its axle-to-crown and offset: `fork a2c …`, `fork offset …` (or the parts panel's “Use this fork in the analysis”)." : "");
        // a named fork Cyclic Labs doesn't have: say so, don't call it your builder's
        const mm2 = t.match(/\b(?:use|fit|put|go with|run|try|want|install)\s+(?:a |an |the |my )?([a-z0-9][a-z0-9 .'-]*?)\s+(?:carbon |ti |titanium |steel |alloy )?fork\b/);
        if (mm2 && !/^(carbon|ti|titanium|steel|alloy|rigid|suspension|longer|shorter|\d+ ?mm|different|new|other)$/.test(mm2[1].trim())) {
          if (J()) J().setSpec("fork", (J().SPEC.find(f => f.k === "fork").opts.find(o => /^My own/.test(o))) || "My own fork");
          return `The parts library has no **${mm2[1].trim()}** fork, so it isn't drawn. On the spec sheet: **Fork → My own fork**. Give your builder its numbers in the notes (\`spec notes: ${mm2[1].trim()} fork, A2C …, offset …\`) and set them here: \`fork a2c 395\`, \`fork offset 47\`.`;
        }
      }
    }
    if (/^(?:remove|ditch|lose|delete|get rid of|take off|no more)\s+(?:the |my |a )?dropper(?: post)?$|^no dropper(?: post)?$|^(?:rigid|fixed|normal|regular|non ?dropper) (?:seat ?)?post$/.test(t) && ctx.fld("tubes.seatpost.type")) {
      const cur = fv(ctx, "tubes.seatpost.type"), to = cur === "dropper309" ? "carbon316" : /27/.test(String(cur)) ? cur : "carbon316";
      if (!/dropper/.test(String(cur))) return `There's no dropper on this design (${ctx.fld("tubes.seatpost.type").options.find(o => o[0] === cur)?.[1] || cur}).`;
      const r = setMany(ctx, [["tubes.seatpost.type", to]], "post", cur === "dropper309" ? "There's no rigid 30.9 preset, so it's a carbon 31.6 post: say `seatpost 27.2` or set the OD if your seat tube is 30.9." : "");
      try { if (J()) J().setSpec("dropper", "None"); } catch (e) {}
      return r + "\n_Spec sheet: Dropper post → None._";
    }

    // ---- "same for the stack", "stack too", "do the same to the chainstays"
    if ((m = t.match(/^(?:and )?(?:the )?same (?:for|to|on|with) (?:the |my )?(.+)$|^(?:do |make )?the same (?:change )?(?:for|to|on|with) (?:the |my )?(.+)$|^(?:and )?(?:the |my )?(.+?) too$|^(?:and )?(?:the |my )?(.+?) as well$/)) && ctx.state.last && ctx.state.last.items && ctx.state.last.items.length === 1) {
      const it = ctx.state.last.items[0], f0 = ctx.fld(it.id), q = (m[1] || m[2] || m[3] || m[4] || "").trim();
      const f = P.topField(ctx, q, x => x.kind === "num");
      if (f0 && f && f.id !== f0.id && f0.kind === "num" && isFinite(+it.now - +it.old)) {
        const delta = +it.now - +it.old;
        const unitOk = (f.unit || "") === (f0.unit || "");
        if (!unitOk) return `Last change was ${delta > 0 ? "+" : ""}${r1(delta)} ${f0.unit} on ${f0.label}; ${f.label} is in ${f.unit || "other units"}, so tell me the number: \`${f.label.toLowerCase()} …\`.`;
        return setMany(ctx, [[f.id, r1(+f.get() + delta)]], "same", `Same change as ${f0.label} (${delta > 0 ? "+" : ""}${r1(delta)} ${f0.unit}).`);
      }
    }
    // ---- "what's different from the saved version", "compare to the original"
    if (/^(what'?s|what is|whats|show( me)?) (different|changed) (from|since|compared to|vs) (the )?(saved|original|last save|start)( version| design)?\??$|^compare (it )?(to|with|against) (the )?(original|saved( version)?|last save)$|^(changes|differences) (since|from) (the )?(save|saved|original|last save)$|^what did i change since/.test(t))
      return ctx.inner("what changed");
    // ---- "how do I change the reach"
    if ((m = t.match(/^how (?:do|can|would|should) (?:i|you|we|one) (?:change|set|adjust|edit|alter|modify|increase|decrease|raise|lower|make)\s+(?:the |my |a )?(.+?)(?: (?:longer|shorter|bigger|smaller|higher|lower|steeper|slacker))?\??$/))) {
      const f = P.topField(ctx, m[1]);
      if (f) {
        const v = f.get(), num = f.kind === "num", ex = num ? `\`${f.label.toLowerCase().replace(/\s*\(.*?\)/g, "")} ${isFinite(+v) ? r1(+v + (f.unit === "°" ? 1 : 10)) : "…"}\`, \`${f.label.toLowerCase().replace(/\s*\(.*?\)/g, "")} +${f.unit === "°" ? 1 : 10}\`, \`a bit more ${f.label.toLowerCase().replace(/\s*\(.*?\)/g, "")}\`` : `\`${f.options.slice(0, 3).map(o => o[1].toLowerCase()).join("` · `")}\``;
        return `Type it here: ${ex}. It's **${ctx.fmtV(v, f)}** now. It's also in the **${f.group}** panel (\`open ${/tube/i.test(f.group) ? "tubes" : /riding/i.test(f.group) ? "riding" : /rider|material|loads/i.test(f.group) ? "rider" : /parts/i.test(f.group) ? "parts" : /toe/i.test(f.group) ? "toe overlap" : /bent/i.test(f.group) ? "bends" : /stay/i.test(f.group) ? "stays" : /seatpost/i.test(f.group) ? "seatpost" : /joint|drivetrain/i.test(f.group) ? "wheels" : "geometry"}\`).`;
      }
    }
    // ---- "make the top tube level" (horizontal top tube)
    if (/\b(level|horizontal|flat|straight) top ?tube\b|\btop tube (level|horizontal|flat)\b|\bmake the top tube (level|horizontal|flat)\b/.test(t) && ctx.fld("geometry.ttAtSeatTube")) {
      const g = ctx.App.design().geometry, sta = (+(geo(ctx).seatTubeAngleReal || g.seatAngle)) * Math.PI / 180;
      const y = +g.stack - (+g.ttBelowHtTop || 0), L = Math.round(y / Math.sin(sta)), above = Math.max(20, (+g.seatTube || 0) - (+g.ttAtSeatTube || 0));
      const pairs = [["geometry.ttAtSeatTube", L]]; if (L + above > +g.seatTube) pairs.push(["geometry.seatTube", L + above]);
      return setMany(ctx, pairs, "level top tube", `Top tube now meets the seat tube ${L} mm from the BB, level with where it leaves the head tube${pairs.length > 1 ? `; the seat tube grew to keep ${above} mm above the joint` : ""}. Less standover, though: \`sloping top tube\` or \`more standover\` drops it again.`);
    }
    return null;
  };

  // ---------------------------------------------------------------- 8. fallbacks (only when nothing else understood the sentence)
  const FALLBACK = (raw0, t, ctx) => {
    let m;
    const f2 = faq2(t); if (f2) return f2;
    // conversation
    if (/^(ok|okay|k|kk|alright|all right|fine|good|great|got it|gotcha|understood|makes sense|sounds good|sounds great|sure|yeah|yea|yep|yup|cool|nice|lovely|brilliant|right)[.! ]*$/.test(t)) return "👍 What next? (`help` lists ideas, `undo` takes back the last change.)";
    if (/^(no|nope|nah|no thanks|not really|never ?mind|forget it|leave it)[.! ]*$/.test(t)) { ctx.state.pending = null; return "OK, nothing changed."; }
    if (/^(how are you|how'?s it going|how are things|you ok|are you there|hello\?|anyone there)\b/.test(t)) return "All good, running offline in your browser. What shall we change?";
    if (/^(lol|haha+|hehe|lmao|😂|🙂|😀|:\)|:d)$/.test(t)) return "😄 Anything to change?";
    if (/^(what|huh|eh|sorry|pardon|come again|i don'?t (understand|get it)|confused|i'?m (confused|lost)|what now|what do i do|what can i (ask|say|type|do)|examples?|ideas|show me examples|give me (some )?examples)\??[.!]*$/.test(t))
      return "Some things to try:\n• `reach 460` · `head angle 1° slacker` · `29 x 2.4 tyres` · `beef up the down tube`\n• `what's the trail?` · `sanity check my geometry` · `what's the weakest point`\n• `go to step 3` · `what's missing on the spec` · `write my request`\n• `undo` takes back the last change. `help` and `more help` list lots more.";
    if (/\b(you'?re|this is|that'?s) (dumb|stupid|useless|rubbish|garbage|broken|bad|terrible)\b|\bdoesn'?t work\b|\bnot working\b/.test(t))
      return "Sorry about that. I'm an offline phrasebook, not an AI, so some phrasings miss. Using the setting's name usually works (`reach 460`, `list fields` shows them all). If a sentence ought to work, note it down so it can be added.";
    if (/^(that'?s |that is |no,? )?(wrong|not right|incorrect|not what i (meant|wanted)|wrong (one|setting|thing)|not that( one)?)[.! ]*$/.test(t)) {
      if (ctx.hist.length && ctx.undo()) return "Undone. Say it again with the setting's full name (e.g. `chainstay length 440`); `list fields` shows every name.";
      return "Nothing to undo. Try the setting's full name, e.g. `chainstay length 440`; `list fields` shows them all.";
    }
    if (/^(what was it|what was that|what was the (old|previous|last) (value|number|one)|what did it used to be|what was it before|previous value|old value)\b/.test(t)) {
      const L = ctx.state.last && ctx.state.last.items;
      if (L && L.length) return L.map(it => { const f = ctx.fld(it.id); return f ? `**${f.label}** was ${ctx.fmtV(it.old, f)} (now ${ctx.fmtV(it.now, f)}).` : ""; }).join("\n") + "\n_`undo` puts it back._";
      return "I don't have a last change to compare (`what changed` lists everything since the last save).";
    }
    if (/^why\b/.test(t)) { const w = whyAnswer(ctx, t); if (w) return w; }
    if (/\b(knock ?-?on|knock on)\b/.test(t)) return "The _Knock-on_ line lists the numbers that are **worked out** from what you changed (wheelbase, trail, effective top tube, BB height), so you see the side effects straight away. `why did the trail change` explains each one.";
    if (/^(make|i want) (the bike|it|the frame) (longer|shorter)$|^(longer|shorter) bike$/.test(t)) {
      const lo = /longer/.test(t);
      return `${lo ? "Longer" : "Shorter"} where? \`reach ${lo ? "+" : "-"}10\` (${lo ? "roomier" : "tighter"} when standing; changes fit) · \`chainstay ${lo ? "+" : "-"}10\` (${lo ? "calmer, more planted" : "livelier"} rear) · \`head angle 1° ${lo ? "slacker" : "steeper"}\` (${lo ? "calmer" : "quicker"} steering). Each shows the new wheelbase.`;
    }
    if (/^(make it|i want it|make the bike) (faster|quicker|racier|more racy|speedier)$|^(faster|racier) bike$/.test(t)) return "Faster usually means: a lower front (`more aggressive position`), lighter tubes (`lighter tubes`, then check `what's the weakest point`), narrower or faster tyres (`45mm tyres`), and quicker steering (`quicker steering`). Pick one and I'll make the change.";
    if (/\b(frame ?bag|half ?frame bag|bigger (main |front )?triangle|more room in the (main |front )?triangle)\b/.test(t)) return `A bigger frame bag needs a bigger main triangle: a less sloping top tube (\`make the top tube level\`, or \`lower the top tube -20mm\` raises it), a longer seat tube, or a straight top tube line. Inside the triangle now: seat tube ${Math.round((geo(ctx).frontTriangle || {}).seatTubeInside || 0)} mm, top tube ${Math.round((geo(ctx).frontTriangle || {}).topTube || 0)} mm. Tell your builder too: \`note for my builder: room for a full frame bag, top-tube bag bolts\`.`;
    if (/\b(monster ?cross|monstercross|drop ?bar mtb|drop bar mountain bike)\b/.test(t)) return "A monstercross is gravel geometry with mountain-bike tyres and drop bars: `make it a gravel bike`, then `29 x 2.2 tyres` and `drop bars`, and check tyre room (`what's the weakest point` shows the Builder checks).";
    if (/^(\d{1,2}) ?(speed|spd|sp)$|^(\d{1,2}) ?speed (cassette|drivetrain|groupset)$/.test(t)) return "The number of speeds doesn't change the frame. What does: **1× or 2×** (`1x only` / `front derailleur mount`), **UDH** for SRAM Transmission (`UDH`), the **exact chainrings** (`chainrings: 40T`) and the BB (`T47`).";
    // which design is open
    if (/^(which|what) (bike|design|frame) (is (this|open|loaded)|am i (on|in|editing|looking at))|^(current|this) (bike|design)\??$|^what am i (working on|editing|looking at)/.test(t))
      return `This is **${ctx.App.designName()}**${ctx.App.isEdited() ? " (edited, not saved: `save changes` or `save as <name>`)" : ""}. \`list my bikes\` shows the others.`;
    // reset
    if (/^(reset|reset (it|all|everything|the design|this|to default|to defaults|to saved|back)|start again|back to (default|saved|the start))[.! ]*$/.test(t)) return ctx.inner("reset everything");
    // sizes
    if (/^(?:make it |go |change it to |set (?:it )?(?:to )?)?(?:a )?size (xs|s|m|l|xl|xxl|small|medium|large|extra large|\d{2})$|^(?:make it )?(?:a )?(small|medium|large|extra large)( size| frame)?$/.test(t))
      return "Cyclic Labs designs one custom size, so there's no size dial. To start from a typical size: `new gravel bike size L` (or `start from a size`). To move this one: `size up` / `size down`, or set reach and stack.";
    if (/\b(what|which) size (do i|should i|am i|would i|frame do i)\b|\bwhat size (frame|bike)\b|\bsize me\b/.test(t)) {
      later(() => J() && J().act("discover"));
      return "Opening **Help me figure out what I want**: four quick questions (riding, feel, height, a bike that fits) and it suggests a size. Or `fit me a 32er`/`inseam 86 cm` for numbers.";
    }
    // riding in words
    if (/\b(bit of everything|all ?rounder|mixed (riding|terrain)|everything|all sorts|a mix)\b/.test(t) && /\b(ride|riding|i do|use|for)\b/.test(t))
      return "Set the terrain to the **roughest** riding it will see, since that's what the strength checks need: `terrain road` · `terrain gravel` · `terrain XC` · `terrain trail` · `terrain bike park`.";
    // standover target
    if ((m = t.match(/\bstand ?over\b.*?(\d{3})/))) return `Cyclic Labs doesn't set standover directly. Lower it by dropping where the top tube meets the seat tube: \`lower the top tube 20mm\` (or \`more standover\`); reach and stack stay put.`;
    // journey odds and ends
    if (/^(copy|grab|get) (the |my )?(request|email|message)( to (?:waltly|my builder|the builder|your builder|builder))?$/.test(t)) { later(() => J() && J().openRequest()); return "Opened **your request to your builder**: press **Copy** at the bottom, then paste it into one email."; }
    if (/\b(bike i like|bike i (own|ride|have)|geometry chart|geo chart|paste (a |the )?(chart|geometry)|copy (the )?geometry (from|of) a)\b/.test(t)) { later(() => J() && J().act("copy")); return "Opening the new-bike walkthrough on **paste a geometry chart**: copy the bike's chart from its maker's website and paste it in."; }
    if (/\b(bikecad|\.bcad)\b/.test(t)) { later(() => { const b = document.querySelector("#btnImport"); if (b) b.click(); }); return "Pick the **BikeCAD (.bcad)** file: the walkthrough checks its numbers before building the bike."; }
    if (/\b(start|begin) (from|with) (a |the )?(typical )?size\b|\bpick a size\b/.test(t)) { later(() => J() && J().act("size")); return "Opening the new-bike walkthrough on **start from a typical size**."; }
    if (/\b(type|enter|put) (in )?(my |the )?(own )?(numbers|geometry)\b/.test(t)) { later(() => J() && J().act("numbers")); return "Opening the new-bike walkthrough on **type the numbers in**."; }
    if (/\b(cable stops?|cable guides?|external guides?|zip ?tie (guides|mounts))\b/.test(t)) { if (FC._more && FC._more.setNote) FC._more.setNote(ctx, "cablestops", "External cable stops / guides (say where)"); return "**Note for your builder**: External cable stops / guides (say where)"; }
    // anything about your builder, money, time
    if (/\b((?:waltly|my builder|the builder|your builder|builder)|order|price|cost|pay|ship|deliver|drawing|production)\b/.test(t)) return "I don't have that one. Try `order help` for everything about ordering, or ask a narrower question (`how long does production take?`, `how do I pay?`, `what's included?`). Or add it to your list for your builder: `ask my builder " + raw0.replace(/\?+\s*$/, "").replace(/^\s*(do|does|can|will|is|are) (they|(?:waltly|my builder|the builder|your builder|builder)) /i, "whether they ") + "`.";
    return null;
  };

  // ---------------------------------------------------------------- 9. when nothing worked: suggestions on the same topic
  const TOPICS = [
    [/\b(tyre|tire|wheel|rim|clearance)/, "`29 x 2.4 tyres` · `700x45` · `tyre clearance 8` · `make it a mullet`"],
    [/\b(fork|a2c|offset|rake|travel|suspension)/, "`fork a2c 540` · `fork offset 47` · `140mm fork` · `rigid fork` · `use the Pike 140 fork`"],
    [/\b(tube|wall|od|diameter|butted|thick|thin)/, "`down tube 44.5 x 1.2` · `top tube wall 0.9` · `beef up the down tube` · `butted down tube 1.2/0.9/1.2`"],
    [/\b(stem|bar|bars|spacer|cockpit|handlebar)/, "`stem 70` · `bars 780 wide` · `20mm of spacers` · `slam the stem` · `drop bars`"],
    [/\b(saddle|seat|post|dropper)/, "`saddle height 750` · `raise the saddle 5mm` · `27.2 carbon post` · `remove the dropper`"],
    [/\b(gear|ring|cog|crank|chain)/, "`42/18` · `36t chainring` · `170mm cranks` · `boost chainline`"],
    [/\b(spec|order|(?:waltly|my builder|the builder|your builder|builder)|drawing|deposit|ship|request)/, "`what's missing on the spec` · `write my request` · `order progress` · `order help`"],
    [/\b(step|page|window|panel|open|show|go)/, "`go to step 3` · `open the tubes panel` · `toe overlap` · `close this`"]
  ];
  const AFTER4 = {
    after(raw0, r, ctx) {
      if (typeof r !== "string" || !/^I'm not sure which setting you mean/.test(r)) return null;
      const t = ctx.norm(raw0), hit = TOPICS.find(([re]) => re.test(t));
      return hit ? `_On that topic you can say: ${hit[1]}._` : "_Some ideas: `reach 460` · `slacker head angle` · `29 x 2.4 tyres` · `what's the weakest point` · `go to step 3` · `examples`._";
    }
  };

  // ---------------------------------------------------------------- hook into chat.js
  FC.early = [EARLY_FIRST].concat(FC.early || []);
  FC.fallback = (FC.fallback || []).concat([FALLBACK]);
  FC.after = (FC.after || []).concat([AFTER4]);
  FC._extra = { pre4, KINDS, kindOfDesign, kindFromText, FAQ2, weakest, partByName };
})(typeof window !== "undefined" ? window : globalThis);
