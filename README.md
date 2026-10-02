# Xciting

Tools behind **Exciting**, a YouTube channel of short science videos, mostly about X-rays. It's a content factory: a topic goes in, and a science-checked, narrated, captioned short comes out, rendered in 9:16 (Shorts/TikTok/Reels) and 16:9 (YouTube) and ready to publish. Viewer analytics feed back into picking the next topic.

```
topic ──► LLM script (draft) ──► science check ──► approve ──► TTS/song + captions ──► AI footage
      ──► Remotion render ──► QA ──► private YouTube upload ──► analytics ──► next topic
```

## What's in the repo

| Path | What it is |
|---|---|
| [`youtube_pipeline/viral_xray_factory/`](youtube_pipeline/viral_xray_factory/) | The pipeline: concept store, TTS/music, Sora/Veo footage, Remotion compositions, QA, publishing, analytics and a local control panel. **Its [README](youtube_pipeline/viral_xray_factory/README.md) is the full manual.** |
| [`youtube_pipeline/bragg_law_test/`](youtube_pipeline/bragg_law_test/) | An early standalone Python test video (Bragg's law), kept for reference. |
| [`.claude/skills/`](.claude/skills/) | Playbooks for Claude Code (see [Agent skills](#agent-skills)). |

## Quick start

Requirements: Node.js 18+ (developed on 24), ffmpeg on `PATH`, and an OpenAI API key. ffprobe is optional; the scripts fall back to Remotion's bundled copy.

```bash
cd youtube_pipeline/viral_xray_factory
npm install
cp .env.example .env.local          # add OPENAI_API_KEY; ElevenLabs/Gemini/YouTube keys are optional

npm run concepts -- "why glass is transparent"   # writes a draft concept (no footage spend)
npm run generate:visuals -- <id> --dry-run       # preview footage prompts and cost
npm run approve -- <id>                          # unlocks paid footage for this concept
npm run pipeline -- <id>                         # audio → captions → footage → render → verify → bundle
npm run review                                   # watch it
npm run publish -- <id>                          # private YouTube upload (needs npm run youtube-auth once)
```

- `npm run daily` picks today's topic from analytics.
- `npm run status` shows the board.
- `npm run gui` opens the same controls at http://localhost:4321.

## Spending guards

Footage is the only real cost: about $5 for a 6-beat short with `sora-2`.

- Concepts start as drafts, and drafts never buy footage.
- `--dry-run` prints every prompt and its price before anything is spent.
- `MAX_VIDEO_BUDGET_USD` (default $6) caps each concept.
- Generated clips are cached, so re-runs only fill gaps.

Details are in the [pipeline README](youtube_pipeline/viral_xray_factory/README.md#money-guards).

## Agent skills

The control panel can run these headless ("New video with a skill"), or you can use them in any Claude Code session in this repo:

- **[`xciting-short`](.claude/skills/xciting-short/SKILL.md)**: make, science-check, QA and publish a narrated explainer short. It's the judgement layer on top of the npm scripts.
- **[`xciting-living-painting`](.claude/skills/xciting-living-painting/SKILL.md)**: turn a poem or lyric track into a video with one AI painting per line. Motion depicts each line's meaning, the text is static, and the original audio stays in sync. It ships a Remotion kit and helper scripts.
- **[`xciting-size-compare`](.claude/skills/xciting-size-compare/SKILL.md)**: make a realistic 3D "smallest to largest" comparison Short. Blender renders a row of real things to scale, checked against satellite imagery, and the camera flies from one to the next. Remotion adds labels and a building music track, and the audio is mastered for Shorts. The first one compares 14 X-ray synchrotrons.

## Not in git

- API keys (`.env.local`).
- Everything generated: audio, footage, music, renders, bundles and caches.
- Local-only remakes, such as `youtube_pipeline/remakes/jianjia/`, which contain third-party source videos and paid images.

See [`.gitignore`](.gitignore).

## Disclosure

Voiceovers, music and visuals are AI-generated. Uploads say so in their description; also tick **"Altered or synthetic content"** in YouTube Studio when publishing.
