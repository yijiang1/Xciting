---
name: xciting-living-painting
description: Make a "living painting" lyric or poem video — one AI painting per line (ink-wash by default), animated with motion that shows what the line means (water shimmer, wind in the reeds, drifting fog, camera moves, ripples, frost forming, a figure fading into mist), static text that cuts on each line's cue, and the original audio kept untouched and in sync. Use this whenever the user wants to remake or re-animate an existing video (a karaoke/lyric video, a recitation, a song), make a video for a poem (古诗, 诗经, 唐诗) or song lyrics, give a sung Xciting concept illustrated scenes, or says the animation should "match the meaning" of each line or sentence, even if they never say "living painting". Not for narrated science explainers; use xciting-short for those.
---

# Living-painting lyric videos

Written 2026-09-27 from one real run: the 蒹葭 remake (a 2:33 poem recitation, 13 pages, about $3.75 of images). The reference project is `youtube_pipeline/remakes/jianjia/`. It's gitignored and local only, so it may not exist on another machine. Steps marked *(untested)* were not exercised in that run.

## What the user wants (read this first)

This came from four rounds of feedback. Getting it wrong costs a whole iteration.

- **Put the animation in the scene, not the text.** Each line gets its own scene, and its motion shows what the line means: dew *turning* to frost, fog *swallowing and returning* the beloved, the camera *climbing* a steep stair.
  - Rejected in round 2: ink-splash transitions, characters flying or bouncing in, and per-character effects. The verdict was "the animations are not great."
- **The text is plain.** It's static, it changes exactly on the line's cue, and pages change with a short plain dissolve. The user said they "don't really need animation for the text or transitions."
- **AI paintings beat code-drawn art.** SVG boats, figures and reeds drawn in code looked cheap. gpt-image-1 paintings with subtle 2.5D motion got "looks much better now."
- **Keep the motion subtle and continuous.** A single tearing seam in the reeds was the first thing noticed. Any glitch in a calm painting reads as broken.

## Pipeline

```
source video / audio ──► cue time per line + transcribed text          (tools.py cues, full-res frames)
         │
   scene plan: what moves in each line, and why ──► user OK + cost       (before any spend)
         │
   gen-images.mts ──► public/scenes/<id>.png, one shared style prompt    (~$0.25 each)
         │
   tools.py grid ──► anchor coordinates;  tools.py overlay/fog ──► derived layers
         │
   scenes.tsx (kit.tsx pieces) + Composition.tsx (static text, dissolves, credits)
         │
   remotion render --muted ──► ffmpeg -c copy the ORIGINAL audio ──► frame count check
         │
   QA: tools.py sheet + full-res crops ──► fix ──► re-render ──► SendUserFile
```

## 0. Set up the project

```bash
cd youtube_pipeline && mkdir -p remakes/<name>/src remakes/<name>/public/scenes && cd remakes/<name>
ln -s ../../viral_xray_factory/node_modules node_modules        # reuse the pipeline's Remotion + openai
S=../../../.claude/skills/xciting-living-painting
cp $S/assets/kit.tsx $S/assets/Composition.tsx src/ && cp $S/assets/gen-images.mts .
python3 $S/scripts/tools.py fog public/fog.png                   # drifting-mist texture used by <Fog/>
cp <source video> public/orig.mp4                                # only if you'll reuse its credits card
```

**Ask whether to track the project on GitHub.** Remakes contain other people's videos and paid images, and the user kept 蒹葭 local-only (`.gitignore`: `youtube_pipeline/remakes/jianjia/`). Default to adding a similar line.

The first render downloads headless Chrome (~190 MB) into `.remotion/`. Symlinking another project's `.remotion` skips the download.

## 1. Source, timing, text

- **Probe.** There's no ffprobe, so use `ffmpeg -i src 2>&1 | grep -E "Duration|Stream"`. Get the exact frame count with `ffmpeg -i src -map 0:v -f null - 2>&1 | grep -oE "frame= *[0-9]+" | tail -1`. That frame count becomes `TOTAL`.
- **Cue times.** A karaoke-style source already contains them.
  - `python3 tools.py cues src.mp4` prints each time the yellow highlight moves to a new line, accurate to 0.1 s. That's plenty, because pages dissolve over 0.6 s.
  - Hard slide changes: `ffmpeg -i src -vf "select='gt(scene,0.08)',showinfo" -f null - 2>&1 | grep -o "pts_time:[0-9.]*"`.
  - For a sung Xciting concept, take line starts from `public/data/timings.json` *(untested)*.
- **Text.** Transcribe it from full-resolution frames: crop the text area and read it zoomed in, especially tone marks and rare characters. Keep the source's own translation.

## 2. Plan the scenes, then show the user

For every line, write two things: the moment in the painting, and what moves in it. Motion that *depicts the meaning* is the whole point. The 蒹葭 plan, as a vocabulary to borrow from:

| Line means | Scene motion | kit pieces |
|---|---|---|
| reeds, autumn marsh | geese cross in a V, reeds bend in gusts, mist slides over water | `Bird`, `wind`, `Fog`, `water` |
| dew turns to frost | frost creeps up the *same* leaves, glints turn icy | `tools.py overlay` + SVG mask, `Glint` |
| she's across the water | camera drifts toward her, fog veils and returns her | `keys`, `SvgMist` (oscillating), `Fog` |
| the road is long | camera travels the road into the distance, leaves blow against the walker | multi-key `keys`, `Stream` |
| as if in mid-water | a boat drifts toward her, she wavers like a mirage | boat sprite, `haze` |
| dew not yet dried by sun | rays open, mist lifts, dew sparkles | anchored SVG rays, `Fog` moving up, `Glint` |
| at the water's edge | a leaf falls, ripples cross her reflection | anchored leaf path, `Ripples` |
| steep and high | camera climbs a tall painting while clouds fall away | portrait image + `keys`, `Fog` with moving `y` |
| as if on an islet | fog parts, egrets take off, rings around the shore | `Mist` pair sliding apart, `Bird`, `Ripples` |
| the way winds | camera follows the path bend by bend, then pulls back | 4-key `keys` |
| elusive ending | pull back while fog closes over her | zoom-out `keys`, rising `SvgMist`/`Fog` |

Let the scenes carry the arc. In a longing poem the figure keeps slipping away, and the last scene should dissolve.

Show the user the plan with the image count and cost (~$0.25 each) before generating. Spending is their call.

## 3. Paint

Fill `JOBS` in `gen-images.mts`; its comments explain the style constants.

- **One shared `STYLE` sentence** keeps 13 images looking like one painter made them. Always forbid text, calligraphy and seals; models love adding red seals.
- **Reserve the top third as empty sky (`SKY`)**, because the text sits there. Place figures low enough that the camera can keep them below the text (see section 4).
- **Name every animatable element and where it sits** ("on the far bank, small", "sun upper right"). You'll anchor effects to them.
- **Use `1024x1536` for climbs** (cliffs, waterfalls). The camera pans up a tall painting.
- **Check keys without printing them:** `grep -E '^OPENAI_API_KEY=.+' ../../viral_xray_factory/.env.local >/dev/null && echo set`. If it's empty, the script throws before spending anything.
- **Never run two copies at once.** Both see the same missing files and both pay for them.
- **Look at every painting on a contact sheet**, and regenerate misses by id: `tsx gen-images.mts <id>`.

Things that failed, so skip them:

- **Image edits for before/after states.** `images.edit` with `input_fidelity: 'high'` still moved the reeds, so a masked reveal showed two different clumps.
  - Instead, derive the new state from the original painting: `python3 tools.py overlay public/scenes/dew.png public/scenes/frost_overlay.png src/leafpts.json` puts crystals exactly on its dark strokes.
  - This works for frost, snow, dew or light catching edges. The JSON holds sparkle points for `<Glint/>`.
- **Transparent cut-out sprites.** They came back with white halos, and the reeds looked like pink bells. Animate the painting itself with `wind`/`water`/`haze` instead.
  - The one sprite that worked (the boat) still needed a filter to blend in: `sepia(0.35) saturate(0.6) contrast(0.85) blur(0.4px)` at 0.9 opacity, plus a flipped, blurred reflection.

## 4. Animate (`kit.tsx`)

`<Painting>` renders a painting under a moving camera. Everything passed in `anchored` is SVG in painting-pixel coordinates, so it stays glued to the painting as the camera moves.

- `keys: [cx, cy, zoom][]`: focus point (0–1 of the image) and zoom (1 = just covers the frame), eased across the page.
- `water`: an image-y fraction (the waterline) or a CSS mask. A displaced copy shimmers there.
- `wind`: a CSS mask over reeds or grass. They bend sideways in travelling gusts, and a radial mask keeps the bases still.
- `haze: {x, y, r, vy}`: a wavering patch, for a mirage figure or falling water (`vy > 0` flows down).
- `layers`: extra HTML layers inside the camera, such as a translated copy of the sea for lapping waves.

Other pieces:

- `Fog`: screen-space drifting mist band; it needs `public/fog.png`.
- `Mist` / `SvgMist`: soft veil, screen-space / anchored.
- `Ripples`: expanding rings on water.
- `Glint` + `twinkle()`: brief sparkles.
- `Bird`: flapping ink stroke; `color` for egrets.
- `Stream`: leaves, fluff or sparks streaming across the frame.

Finding anchors: run `python3 tools.py grid public/scenes/<id>.png /tmp/grid.png`, view it, and read coordinates off the 128 px grid.

Keeping faces below the text band (screen y ≈ 0–300 px):

- `cover = max(1920/iw, 1080/ih) * zoom`, `H = ih * cover`, `top = clamp(540 - cy*H, 1080 - H, 0)`.
- The screen y of an image point is then `y*cover + top`.
- Zooming in on a figure raises her head into the text. Push in less, or use a smaller `cy`.

Rules the kit already enforces (keep them if you edit it):

- **Bounded drift.** The shimmer noise only exists inside its filter region (30% margin). Drift must *sway* within `TRAVEL`, never grow with time, or the empty edge slides in as a hard vertical tear through the painting. This was the bug on the 13-second title page.
- **Streaky fog.** `tools.py fog` makes anisotropic, horizontally tileable streaks; round noise reads as bokeh circles.
- **Soft ripples.** Rings are blurred and fade in, because crisp white ellipses look drawn on.

## 5. Text and assembly (`Composition.tsx`)

Fill in `PAGES` (cue `t`, `scene` id, `zh`, optional `py`, `en`), `TOTAL` and `CREDITS`. The template already:

- cuts the text on the cue. It's rendered outside the dissolving layers, so two lines never overlap mid-dissolve;
- dissolves scenes over 18 frames;
- adds a paper wash behind the text;
- hands off to the source's credits card via `OffthreadVideo trimBefore` (`CREDITS` frame);
- fades in from paper at the start and out to black at the end.

Fonts: Remotion's headless Chrome uses macOS system fonts. Use `Kaiti SC` for Chinese, `Times New Roman` for pinyin (Hoefler Text lacks ǐ and renders it detached), and `Baskerville` italic for English.

## 6. Render, keep the audio, QA

```bash
npx remotion render src/index.ts Video out/video.mp4 --muted --concurrency=8 --crf=18   # ~2.5 min for 2:30 at 1080p
ffmpeg -y -i out/video.mp4 -i public/orig.mp4 -map 0:v -map 1:a -c copy -movflags +faststart ~/Downloads/<name>.mp4
ffmpeg -i ~/Downloads/<name>.mp4 -map 0:v -f null - 2>&1 | grep -oE "frame= *[0-9]+" | tail -1   # must equal TOTAL
```

Copying the original audio stream (never re-encoding it) with an identical frame count is what guarantees sync.

QA, since you can't watch the video:

- `python3 tools.py sheet out.mp4 /tmp/sheet.png <cue1,cue2,...>` gives two frames per page. Crop to full resolution for detail.
- Test single frames with `npx remotion still src/index.ts Video f.png --frame=N --scale=0.5`.
- **Run stills one at a time.** Parallel `remotion still` runs race on the webpack cache and hang at 0% CPU. To check many frames, render once and sample with `ffmpeg -ss`.
- In zsh, arrays start at 1. A `starts[0]` loop silently shifted every sample by one page.

Look for:

- tears or seams in shimmering or windy areas, especially late in long pages;
- heads under the text;
- pasted-looking sprites;
- blotchy fog;
- hard-edged rings or lines;
- anything that looks broken rather than painted.

Deliver with SendUserFile and the path. The master is about 200 MB; for phone review, send `ffmpeg -i in.mp4 -vf scale=720:-2 -crf 26 preview.mp4` as well.

## Money

- Images run about $0.25 each (gpt-image-1, high, 1536x1024). A 13-line poem is about $3.50–4 including a couple of re-rolls.
- Sora-2 clips for the same video would be about $16 (13 × 12 s × $0.10/s). The user chose paintings.
- Always quote the cost and wait for the go-ahead before the first generation.

## Lessons (append after every run)

- 2026-09-25 (蒹葭): four rounds.
  1. Ink transitions.
  2. Per-sentence text effects, rejected.
  3. Paintings with meaning-driven motion, accepted.
  4. A seam fix.
- The generated paintings were strong on the first try. All the iteration went into motion and glitches, so budget QA time rather than image re-rolls.
