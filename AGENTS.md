# Instructions for AI assistants (Claude, ChatGPT/Codex, and others)

Cyclic Labs is an offline, in-browser tool for designing a custom titanium bike frame:
geometry, 3D view, overlay against a current bike, builder checks, rough engineering
estimates, and a plain-text design chat (no AI model inside the app).

## Who you are probably helping

Most people opening this folder are cyclists ordering a custom frame, **not programmers**.
- Explain what you will change in plain words before a large edit; just do small ones.
- Keep changes small and focused. One request = one change.
- When done, say in one or two sentences what changed and how to see it
  ("reload the page, then open Build my bike > Forks").
- Never delete or rewrite whole files to make a small change.

## The one build rule

`app/page.html` is the source. `app/index.html` is **generated** from it and is what users open.
After any edit to `app/page.html`, rebuild `app/index.html`:

```
sh tools/build.sh        # run from the repository root
```

If `sh` isn't available (plain Windows), do exactly what `tools/build.sh` does:
write `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">`, then `page.html` from
line 1 through the line containing `</style>`, then `</head><body>`, then the rest of
`page.html` after that line, then `</body></html>`. Never hand-edit `index.html`.

Edits to the `.js` files need no build step.

## Where things live (`app/`)

| Want to change… | File |
|---|---|
| Parts library (forks, cranks, wheels, tyres, cockpit…) | `partlib.js`; 3D shapes in `parts3d.js`; part logic in `parts.js` |
| A user's own parts | `my_parts.js` (format explained at the top of the file) |
| Built-in example bike / default numbers | `designs.js` |
| Typical S–XL starting sizes | `templates.js` |
| New-bike walkthrough | `newbike.js`; geometry chart / BikeCAD import in `geoimport.js` |
| Design chat phrases | `chat.js` (core), then `chatplus.js`, `chatmore.js`, `chatextra.js`, `chatjourney.js` (build journey, spec sheet, order steps) |
| Builder checks (clearances, tube sizes) | `checks.js`; toe overlap in `toe.js` |
| Stress, fatigue, ISO 4210 lab tests | `fea.js`; CalculiX in `ccx.js`, `ccxsolid.js` |
| 3D view | `bike3d.js`, `bike3d-gl.js` |
| Overlay a second bike | `overlay.js`; drawing scan/OCR in `drawscan.js`, `ocr.js`, `scanui.js`, `drawmatch.js` |
| Build journey, garage, review, tour | `journey.js`, `garage.js`, `review.js`, `tour.js` |
| Fit report / 32" fit solver | `fitreport.js`, `fit32.js` |
| Colours and themes | `theme.js` |
| Layout, panels, buttons, styles | `page.html` (then rebuild, see above) |

Scripts are loaded by plain `<script src="…">` tags in `page.html`. A new `.js` file needs
its own tag there, after the files it depends on.

Outside `app/`: `system/CyclicLabs-Server.ps1` is the Windows helper (localhost:8765) that
runs CalculiX; `launcher/` is the optional .exe launcher source; `Start Cyclic Labs.bat`
starts it all on Windows.

## Rules

- **Stay offline.** No CDNs, no network calls, no analytics, no npm packages or bundlers
  in the app. Plain JavaScript that runs from a double-clicked file.
- **Units:** millimetres, degrees, kilograms, unless a field says otherwise.
- **Engineering numbers are estimates.** Don't present them as certification or safety
  approval. Keep the "defer to your frame builder" wording.
- **No affiliation claims.** The project is not made by or affiliated with any frame builder
  or brand. Don't add builder logos or official-looking branding.
- **Privacy.** Never add personal data to tracked files: real names, order or drawing
  numbers, builder drawings, photos, fit reports. Personal files belong in `app/local/`
  or `drawings/` (both git-ignored). Saved bikes live in the browser (`localStorage`,
  keys starting `frameBench.`), not in the files.
- **Don't bundle CalculiX.** Users download it themselves into `system/solver/`.
- **Licence:** GPL-3.0-or-later. Don't add code under an incompatible licence.

## The "AI link" light (please keep it accurate)

The app's top bar has an **AI link** button with a light that tells the user whether an AI
is working in this folder. It reads `app/local/llm_link.js`, written by `tools/llm_link.sh`.

- **Claude:** nothing to do. `.claude/settings.json` hooks run the script automatically.
- **Any other assistant (Codex, Cursor, …):** run these yourself, using your own name:
  - when you start a task: `sh tools/llm_link.sh busy Codex`
  - after you change files: `sh tools/llm_link.sh edited Codex` (the app offers "Reload")
  - when you finish and wait for the user: `sh tools/llm_link.sh idle Codex`
  - when the user says they're done: `sh tools/llm_link.sh off Codex`
  If `sh` isn't available, write the file directly, one line:
  `window.LLM_LINK={"agent":"Codex","state":"idle","at":<unix ms>,"edited":<unix ms or 0>};`
- While no AI is linked, the browser console shows "file not found" for
  `local/llm_link.js` every few seconds. That's expected, not a bug.

## Checking your work

There's no automated test suite in this folder. After a change:
1. Rebuild `index.html` if `page.html` changed.
2. If you can run a browser, open `app/index.html`, check the browser console for errors,
   and try the feature you changed. If you can't, tell the user exactly what to click to test it.
3. For a chat change, try a few phrasings of the new phrase plus a couple of existing ones
   (`make the reach 460`, `what's the trail?`, `undo`) to make sure nothing else broke.

## Sending changes back (optional)

If the user wants to share a change: create a branch, commit with a clear message, and
open a pull request on GitHub (or walk them through it). Check the diff for personal data first.
