# Viral X-ray Factory

Automated short-video pipeline for the Xciting YouTube channel.

## What It Generates

- Five educational X-ray shorts with different formats: cartoon, interview, game show, noir, and news.
- One longer animated roundtable podcast with nine historical figures debating knowledge, wisdom, art, and justice.
- OpenAI TTS voiceovers using `gpt-4o-mini-tts`.
- Per-speaker OpenAI TTS casting for the roundtable podcast, with optional local macOS `say` fallback.
- Remotion/React animations rendered to 1080p MP4.
- Burned-in captions plus external `.srt` subtitle files. Video-frame disclosure text is intentionally not rendered; AI/fictional disclosure belongs in metadata and descriptions.
- YouTube-ready metadata files with title, description, tags, pinned comment, and script.

## Commands

```bash
npm run generate:audio
npm run generate:audio -- roundtable_knowledge_wisdom
npm run generate:local-podcast-audio -- roundtable_knowledge_wisdom
npm run subtitles
npm run metadata
npm run render
npm run verify
```

The full local asset build is:

```bash
npm run build
```

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
