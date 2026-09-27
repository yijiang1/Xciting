# Exciting — Short-Video Content Factory

Automated pipeline that turns a topic into a publish-ready science explainer:
LLM-written script → SOTA TTS narration → karaoke captions → AI footage →
Remotion render in **9:16 (Shorts/TikTok/Reels) and 16:9 (YouTube)** → review
queue → one-command YouTube publish → analytics feedback into the next topic.

Content lives as JSON in `content/concepts/` (schema:
`scripts/lib/schema.ts`). Nothing is hardcoded: `npm run concepts` writes new
videos into the store, and every downstream stage reads from it.

## The daily loop

```bash
# 1. Write new video concepts (drafts; no money spent on visuals yet)
npm run concepts -- --auto 3                     # next unused topics from content/topic-bank.json
npm run concepts -- "why glass is transparent"   # or any topic you like
npm run concepts -- "topic" --series xray --style noir --formats portrait,landscape

# 2. Skim the script (content/concepts/<id>.json), then clear it for spending
npm run approve -- <id>

# 3. Build everything: TTS -> captions -> footage -> renders -> QA -> bundle
npm run pipeline -- <id>
npm run pipeline -- --all-approved

# 4. Watch it, then ship it
npm run review
npm run publish -- <id>            # private by default
npm run publish -- <id> --public   # straight to public

# 5. Once videos are live, close the loop
npm run analytics                  # feeds retention data into future --auto picks
```

`npm run status` shows the whole board at any time.

## Money guards

Footage generation is the only expensive stage (~$5 per short with sora-2).
Three guards keep it deliberate:

1. Concepts start as `status: "draft"` — the pipeline builds drafts with free
   procedural visuals but will not buy footage for them.
2. Per-concept estimates above `MAX_VIDEO_BUDGET_USD` (default $6) refuse to
   run without `--footage-ok`.
3. `npm run generate:visuals -- <id> --dry-run` previews every prompt and the
   exact cost before anything is spent. Clips are cached; re-runs only
   generate what is missing.

Approximate footage rates (verify current pricing): sora-2 ~$0.10/s,
sora-2-pro ~$0.30/s, veo-3.1-fast ~$0.15/s, veo-3.1 ~$0.40/s. A 6-beat
portrait short is ~48s of footage.

## Formats

Concepts declare `formats` (first entry = what `npm run publish` uploads):

- `portrait` (1080x1920) — Shorts/TikTok/Reels: hook-first chrome, big
  3-word karaoke captions in the safe zone, retention progress bar. Portrait
  uploads under 3 minutes are auto-classified as YouTube Shorts.
- `landscape` (1920x1080) — classic YouTube; supports generated thumbnails
  (`npm run thumbnails`).

Footage is generated natively per orientation; if only one orientation
exists, the other render cover-crops it. With no footage at all, videos fall
back to procedural palette visuals for free.

## Publishing

YouTube is API-automated (`npm run publish`, OAuth env vars below; uploads
include the `.srt` captions and stay private unless `--public`). TikTok and
Instagram posting APIs are approval-gated, so `bundles/<id>/` contains the
video files plus ready-to-paste `tiktok.txt` / `instagram.txt` captions —
posting manually takes under a minute per platform.

```bash
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=   # scopes: youtube.upload + youtube.force-ssl (+ yt-analytics.readonly for npm run analytics)
YOUTUBE_PRIVACY_STATUS=private
YOUTUBE_MADE_FOR_KIDS=false
```

## Providers

- `TTS_PROVIDER=elevenlabs|openai` — defaults to ElevenLabs (`eleven_v3`)
  when `ELEVENLABS_API_KEY` is set; otherwise OpenAI `gpt-4o-mini-tts`.
- `VIDEO_PROVIDER=sora|veo` — defaults to Veo when `GEMINI_API_KEY` is set,
  else Sora.
- `LLM_MODEL` — script/concept writer (OpenAI, default `gpt-5.1`).
- Optional music beds via ElevenLabs Music (`npm run generate:music`).

See `.env.example` for every knob.

## Sung songs

A concept can declare a `song` (see `scripts/lib/schema.ts`) instead of relying
purely on spoken narration: one lyric section per beat, sent to Eleven Music
(`ELEVENLABS_API_KEY` required; `voice`/`ttsInstructions` become optional).
`generate-audio.ts` posts the composition plan, masters the result, then
transcribes it with Whisper to drive the same karaoke captions as narrated
videos. `generate-music.ts` automatically skips concepts with a `song` so a
second instrumental bed never layers under the vocals.

Preview the exact composition plan Eleven Music will bill for before
spending anything:

```bash
npm run generate:audio -- <id> --dry-run
```

## Sing-along shorts

`npm run song` writes a complete sung concept end to end -- a "Wheels on the
Bus"-style Verse/Chorus/Verse/Chorus/Verse/Chorus song about an X-ray/science
topic, with `style: "singalong"` and `song` already populated. These never
buy AI footage (`pipeline.ts` skips that stage unconditionally for any
concept with a `song`), so cost is just the Eleven Music vocal track:

```bash
npm run song -- "why x-rays go through skin but not bone"
npm run approve -- <id>
npm run pipeline -- <id>      # footage auto-skipped; procedural visuals only
npm run review
npm run publish -- <id>
```

Rendering uses a dedicated procedural scene (`SingalongScene` in
`src/XrayShort.tsx`) -- a big, bouncy motif that cycles between a spinning
atom, a glowing X-ray tube, and a pulsing ray beam, built for a song that
loops and repeats rather than a fast-cut explainer.

## Control panel and agent runs

`npm run gui` opens a local panel at http://localhost:4321 (loopback only):
concepts, scoreboard, approve, pipeline, publish, and a live job log with a
Stop button.

**New video with a skill** runs Claude Code or Codex headless with a playbook
from `.claude/skills/<name>/SKILL.md` at the repo root:

- **Draft** (free): write or pick a topic, science-check the concept, and run
  the footage `--dry-run`. Stops before approval.
- **Build & QA** (spends money): pipeline, QA of the renders, and targeted
  fixes for one concept you already approved. Stops before publishing.

The final summary in the log lists every change, QA findings, and open
questions, plus a command to continue the session in a terminal.

Limits: the panel sets `XCITING_AGENT_RUN`, and the paid and irreversible
scripts refuse to approve, publish, or spend on anything but that run's one
concept (`scripts/lib/agent-guard.ts`). Claude runs also get a per-task
command allowlist. Codex has no per-command allowlist; its drafts run in its
workspace sandbox and its builds run unsandboxed, because Remotion's headless
Chrome can't start inside Codex's macOS sandbox.

The Codex CLI is found on PATH, then inside the Codex/ChatGPT desktop app;
set `CODEX_BIN` to override. Both CLIs must be logged in (`claude` then
`/login`; `codex login`).

## Individual stages

The pipeline is just these, runnable on their own:

```bash
npm run sync                    # validate content/ and regenerate src/concepts.generated.json
npm run generate:audio -- <id>  # TTS + mastering + Whisper word timestamps
npm run generate:visuals -- <id> [--dry-run|--force|--formats portrait]
npm run generate:music -- <id>
npm run subtitles
npm run metadata
npm run render -- <id> [--formats portrait] [--force]
npm run render:one -- <id> portrait
npm run verify -- <id>
npm run bundle -- <id>
npm run thumbnails -- <id>
```

## Disclosure

Upload descriptions state that voiceover/visuals are AI-generated; the
roundtable series additionally discloses fictional dialogue and synthetic
voices (not impersonations). Keep it that way — platforms increasingly
require it, and it protects the channel.
