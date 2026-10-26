# Cyclic Labs

**Design a custom titanium bike frame, see it in 3D, lay it over the bike you ride now,
and check it the way a framebuilder would — all offline, in your browser.**

Built to help people ordering a custom frame make sense of the
geometry, the drawing they get back, and the tube choices before they sign off.

![3D view](system/readme/bike3d.jpg)

> Cyclic Labs is an independent hobby project. It is **not** made by or affiliated with
> any frame builder or other brand mentioned. Its stress, fatigue and lab-test numbers are
> rough estimates from a simplified model, best for comparing designs — **not an engineering
> certification**. Always defer to your frame builder: they run their own analysis and are
> responsible for the frame's design, materials, welding and testing. If you want more
> margin, ask for bigger or thicker tubing; builders will usually do it.

## What it does

- **New-bike walkthrough** — road, gravel or hardtail MTB; any wheel size; start from a
  typical S–XL size, your own numbers, a pasted geometry chart, a BikeCAD `.bcad` file,
  or a **scanned builder's drawing** (PDF/photo, read offline with OCR).
- **Realistic 3D view** with a parts library (forks, cranks, wheels, tyres, cockpit…).
- **Overlay** a second bike — e.g. your current bike as a ghost over the new frame —
  and compare reach, stack, trail, saddle/bar positions in mm.
- **Builder checks** — tyre/chainring clearance, toe overlap (3D shoe model), tube sizes.
- **Engineering view** — beam-model stress and fatigue life, ISO 4210 lab-test estimates,
  and an optional **CalculiX** finite-element check with 3D weld-joint models.
- **Garage** — keep the bikes you own or have ridden, compare them, start a new design from one.
- **Design chat** — type "make the reach 460" or "what's the trail?" (plain-text
  commands, no AI model, nothing leaves your computer).

## Install (2 minutes, no account, no internet needed afterwards)

### Windows

1. **Download** the latest `Cyclic-Labs` zip from [Releases](../../releases)
   (or click the green **Code** button > **Download ZIP**).
2. **Extract it:** right-click the zip > **Extract All…** > **Extract**.
   Don't run it from inside the zip; it can't find its files there.
3. **Start it:** open the extracted folder and double-click **`Start Cyclic Labs`**.
   - A small black **helper window** opens. Leave it open while you use Cyclic Labs; it serves
     the app and runs CalculiX.
   - Cyclic Labs opens in your web browser.
   - If Windows asks whether to run it (a security warning or **"Windows protected your PC"**),
     choose **Run**, or **More info** > **Run anyway**. It's a plain script, not a signed program.

No CalculiX? Everything still works except the CalculiX check. To skip the helper window
entirely, use **`Start Cyclic Labs (no CalculiX)`** instead.

### Mac / Linux

Download and unzip it the same way, then open **`Open on Mac or Linux.html`** in your browser.
Everything works except the CalculiX check (the helper that runs CalculiX is Windows-only).

> **Your bikes are saved in your browser**, not in the folder. Always open Cyclic Labs the
> same way and in the same browser, or your saved bikes won't show. Use **Export file** to
> keep a copy or move them to another computer.

## Add CalculiX (optional, Windows)

[CalculiX](https://www.dhondt.de) is a free finite-element solver by Guido Dhondt. Cyclic Labs
uses it for the **CalculiX check** and the **3D weld models**, a more detailed look at the
tube joints than the built-in beam model. It isn't included with Cyclic Labs (its licence and
size make it better to get it from the author), but adding it takes a minute:

1. **Download** `calculix_2.23_4win.zip` from the author's site:
   <https://www.dhondt.de/calculix_2.23_4win.zip>
   (it's linked on <https://www.dhondt.de> under the Windows section).
2. **Extract it into Cyclic Labs' solver folder:** right-click the zip > **Extract All…** >
   **Browse…**, pick the **`system\solver`** folder inside your Cyclic Labs folder, then **Extract**.
   Subfolders are fine; Cyclic Labs searches everything under `system\solver` for `ccx_2.23.exe`
   (or any `ccx*.exe`). You don't need to install anything else.
3. **Restart Cyclic Labs:** close the black helper window and double-click
   **`Start Cyclic Labs`** again.

**Check it worked:**
- The helper window should say `CalculiX solver: ...\system\solver\...\ccx_2.23.exe`.
  If it says *"CalculiX solver not found"*, see the table below.
- In the app, turn on the **Design + Engineering** switch and open the **CalculiX check** card.
  It shows which solver it found; click it to run a check.

**Already have CalculiX somewhere else?** Make a text file named `ccx_path.txt` next to
`Start Cyclic Labs` with one line: the full path to your ccx .exe, for example
`C:\CalculiX\ccx_2.23.exe`. That path wins over `system\solver`.

| Problem | Fix |
|---|---|
| Helper window or card says "CalculiX solver not found" | Check that a `ccx…exe` is somewhere inside `system\solver` (not in Downloads, and not still inside the zip). Then restart Cyclic Labs. |
| Card says "To use CalculiX, start Cyclic Labs with “Start Cyclic Labs”…" | You opened the "(no CalculiX)" version or the `.html` file directly. Use **Start Cyclic Labs**. |
| Card says "The Cyclic Labs helper window isn't running" | The black helper window was closed. Double-click **Start Cyclic Labs** again. |
| Antivirus warns about or removes the ccx .exe / .dll files | They're the CalculiX files you downloaded from dhondt.de. Allow them, or extract the zip again. |
| A run fails or finishes with no result | Close the helper window and start again. If it keeps failing, open an issue with the message the card shows. |

Cyclic Labs unblocks its own folder's files when it starts (Windows marks downloaded files as
"blocked", which can stop the solver), so you don't need to do that yourself.

## Try the example bikes

- Cyclic Labs opens on **"Example – purple Ti 29er singlespeed hardtail"**, modelled from a real
  builder's drawing. Change anything, or start your own with **+ New bike**.
- The [`garage`](garage) folder has more bikes to load: open **Garage** > **Import** and pick a
  `.json` file (for example *John's 32'er*, a 32-inch drop-bar bike).

## Change it with AI (no coding needed)

Want a new part, a new chat phrase, or a different check? You can describe the
change in plain English and let an AI assistant edit the files for you.

**Claude (easiest)**

1. **Get the files** as in [Install](#install-2-minutes-no-account-no-internet-needed-afterwards).
2. **Install the Claude desktop app** from <https://claude.ai/download> and sign in.
3. **Point it at the folder.** Start a new chat or task and choose the extracted
   folder (named something like `cyclic-labs-main`) when it asks which folder to work in.
4. **Say what you want**, for example:
   - *"Add the Fox 34 Step-Cast fork to the parts library."*
   - *"Make the design chat understand 'stack to reach ratio'."*
   - *"Explain how the toe-overlap check works."*
5. **Reload Cyclic Labs** (close and reopen it, or refresh the browser tab) to see the change.

You can also follow these steps inside the app: click **AI link** in the top bar. Its light turns
**green** while an AI has the folder open and **red** when none is linked, and it offers
**Reload** after the AI changes something.

**ChatGPT** works the same way through OpenAI's **Codex** app: open the same folder
and type your request. Use whichever assistant you already pay for; both can handle
small fixes and bigger features.

**No install?** For a small change, upload a single file to any AI chat (for example
`app/my_parts.js` to add your own parts), ask for the change, and save the file it
gives back over the old one.

**Good habits**
- Make a copy of the folder first, so you can go back if you don't like the result.
- Ask for one change at a time, then try it before asking for the next.
- Your saved bikes live in your browser, not in these files, so edits won't erase them.
- Made something others would like? Ask the AI: *"Help me send this change to the
  Cyclic Labs GitHub as a pull request."*

The assistant learns how the project is laid out from [`AGENTS.md`](AGENTS.md)
(Claude also reads [`CLAUDE.md`](CLAUDE.md)), so you don't need to explain it.

## Run from source

```
git clone https://github.com/<you>/cyclic-labs.git
cd cyclic-labs
sh tools/build.sh          # only needed after editing app/page.html (rebuilds app/index.html)
```
Then open `app/index.html` (or `Open on Mac or Linux.html`), or on Windows double-click
`Start Cyclic Labs.bat` (for CalculiX, see [Add CalculiX](#add-calculix-optional-windows)).

## Repository layout

```
app/            the program (page.html is the source, index.html is built from it)
app/vendor/     pdf.js and Tesseract (Apache 2.0)
garage/         example bikes to import from the Garage page
system/         Windows helper (CyclicLabs-Server.ps1), licences, README pictures,
                solver/ (where you put CalculiX)
launcher/       source for the optional Cyclic Labs.exe launcher (build.bat)
tools/build.sh  rebuilds app/index.html from app/page.html
AGENTS.md       instructions for AI assistants (CLAUDE.md points to it)
```

## Licence

Cyclic Labs is free software under the [GNU GPL v3](LICENSE). Included third-party software keeps its own licence;
see [THIRD-PARTY-NOTICES.txt](THIRD-PARTY-NOTICES.txt) (pdf.js and Tesseract: Apache 2.0).
CalculiX (GPL v2 or later) is not included; you download it separately from its author.
Questions or problems? [Open an issue](../../issues).
