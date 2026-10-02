---
name: xciting-size-compare
description: Make a realistic 3D size-comparison Short, where real things of the same kind stand in one row from smallest to largest and the camera flies from one to the next so viewers watch them grow (like RED SIDE's "Richest Person Comparison | 3D"). Built with Blender (Cycles) for the 3D, Remotion for labels and music, and Eleven Music for a building soundtrack. Use this whenever the user wants a "size comparison", "smallest to largest", "how big is…", a ranking video, "compare X one by one", a 3D bar-chart-style video, or wants to edit, re-render, re-time, re-score or make the landscape version of the synchrotron size video. Not for narrated science explainers (xciting-short) or lyric/poem videos (xciting-living-painting).
---

# 3D size-comparison Shorts

Written 2026-09-30 from one real run: "How big is an X-ray synchrotron?", 14 facilities by storage-ring circumference, from SOLARIS (96 m) to PETRA III (2,304 m). The final is a 1:06 vertical Short in `renders/synchrotron-sizes-portrait.mp4` (gitignored). The landscape version was deferred and has never been rendered in full.

Everything runs from `youtube_pipeline/viral_xray_factory/`.

## What the user wants (read this first)

- **Realism means matching the real thing.** "The roof colour should be consistent with the real facility." Check every item from above before modelling it (see Step 2). That surfaced more than colour: covered discs versus open rings, a rectangular hall, and a ring that runs underground. Say on screen when something isn't what it looks like ("Ring runs underground").
- **Sizes are verified numbers.** Check each value against a primary source (facility page, JACoW or IUCr paper) and record the date in the data file's `note`. The picture may be illustrative, but the size must not be.
- **Minimal text.** The user removed the blue "#N OF 14" and "SIZE COMPARISON" lines, the bar chart and the "≈ N football pitches" line. What stayed:
  - intro: one question hook ("How big is an X-ray synchrotron?");
  - per item: name, flag + place, a number counting up to the size;
  - outro: one question ("Which one have you used? 👇") plus "Check out more videos at youtube.com/@Xciting-o8d".
- **Music: bright, major key, one smooth crescendo, not too loud at the end.** The first take was "a bit dark", the second had a sudden jump, and the third's finale felt loud. All three problems had checkable fixes (Step 6).
- **Pace:** 1.5 s move + 2.5 s hold per item was approved as is.
- **Shorts first.** Show one format and get approval before spending hours on the other.
- **Ask what ambiguous feedback refers to before doing costly work.** "There's a sudden jump from Diamond to NSLS-II" meant the *music*. I assumed the camera and re-rendered 630 frames (about an hour) for a fix nobody asked for. The user kept it, but ask first.
- The user checks on renders often and asked to pause one so the Mac could cool (Step 4). Give clock-time estimates ("about 3 AM"), not just durations.

## Files

| File | Role |
|---|---|
| `content/compare/synchrotrons.json` | The data. `items` (name, place, flag, circumferenceM, `form`, `roof` hex, optional `dome`, `note`), `timing` (fps, introS, moveS, holdS, outroMoveS, outroHoldS), `scaleRef` (football pitch), `music` (Eleven Music plan), `note` (sources and dates). |
| `scripts/blender/synchrotron_compare.py` | Builds the Blender scene from the JSON and renders it: stills, full frames or a frame range. Ring-specific geometry. |
| `src/SizeCompare.tsx` | Remotion overlay: labels, music, a whoosh per move. Reads the same `timing`, so labels land on the holds. Registered as `SynchrotronSizes-portrait` and `-landscape` in `src/Root.tsx`. |
| `scripts/generate-compare-music.ts` | Posts the JSON's `music` plan to Eleven Music and writes `public/footage/compare/<id>-music.mp3`. |
| `scripts/build-compare.sh [portrait\|landscape]` | Blender (only missing frames) → H.264 footage → Remotion → master → deletes the premaster. |
| `scripts/master-compare.py` | Evens out the crescendo with a gain curve, then applies −14 LUFS gain and a limiter. |

Generated media: frames are in `renders/compare/<id>/<format>/frames/f_####.png`, footage and music in `public/footage/compare/`, and the final video is `renders/<id>-<format>.mp4`. All of it is gitignored.

## Setup

- Blender 5.2.2 LTS is in `~/Applications/Blender.app`. There's no Homebrew on this Mac. It was installed from `download.blender.org/release/Blender5.2/` (macOS arm64 dmg), checked against the published `.sha256`, and copied out of the mounted dmg. The download is about 400 MB and took about 20 minutes.
- The machine is an M4 Max with 128 GB. During a render Blender used 6.9 GB of RAM and about 3 CPU cores, with the GPU at full load. There were no thermal warnings.
- `ELEVENLABS_API_KEY` in `.env.local` is used for the music. Never print it.

## Workflow

1. **Data.** Choose the metric (for synchrotrons, storage-ring circumference) and the items, then verify every number with a web search against primary sources.
   - Show the user the table of values before building. Put the sources and check date in `note`.
2. **Look at every item from above.**
   - Google Maps satellite: `https://www.google.com/maps/@LAT,LON,300m/data=!3m1!1e3`. Get coordinates by opening `/maps/search/<name>/data=!3m1!1e3` and reading the `@lat,lon` in the resulting URL. Wait 7–8 s for tiles, and zoom by scrolling on the target.
   - Some sites are blurred. ESRF sits on a CEA site and is pixelated on Google. Fetch Esri World Imagery tiles instead: `server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}`, z = 17, a 3×3 mosaic via ffmpeg `xstack`. Bing aerial rendered black in the browser pane.
   - If Google can't find a place, take its coordinates from Wikipedia (`.geo-dec`). This happened with HEPS.
   - Record `form` and `roof` per item. Forms used: `ring` (open courtyard), `disc` (fully covered), `hall` (rectangle with a drum tower, SOLARIS) and `buried` (tunnel path on the ground plus partial-arc halls, PETRA III).
3. **Test stills before any long render.** Render at half resolution:
   ```bash
   ~/Applications/Blender.app/Contents/MacOS/Blender -b -P scripts/blender/synchrotron_compare.py -- --format portrait --still FRAME --scale 50
   ```
   - About 40 s each, mostly scene build. Run them one at a time.
   - Check the intro, three or four holds of different forms and sizes, one mid-move frame and the outro.
   - Hold frames sit at `intro + i*(move+hold) + move` + about 40 in 0-based frames; Blender numbers frames from 1.
   - To see the labels, loop a still into `public/footage/compare/<id>-<format>.mp4`, then run `npx remotion still src/index.ts SynchrotronSizes-portrait out.png --frame=N`.
   - Draw lines where the overlay text and the Shorts UI sit, and check the subject stays clear of them (see "Framing and the Shorts safe zone").
4. **Full render.**
   - Use `scripts/build-compare.sh portrait`, in the background.
   - Speed: about 4–7 s per frame at 1080×1920 with Cycles at 16 samples plus denoise. That's about 3.2 h for 1,980 frames, and later frames (bigger scenes) are slower.
   - Rendering is resumable: existing frames are skipped. The in-progress frame is an empty placeholder PNG, so delete zero-byte frames after a crash.
   - The build script wraps Blender in `caffeinate -is` so the Mac stays awake. Tell the user **not to close the lid**, which sleeps a laptop regardless.
   - Pause: `kill -STOP <blender pid>`. Resume: `kill -CONT <pid>`. This resumes mid-frame with nothing lost.
   - For a mid-render preview, encode the complete frames (`-frames:v N`), then `npx remotion render … --frames=0-(N-1)`.
   - To hold the second format, don't edit a running bash loop: bash has already parsed it. A watcher that runs `pkill -f -- "--format landscape --render"` when the log says `START landscape` works.
5. **Re-render only what changed.** Frames that don't depend on a change keep their files.
   - Delete the affected frames and rerun the build.
   - A move changed: delete Blender frames `91+120*i … 135+120*i` for i = 0–13.
   - The outro changed: delete frames 1771–1980.
   - Write `rm` targets as **literal absolute paths**. The Claude Code safety check blocks `rm` on a variable-built path such as `$D/…`.
   - Overlay-only changes (text, music, mix) need only Remotion and the master: a few minutes, no Blender.
6. **Music** (`npx tsx scripts/generate-compare-music.ts content/compare/synchrotrons.json`, a few cents).
   - Use `music_v1` with `composition_plan` sections whose `duration_ms` match the video timing. It returned 66.06 s for 66.0 s requested.
   - The winning plan had seven sections: intro 3 s, then 12 s steps for the small and big items, "Giants" 8 s, finale 7 s.
     - Every section adds "continues seamlessly from the previous section, only slightly bigger than the previous section".
     - Global negatives: "sudden drop, abrupt change, break, dark, ominous, minor key".
     - Fewer, longer sections got a 6–7 dB "drop" at 35–37 s in two takes.
   - Check before sending: short-term loudness each second, with a warning on any step over 3 dB before the finale.
     ```bash
     ffmpeg -nostats -i music.mp3 -af ebur128=metadata=1,ametadata=print:key=lavfi.r128.S -f null - 2>&1
     ```
     A mean spectral centroid (`aspectralstats`) is a rough brightness check: 986 Hz for the dark take, 1,087 Hz for the bright one. The user's ears decide.
   - Keep the previous takes (`-music-v1-dark.mp3` and so on) in case they want one back.
7. **Master.** `master-compare.py` runs inside the build.
   - Mixed as is, the crescendo sat at −21 LUFS at the start and −10 at the finale, and the user heard the end as loud. YouTube only turns loud videos *down* and never boosts quiet ones, so this has to be fixed in the mix.
   - The script's gain curve pulls the mix onto a −17.5 → −13 ramp, then applies one gain to −14 LUFS and a limiter (`alimiter=limit=0.79` at 192 kHz). Result: −14.0 LUFS, true peak −2.0 dBTP, range 5 dB, and the build is kept.
   - What failed:
     - single-pass `loudnorm` landed at −11.9;
     - two-pass linear couldn't raise the level without breaking the peak limit, so it fell back to dynamic;
     - dynamic `loudnorm` at LRA 5–7 flattened the build to 2–3 LU and dipped mid-song.
8. **QA.** You can't watch the video, so check it:
   - a contact sheet of one frame per hold: the labels match the JSON and the notes show;
   - a strip of every fourth frame through a move;
   - no cuts: `select='gt(scene,0.08)'` should find nothing but frame 0;
   - smooth joins where re-rendered frames meet old ones: `tblend=all_mode=difference,signalstats` YAVG should ramp smoothly at each boundary (0.5 → 1 → 2.6…), not spike;
   - loudness: −14 ±0.5 LUFS, peak under −1.5 dBTP;
   - the length matches `sizeCompareFrames`.
9. **Deliver.**
   - Send a 720p preview: `-vf scale=720:-2 -crf 25 -c:a copy`, about 11 MB. Previews sit in the temporary scratchpad; the real file is in `renders/`.
   - Write the YouTube description with the disclaimer that was taken off the screen: "Rings drawn to scale by storage-ring circumference; buildings illustrative (roof colour and form from satellite imagery)". Note that PETRA III's ring is underground, and that the music is AI-generated, so tick YouTube's "altered or synthetic content" box. The 3D is rendered in Blender, not AI.

## Scene and camera (what worked)

- **Layout:** the items sit behind one straight road, each at `cy = FRONT + outer`, so the row reads like bars on a baseline.
  - Gap = `90 + 0.12*outer`. A smaller gap let neighbouring perimeter roads (at `outer + 30…36`) cross.
  - A football pitch (105 × 68 m) comes first, for scale.
- **Look:**
  - Cycles, 16 samples plus OpenImageDenoise, looks the same as 32 at half the time. EEVEE was 2.7 s per frame but flat, with weak shadows, so it was rejected.
  - AgX "Medium High Contrast" look, exposure −0.4.
  - Sky texture without a sun disc, strength 0.35, plus a sun lamp at 4.5 W/m², warm colour, elevation 32°.
  - Haze is a 550 m volume box, density 1e-4, over the scene.
  - Roofs: the hex colour taken from satellite imagery, converted to linear, **metallic 0.05**. At 0.2, grey roofs came out sky-blue.
  - Trees (about 60,000) and cars are instanced with Geometry Nodes on a point mesh: Collection Info → Instance on Points, random Z rotation and scale.
  - The ground is one plane: lawn inside the campus, Chebyshev-Voronoi farmland outside, with a noisy edge between them.
- **Camera:**
  - Portrait: lens 40, elevation 46°. Landscape: lens 30, elevation 34°.
  - Each shot frames `extent × 1.18`; extent is `2 × outer`, or `3.2 × outer` for a `hall`.
  - During a hold the camera pushes in 5% and orbits 3°.
  - Moves use a **sine ease with a 0.45 pull-back in the middle, plus motion blur (shutter 0.5)**, so both items share the frame mid-move. The first version (smootherstep, 0.18 pull-back, no blur) whipped too fast for 30 fps.
  - Distance is interpolated in log space.
  - The outro rises to a top-down view (elevation 89.9°). Portrait rolls so the row runs vertically with the largest item at the top.
- **Framing and the Shorts safe zone:**
  - YouTube's title, channel and buttons cover about the bottom 20%, and the side buttons cover the right edge. Keep text above about 77% of the height, left-aligned.
  - The portrait outro fits the row into 16–72% of the height, below the one-line question and above the channel line.
  - Any text change that adds a second line moves those bands. Check the outro still after every text change: "Which one have you used? 👇" at 80 px wrapped and covered PETRA III; at 60 px with `nowrap` it fits.

## Blender 5.2 API pitfalls (each cost a render)

- `ShaderNodeMix` has float, vector and colour sockets that share the names "A", "B" and "Result". `inputs['A']` is the *float* one. Pick sockets by `type == 'RGBA'`, as the script's `rgba_in` does.
- `ColorRamp` elements re-sort whenever a position changes, so assigning by index scrambles colours and can leave a stray black stop. Set the two ends first, then `elements.new(pos)` for the middle stops.
- A world volume also darkens the sun and sky, which sit infinitely far away. The frame went black. Use a bounded volume box, with its **bottom below the ground**: at z = 0 exactly it overlapped the ground plane and shadowed it in bands.
- Cycles GPU (Metal) settings live in preferences, not in the `.blend`. A script that opens `scene.blend` must enable Metal itself, or it silently renders on CPU at about 2× the time.
- `Material.use_nodes` and `World.use_nodes` print deprecation warnings in 5.x but still work. `action.fcurves` is gone with slotted actions, so don't touch fcurves.
- `bpy.ops.wm.read_factory_settings(use_empty=True)` gives a clean scene. Build everything with `bmesh` and the data API, not `bpy.ops`.

## Reusing this for another topic

The overlay, music, master, QA and render workflow is generic. The Blender builder isn't: `synchrotron_compare.py` only knows ring facilities, a pitch, roads and forest. For another subject (F1 salaries as bars or money stacks, buildings, animals), write a new geometry builder that exposes the same things: shots with a target and an extent, the timing from the JSON, and `--still`, `--render` and `--range`. Keep the camera code, lighting and pitfalls. Then point `SizeCompare.tsx` and `build-compare.sh` at the new data file.

## Rules

- Never publish without the user asking. Uploading is their call.
- Quote costs: music is a few cents per take, and Blender is free but takes hours. Give render estimates as clock times.
- No `git push` without an explicit ask. Renders, frames, footage and music are gitignored.
