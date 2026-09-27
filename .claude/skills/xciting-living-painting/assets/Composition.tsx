// Template: static lyric pages over living-painting scenes, locked to an existing audio track.
// Copy to src/Composition.tsx, fill PAGES/TOTAL/CREDITS, write the scenes in src/scenes.tsx (export SCENES).
// Register in src/index.ts:
//   registerRoot(() => React.createElement(Composition, {id: 'Video', component: Video, durationInFrames: TOTAL, fps: 30, width: 1920, height: 1080}));
import React from 'react';
import {AbsoluteFill, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import {SCENES} from './scenes';
import {clamp} from './kit';

const FPS = 30;
export const TOTAL = 0; // = the source's frame count (ffmpeg -i src -map 0:v -f null -), so the muxed audio stays in sync
const CREDITS: number | null = null; // frame where the source cuts to a credits card to reuse as-is (public/orig.mp4), or null
const ZH = "'Kaiti SC', 'STKaiti', serif"; // macOS system fonts work in Remotion's headless Chrome
const PY = "'Times New Roman', serif"; // pinyin needs every tone mark; Hoefler Text lacks ǐ
const EN = "'Baskerville', 'Times New Roman', serif";
const INK = '#1f1b17';
const GLOW = '0 0 18px rgba(250,247,240,0.95), 0 0 6px rgba(250,247,240,0.9)';
const FADE = 9; // half-length of the plain scene dissolve, frames

// t = second the line starts (tools.py cues, or the audio's word timings). Page 0 is styled as the title.
type Page = {t: number; scene: string; zh: string; py?: string; en: string};
const PAGES: Page[] = [
  // {t: 0, scene: 'title', zh: '标题', py: 'biāo tí', en: 'Title'},
  // {t: 12.4, scene: 'line1', zh: '第一句，第二半。', py: 'dì yī jù dì èr bàn', en: 'First line.'},
];

const startF = (i: number) => Math.round(PAGES[i].t * FPS);
const endF = (i: number) => (i + 1 < PAGES.length ? startF(i + 1) : CREDITS ?? TOTAL);

// one column per character, pinyin above; punctuation hangs off the previous character
const tokens = (p: Page) => {
  const py = p.py?.split(' ') ?? [];
  const out: {ch: string; py: string; punct: string}[] = [];
  for (const ch of p.zh) {
    if ('，。、；：？！'.includes(ch) && out.length) out[out.length - 1].punct += ch;
    else out.push({ch, py: py[out.length] ?? '', punct: ''});
  }
  return out;
};

const Lyrics: React.FC<{p: Page; title: boolean}> = ({p, title}) => {
  const size = title ? 190 : 100;
  return (
    <AbsoluteFill style={{alignItems: 'center', paddingTop: title ? 90 : 58}}>
      <div style={{display: 'flex'}}>
        {tokens(p).map((t, k) => (
          <div key={k} style={{width: title ? 270 : 128, marginRight: t.punct.includes('，') ? 40 : 0, display: 'flex', flexDirection: 'column', alignItems: 'center'}}>
            {p.py && <div style={{fontFamily: PY, fontSize: title ? 50 : 36, color: '#5f4e3d', textShadow: GLOW}}>{t.py}</div>}
            <div style={{position: 'relative', fontFamily: ZH, fontSize: size, lineHeight: 1.12, color: INK, textShadow: GLOW}}>
              {t.ch}
              <span style={{position: 'absolute', left: '88%', bottom: 0, fontSize: size * 0.62}}>{t.punct}</span>
            </div>
          </div>
        ))}
      </div>
      <div style={{fontFamily: EN, fontStyle: 'italic', fontSize: title ? 54 : 40, color: '#3d3228', marginTop: title ? 10 : 18, textShadow: GLOW}}>{p.en}</div>
    </AbsoluteFill>
  );
};

export const Video: React.FC = () => {
  const f = useCurrentFrame();
  const cur = PAGES.reduce((c, _, i) => (startF(i) <= f ? i : c), 0);
  const textEnd = CREDITS ?? TOTAL;
  return (
    <AbsoluteFill style={{backgroundColor: '#f4f0e8'}}>
      {/* scenes: the next page dissolves in over the current one */}
      {PAGES.map((p, i) => {
        const s = startF(i), e = endF(i);
        if (f < s - FADE || f >= e + FADE) return null;
        const Scene = SCENES[p.scene];
        return (
          <AbsoluteFill key={i} style={{opacity: i === 0 ? 1 : interpolate(f, [s - FADE, s + FADE], [0, 1], clamp)}}>
            <Scene lf={f - s} len={e - s} />
            {/* paper wash so the text reads over any painting */}
            <AbsoluteFill style={{background: `linear-gradient(to bottom, rgba(247,244,237,0.82) 0%, rgba(247,244,237,0.6) ${i === 0 ? 34 : 22}%, rgba(247,244,237,0) ${i === 0 ? 52 : 36}%)`}} />
          </AbsoluteFill>
        );
      })}
      {/* text is not animated: it cuts on the cue, so two lines never overlap mid-dissolve */}
      {PAGES.length > 0 && f < textEnd && <Lyrics p={PAGES[cur]} title={cur === 0} />}
      {CREDITS !== null && (
        <Sequence from={CREDITS - FADE}>
          <AbsoluteFill style={{opacity: interpolate(f, [CREDITS - FADE, CREDITS + FADE], [0, 1], clamp)}}>
            <OffthreadVideo src={staticFile('orig.mp4')} trimBefore={CREDITS - FADE} muted />
          </AbsoluteFill>
        </Sequence>
      )}
      <AbsoluteFill style={{backgroundColor: '#f6f2eb', opacity: interpolate(f, [0, 30], [1, 0], clamp)}} />
      <AbsoluteFill style={{backgroundColor: 'black', opacity: interpolate(f, [TOTAL - 30, TOTAL - 1], [0, 1], clamp)}} />
    </AbsoluteFill>
  );
};
