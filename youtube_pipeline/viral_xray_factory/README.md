# Viral X-ray Factory

Automated short-video pipeline for the Xciting YouTube channel.

## What It Generates

- Five educational X-ray shorts with different formats: cartoon, interview, game show, noir, and news.
- One longer animated roundtable podcast with nine historical figures debating knowledge, wisdom, art, and justice.
- **Cinematic footage** generated per beat with Sora 2 (OpenAI) or Veo 3.1 (Gemini), composited in Remotion with crossfades, Ken Burns drift, color grade, vignette, and film grain. Procedural SVG scenes remain as a zero-cost fallback.
- **Voiceovers** via ElevenLabs `eleven_v3` (per-speaker casting, prosody continuity) or OpenAI `gpt-4o-mini-tts`, with punctuation-aware pacing, a room-tone bed, and -14 LUFS loudness mastering.
- **Karaoke captions**: Whisper word-level timestamps drive word-accurate highlighted captions plus tight `.srt` files.
- Optional **music beds** via ElevenLabs Music, looped quietly under the narration.
- YouTube-ready metadata files with title, description, tags, pinned comment, and script.

## Commands

```bash
npm run generate:audio                         # TTS + mastering + word timestamps
npm run generate:audio -- cartoon_bragg_detective
npm run generate:visuals -- cartoon_bragg_detective   # Sora/Veo footage (paid!)
npm run generate:visuals -- --all --dry-run    # preview prompts + cost estimate
npm run generate:music                         # optional ElevenLabs music beds
npm run subtitles
npm run metadata
npm run render
npm run verify
```

The full local asset build (no footage generation, since that spends real money) is:

```bash
npm run build
```

### Footage generation costs (approximate, verify current pricing)

| Provider | Model | $/second | 6-beat short (~48s) |
|---|---|---|---|
| OpenAI | `sora-2` (default) | ~$0.10 | ~$5 |
| OpenAI | `sora-2-pro` | ~$0.30 | ~$15 |
| Gemini | `veo-3.1-fast` | ~$0.15 | ~$7 |
| Gemini | `veo-3.1` | ~$0.40 | ~$19 |

Clips are cached under `public/footage/` and indexed in `public/data/footage.json`; re-runs only generate missing clips (`--force` regenerates). Run `generate:audio` first so clip lengths match the narration beats. The roundtable uses four reusable ambient loops instead of per-beat clips.

### Provider selection

- `TTS_PROVIDER=elevenlabs|openai` — defaults to ElevenLabs when `ELEVENLABS_API_KEY` is set.
- `VIDEO_PROVIDER=sora|veo` — defaults to Veo when `GEMINI_API_KEY` is set, else Sora.

See `.env.example` for all knobs (models, voices, resolutions).

## Upload

Upload is intentionally separate because it publishes to YouTube:

```bash
npm run upload
npm run upload -- cartoon_bragg_detective
```

The upload script uses the official YouTube Data API. It needs OAuth credentials with the `https://www.googleapis.com/auth/youtube.upload` scope:

```bash
YOUTUBE_CLIENT_ID=
YOUTUBE_CLIENT_SECRET=
YOUTUBE_REFRESH_TOKEN=
YOUTUBE_PRIVACY_STATUS=private
YOUTUBE_MADE_FOR_KIDS=false
```

Burned-in captions plus external `.srt` subtitle files are generated; AI/fictional disclosure belongs in metadata and descriptions, not in the video frame.
