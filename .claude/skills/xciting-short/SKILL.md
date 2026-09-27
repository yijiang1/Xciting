---
name: xciting-short
description: Make, check and publish a narrated science explainer short for the "Exciting" channel (youtube_pipeline/viral_xray_factory) — pick a topic, write and science-check the concept, build audio, footage and renders with the npm pipeline, QA the render by eye and ear, and upload it privately to YouTube. Use when the user wants a new short or explainer video, today's daily video, to fix or re-render an existing concept, or to publish one. Not for sung concepts (a `song` field) or flagship music videos; for poem or lyric videos with painted, animated scenes, use xciting-living-painting.
---

# Exciting explainer shorts

**Draft, written 2026-09-25 from the code, before any agent-driven run.** Anything marked *(untested)* comes from reading code, not experience. After each real video, replace guesses with what actually happened (see Lessons).

Everything runs from `youtube_pipeline/viral_xray_factory/` with `npm run …`. Its `README.md` lists every command. This skill is the judgement layer on top: the scripts build, you check.

```
npm run daily  |  npm run concepts -- "topic"   ──► content/concepts/<id>.json   (draft, free)
        │  YOU: science-check every beat, fix the JSON, show the user
        ▼
npm run generate:visuals -- <id> --dry-run      ──► prompts + cost for the user
npm run approve -- <id>                          (the user's call: unlocks paid footage)
        ▼
npm run pipeline -- <id>    audio → music bed → srt → footage → render → verify → bundle
        │  YOU: QA the renders, fix, re-run only the stage that broke
        ▼
npm run publish -- <id>                          (the user's call: private upload + srt)
        ▼
npm run analytics                                ──► feeds the next `daily` pick
```

## Setup (as of 2026-09-27)

- `viral_xray_factory/.env.local` has `OPENAI_API_KEY` and `ELEVENLABS_API_KEY`. Read keys into variables and **never print them**.
  - Keys can go missing: both were empty on 2026-09-24 until the user added them. Check presence without printing values: `grep -E '^OPENAI_API_KEY=.+' .env.local >/dev/null && echo set`.
  - A script that dies on a missing key fails before its first request, so nothing is spent.
  - No `GEMINI_API_KEY`, so footage uses **Sora** (`sora-2`) and narration uses ElevenLabs `eleven_v3`.
  - No YouTube OAuth vars, so `npm run publish` fails until the user creates a Desktop-app OAuth client and runs `npm run youtube-auth`.
- There are 6 hand-built concepts, all approved. Nothing is built yet: no audio, footage, renders or analytics.
- ffmpeg is on PATH, but ffprobe isn't. The scripts fall back to Remotion's bundled ffprobe. For manual checks, use `ffmpeg -i f 2>&1 | grep Duration`.
- `npm run gui` (localhost:4321) runs the same steps as a web panel, and `npm run status` shows the board.
- The panel can also run this skill headless on Claude Code or Codex ("New video with a skill": a free Draft task, and a Build & QA task for an approved concept). Those runs append their own rules: no questions, no approving or publishing, and a final summary instead of sending files. `XCITING_AGENT_RUN` makes the paid scripts refuse anything outside the run (`scripts/lib/agent-guard.ts`).

## Workflow

1. **Topic.**
   - `npm run daily`: the strategist reads `content/analytics.json` and picks the theme, style, series and topic.
   - Or `npm run concepts -- "topic" [--style noir] [--series xray] [--formats portrait,landscape]`.
   - Either way it's one LLM call, and the concept is written as a `draft`.
2. **Science check (the step that matters most).** Read `content/concepts/<id>.json`:
   - Every `beats[].text` must be true, with no overclaims, no invented numbers or records, and every term translated in the same breath.
   - The hook is 12 words or fewer. There are 6–8 beats and 110–160 words total. The script explains one mechanism, and the last beat loops back to the hook.
   - `cinema.shots` has exactly one entry per beat and depicts that beat. Shots never ask for text, labels, numbers or UI (Sora renders them as gibberish).
   - Edit the JSON directly, run `npm run sync` to validate it, then **show the user every changed line**. They review the science.
3. **Approve.** Run `generate:visuals -- <id> --dry-run` and show the user the prompts and the estimated cost. Approving unlocks spend, so it's their call: `npm run approve -- <id>`.
4. **Build.** Run `npm run pipeline -- <id>` in the background. Audio runs before footage because clip lengths come from beat timings (4, 8 or 12 s on Sora). Clips shorter than their beat loop.
5. **QA (you can't watch, so check like this).**
   - **Frames:** make a contact sheet and look at it. Crop to full resolution for detail.
     `ffmpeg -loglevel error -y -i renders/<id>-portrait.mp4 -vf "fps=1/2,scale=360:-2,tile=6x4" -frames:v 1 sheet.png`
     Look for:
     - footage that doesn't match its beat;
     - garbled text inside the footage;
     - melted hands and faces;
     - a visible loop restart;
     - captions that are hard to read against the footage;
     - any hard seam, tear or jump. The user spots a single glitch before anything else.
   - **Per-beat frames:** `python3 .claude/skills/xciting-living-painting/scripts/tools.py sheet <render> sheet.png <beat starts in seconds, comma-separated>` gives two frames per beat.
     - It seeks with `ffmpeg -ss`, which is fast. `select=eq(n\,N)` decodes the whole file for every frame.
     - If you loop over beat times in zsh, remember that arrays start at 1. A `starts[0]` loop silently shifted every sample by one beat.
   - **Single-frame checks:** `npx remotion still src/index.ts <composition> f.png --frame=N --scale=0.5`.
     - Run them **one at a time**. Parallel `remotion still` runs race on the webpack cache and hang at 0% CPU. Kill them (`pkill -f "remotion still"`) and re-run one by one.
   - **Special characters in captions** (µ, λ, pinyin tones such as ǐ): a font missing a glyph falls back and renders marks detached. Crop and check them *(seen in a lyric video with Hoefler Text; untested with this pipeline's caption font)*.
   - **Captions:** the karaoke words are Whisper's transcript of the narration (`public/data/timings.json`), not the script. Compare them with `beats[].text`. Jargon and numbers can come out wrong *(untested for narration; true for rap)*.
   - **Loudness:** `ffmpeg -i <render> -af ebur128=peak=true -f null - 2>&1 | grep -A3 Integrated`. Mastering targets −14 LUFS and −1.5 dBTP.
   - **Send the user a preview.** They often review on a phone, which can't take files over 30 MB, so shrink it first: `ffmpeg -i <render> -vf scale=720:-2 -crf 26 preview.mp4`. Send it with SendUserFile.
6. **Fix only what broke** (see the next section), then re-render and QA again.
7. **Publish (the user's call).**
   - For landscape uploads, run `npm run thumbnails -- <id>` first. Then `npm run publish -- <id>`, which uploads the primary format as **private** with the `.srt`.
   - The description already starts with "Voiceover and visuals are AI-generated." The script doesn't set YouTube's synthetic-content flag, so tell the user to tick **"Altered or synthetic content"** in Studio.
   - TikTok and Instagram copy is in `bundles/<id>/`. The user posts those by hand.
8. **Write down what you learned** in Lessons below.

## Re-running one stage (cost traps)

| Problem | Do this | Not this |
|---|---|---|
| Narration or beat text changed | `npm run generate:audio -- <id>` → `npm run subtitles` → `npm run render -- <id> --force` → `npm run verify -- <id>` | `pipeline --force`: it passes `--force` to footage too and **re-buys every clip** |
| One bad clip | Delete `public/footage/<id>/<orientation>/beat-NN.mp4`, then `npm run generate:visuals -- <id>` (only missing clips are generated) | `generate:visuals --force` |
| Shot prompt rejected by moderation | Soften the wording in `cinema.shots[i]` and re-run `generate:visuals` | |
| Caption words wrong | Fix the words in `public/data/timings.json`, then `npm run subtitles` and `npm run render -- <id> --force` *(untested)* | Re-generating the audio |

A render re-runs only with `--force`; an existing file is skipped otherwise. If the audio gets longer after footage exists, clips loop, so check the contact sheet for visible repeats.

## Money

- Footage is the only real cost: roughly $0.10/s on sora-2, or about $5 for a 6-beat portrait short. The per-concept cap is `MAX_VIDEO_BUDGET_USD=6`, and going over it needs `--footage-ok`.
  - A second format doubles the footage, since each orientation is generated natively.
  - Pricing comes from the code (July 2026), so check current rates before quoting.
- Drafts never buy footage. Always run `--dry-run` before the first real footage call.
- **Never run two generation runs at once.** Caching skips files that already exist, which protects re-runs made one after another. Two concurrent runs both see the same missing clips, and both pay for them.
- Narration, the music bed, Whisper and the concept LLM each cost cents.
- gpt-image-1 (thumbnails) cost about $0.25 per 1536x1024 image at quality `high` (September 2026).
- A cheaper visual tier exists outside this pipeline: one painting per beat, animated in Remotion (about $0.25 per beat, versus about $0.80 per 8-second Sora beat). It's documented in xciting-living-painting and not wired into `generate:visuals`.
- Quote the cost before spending, even small amounts. If the real spend overshoots the quote, tell the user.

## The user's standards (carried over from the rap-mv skill in ptychohub)

- They review the science of every line. Show script changes before spending anything.
- Visuals are illustrative. Never present them as real data, and never invent record numbers.
- Say that AI-generated audio and visuals are AI-generated whenever something goes public.
- They review by eye and ear from stills, clips and screenshots, often on a phone. When they flag a frame, find the root cause, fix it, re-render and send a clip.
- They judge visuals hard. Code-drawn or procedural art reads as cheap next to AI footage or paintings, and motion should show the idea rather than decorate the text (learned on the 蒹葭 lyric video, 2026-09-25).

## Lessons (append after every run)

- 2026-07-07: Sora moderation rejected the cartoon concept's beat-5 shot. The softened wording went through.
- From rap-mv, not yet seen here: on music clips or after a pause, Whisper hallucinates "Thanks for watching!", drops an isolated last word, and writes numbers as digits.
- 2026-09-25, from the 蒹葭 lyric-video remake (details in xciting-living-painting):
  - Four rounds of feedback; the user accepted only the version where each scene's motion depicted its line.
  - A displacement shimmer tore the frame once its noise drifted past the filter's margin; that was the only defect the user flagged.
  - Parallel `remotion still` runs deadlocked.
  - Once the key existed, a missing-key failure cost nothing.

## Rules

- No `git push` without an explicit ask. Renders, footage, audio and bundles are gitignored.
- Never publish publicly without the user saying so; `--public` is their decision.
- Never print API keys.
