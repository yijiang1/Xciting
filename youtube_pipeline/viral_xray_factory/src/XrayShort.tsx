import React, {useMemo} from 'react';
import {
  AbsoluteFill,
  Audio,
  Loop,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import {concepts, FPS, HEIGHT, VideoConcept, WIDTH} from './concepts';
import {ThinkersPodcastScene} from './ThinkersPodcast';
import {CaptionWord, buildCaptionPages} from './captions';
import timings from '../public/data/timings.json';
import footageManifest from '../public/data/footage.json';
import musicManifest from '../public/data/music.json';

type BeatTiming = {
  start: number;
  end: number;
  text: string;
  visual: string;
  speaker?: string;
  role?: 'host' | 'physicist' | 'humanist' | 'artist-history';
};

type Timings = Record<string, {duration: number; beats: BeatTiming[]; words?: CaptionWord[]}>;
type FootageClip = {beat?: number; file: string; seconds?: number};
type FootageManifest = Record<string, {mode: 'per-beat' | 'ambient'; clips: FootageClip[]}>;

const timingData = timings as Timings;
const footageData = footageManifest as FootageManifest;
const musicData = musicManifest as Record<string, string>;

export const XrayShort: React.FC<{conceptId: string}> = ({conceptId}) => {
  const concept = concepts.find((item) => item.id === conceptId) ?? concepts[0];
  const frame = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const seconds = frame / FPS;
  const timing = timingData[concept.id];
  const beats = timing?.beats ?? fallbackBeats(concept, durationInFrames / FPS);
  const words = timing?.words;
  const activeIndex = Math.max(0, beats.findIndex((beat) => seconds >= beat.start && seconds < beat.end));
  const activeBeat = beats[activeIndex] ?? beats[beats.length - 1];
  const beatProgress = activeBeat ? clamp((seconds - activeBeat.start) / Math.max(activeBeat.end - activeBeat.start, 0.1)) : 0;
  const globalProgress = frame / Math.max(durationInFrames - 1, 1);

  const footage = footageData[concept.id];
  const hasFootage = Boolean(footage && footage.clips.length > 0);
  const musicFile = musicData[concept.id];
  const isRoundtable = concept.style === 'roundtable';

  // The roundtable keeps its stylized scene, with ambient footage as a living
  // backdrop behind it. Shorts go full-bleed footage when clips exist.
  const showProceduralScene = !hasFootage || isRoundtable;

  return (
    <AbsoluteFill style={{background: concept.palette.bg, color: concept.palette.ink, fontFamily: 'Inter, Arial, sans-serif'}}>
      <Audio src={staticFile(`audio/${concept.id}.mp3`)} />
      {musicFile ? (
        <Audio
          loop
          src={staticFile(musicFile)}
          volume={(f) =>
            interpolate(f, [0, 45, durationInFrames - 60, durationInFrames - 5], [0, 0.09, 0.09, 0], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            })
          }
        />
      ) : null}

      {hasFootage ? (
        <FootageLayer footage={footage} beats={beats} durationInFrames={durationInFrames} dimmed={isRoundtable} />
      ) : (
        <Background concept={concept} progress={globalProgress} />
      )}

      {showProceduralScene ? (
        <Scene
          concept={concept}
          beatIndex={activeIndex}
          beatProgress={beatProgress}
          seconds={seconds}
          activeBeat={activeBeat}
          overFootage={hasFootage}
        />
      ) : null}

      <CinemaGrade concept={concept} frame={frame} strong={hasFootage && !isRoundtable} />
      <Header concept={concept} progress={globalProgress} minimal={hasFootage && !isRoundtable} />
      {words && words.length > 0 ? (
        <KaraokeCaption words={words} seconds={seconds} concept={concept} speaker={activeBeat?.speaker} />
      ) : (
        <Caption text={activeBeat?.text ?? concept.hook} concept={concept} />
      )}
    </AbsoluteFill>
  );
};

const fallbackBeats = (concept: VideoConcept, duration: number): BeatTiming[] => {
  const slice = duration / concept.beats.length;
  return concept.beats.map((beat, index) => ({
    ...beat,
    start: index * slice,
    end: (index + 1) * slice,
  }));
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

// ---------------------------------------------------------------------------
// Generated footage layer: per-beat clips with crossfades and a slow Ken Burns
// drift so held frames never feel static.
// ---------------------------------------------------------------------------

const CROSSFADE_FRAMES = 14;

const FootageLayer: React.FC<{
  footage: {mode: 'per-beat' | 'ambient'; clips: FootageClip[]};
  beats: BeatTiming[];
  durationInFrames: number;
  dimmed: boolean;
}> = ({footage, beats, durationInFrames, dimmed}) => {
  const clipForBeat = (index: number): FootageClip | null => {
    if (footage.mode === 'ambient') {
      return footage.clips[index % footage.clips.length] ?? null;
    }
    const exact = footage.clips.find((clip) => clip.beat === index);
    if (exact) return exact;
    // Reuse the nearest earlier clip when a beat failed to generate.
    for (let i = index - 1; i >= 0; i -= 1) {
      const previous = footage.clips.find((clip) => clip.beat === i);
      if (previous) return previous;
    }
    return footage.clips[0] ?? null;
  };

  return (
    <AbsoluteFill style={{opacity: dimmed ? 0.5 : 1}}>
      {beats.map((beat, index) => {
        const clip = clipForBeat(index);
        if (!clip) return null;
        const from = Math.max(0, Math.round(beat.start * FPS) - (index === 0 ? 0 : CROSSFADE_FRAMES));
        const until = index === beats.length - 1 ? durationInFrames : Math.round(beat.end * FPS);
        const clipDuration = Math.max(until - from, 1);
        return (
          <Sequence key={`${index}-${clip.file}`} from={from} durationInFrames={clipDuration} layout="none">
            <FootageClipView clip={clip} index={index} clipDuration={clipDuration} fadeIn={index > 0} />
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};

const FootageClipView: React.FC<{clip: FootageClip; index: number; clipDuration: number; fadeIn: boolean}> = ({
  clip,
  index,
  clipDuration,
  fadeIn,
}) => {
  const frame = useCurrentFrame();
  const opacity = fadeIn ? interpolate(frame, [0, CROSSFADE_FRAMES], [0, 1], {extrapolateRight: 'clamp'}) : 1;
  // Alternate slow push-in / pull-out per beat.
  const drift = interpolate(frame, [0, clipDuration], index % 2 === 0 ? [1.04, 1.12] : [1.12, 1.04]);
  const panX = interpolate(frame, [0, clipDuration], index % 3 === 0 ? [-12, 12] : [10, -10]);
  const loopFrames = Math.max(1, Math.round((clip.seconds ?? 8) * FPS) - 2);
  return (
    <AbsoluteFill style={{opacity}}>
      <Loop durationInFrames={loopFrames} layout="none">
        <OffthreadVideo
          muted
          src={staticFile(clip.file)}
          style={{
            position: 'absolute',
            inset: 0,
            width: WIDTH,
            height: HEIGHT,
            objectFit: 'cover',
            transform: `scale(${drift.toFixed(4)}) translateX(${panX.toFixed(1)}px)`,
          }}
        />
      </Loop>
    </AbsoluteFill>
  );
};

// ---------------------------------------------------------------------------
// Cinematic grade: palette-tinted gradient, vignette, and animated film grain.
// ---------------------------------------------------------------------------

const CinemaGrade: React.FC<{concept: VideoConcept; frame: number; strong: boolean}> = ({concept, frame, strong}) => (
  <AbsoluteFill style={{pointerEvents: 'none'}}>
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `linear-gradient(180deg, rgba(0,0,0,${strong ? 0.34 : 0.12}) 0%, rgba(0,0,0,0) 26%, rgba(0,0,0,0) 62%, rgba(0,0,0,${strong ? 0.52 : 0.2}) 100%)`,
      }}
    />
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse at center, rgba(0,0,0,0) 58%, rgba(0,0,0,${strong ? 0.42 : 0.18}) 100%)`,
      }}
    />
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', inset: 0, opacity: 0.05, transform: `translate(${(frame % 4) * 2 - 3}px, ${(frame % 3) * 2 - 2}px)`}}>
      <filter id="xsGrain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed="7" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width={WIDTH} height={HEIGHT} filter="url(#xsGrain)" />
    </svg>
  </AbsoluteFill>
);

// ---------------------------------------------------------------------------
// Karaoke captions: word-accurate highlight from Whisper timestamps.
// ---------------------------------------------------------------------------

const KaraokeCaption: React.FC<{words: CaptionWord[]; seconds: number; concept: VideoConcept; speaker?: string}> = ({
  words,
  seconds,
  concept,
  speaker,
}) => {
  const pages = useMemo(() => buildCaptionPages(words, {maxWords: 4, maxDuration: 2.6, maxGap: 0.7}), [words]);
  const page = pages.find((candidate) => seconds >= candidate.start && seconds < candidate.end);
  if (!page) return null;

  const isRoundtable = concept.style === 'roundtable';
  const entry = clamp((seconds - page.start) / 0.14);
  const pop = 0.94 + 0.06 * entry;
  const fontSize = isRoundtable ? 46 : 66;

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: isRoundtable ? 54 : 92,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 14,
        transform: `scale(${pop.toFixed(3)})`,
        opacity: entry,
      }}
    >
      {isRoundtable && speaker ? (
        <div
          style={{
            fontSize: 26,
            fontWeight: 900,
            letterSpacing: 2,
            textTransform: 'uppercase',
            color: concept.palette.accent,
            background: 'rgba(0,0,0,0.55)',
            borderRadius: 999,
            padding: '6px 22px',
          }}
        >
          {speaker}
        </div>
      ) : null}
      <div
        style={{
          display: 'flex',
          gap: '0.34em',
          flexWrap: 'wrap',
          justifyContent: 'center',
          maxWidth: 1500,
          fontSize,
          fontWeight: 900,
          lineHeight: 1.12,
          textShadow: '0 3px 0 rgba(0,0,0,0.85), 0 0 26px rgba(0,0,0,0.9), 0 8px 34px rgba(0,0,0,0.7)',
        }}
      >
        {page.words.map((word, index) => {
          const active = seconds >= word.start && seconds < Math.max(word.end, word.start + 0.12);
          const spoken = seconds >= word.start;
          return (
            <span
              key={`${word.start}-${index}`}
              style={{
                color: active ? concept.palette.accent : spoken ? concept.palette.ink : 'rgba(255,255,255,0.82)',
                transform: active ? 'scale(1.09)' : 'scale(1)',
                display: 'inline-block',
                transition: 'none',
              }}
            >
              {word.text}
            </span>
          );
        })}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Chrome (header + fallback caption)
// ---------------------------------------------------------------------------

const Header: React.FC<{concept: VideoConcept; progress: number; minimal?: boolean}> = ({concept, progress, minimal}) => {
  const titleIn = interpolate(progress, [0, 0.06], [-40, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const brand = concept.style === 'roundtable' ? 'Imaginary Roundtable' : 'Exciting';
  if (minimal) {
    // Over generated footage, keep the chrome light so the picture breathes.
    return (
      <div style={{position: 'absolute', left: 56, top: 44, display: 'flex', alignItems: 'center', gap: 18, transform: `translateY(${titleIn}px)`, opacity: clamp(progress / 0.04) * 0.92}}>
        <div style={{fontSize: 26, letterSpacing: 3, textTransform: 'uppercase', color: concept.palette.accent2, fontWeight: 900, background: 'rgba(0,0,0,0.42)', borderRadius: 999, padding: '8px 20px'}}>
          {brand}
        </div>
        <div style={{fontSize: 30, fontWeight: 800, opacity: 0.94, textShadow: '0 2px 14px rgba(0,0,0,0.8)'}}>{concept.title}</div>
      </div>
    );
  }
  return (
    <div style={{position: 'absolute', left: 64, top: 52, right: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between'}}>
      <div style={{transform: `translateY(${titleIn}px)`, opacity: clamp(progress / 0.04)}}>
        <div style={{fontSize: 32, letterSpacing: 0, color: concept.palette.accent2, fontWeight: 800}}>{brand}</div>
        <div style={{fontSize: concept.style === 'roundtable' ? 56 : 62, fontWeight: 900, lineHeight: 1.05, maxWidth: 1160}}>{concept.title}</div>
      </div>
      <div style={{border: `2px solid ${concept.palette.accent}`, borderRadius: 999, padding: '14px 22px', fontSize: 28, fontWeight: 800, background: 'rgba(0,0,0,0.22)'}}>
        {concept.topic}
      </div>
    </div>
  );
};

const Caption: React.FC<{text: string; concept: VideoConcept}> = ({text, concept}) => {
  const isRoundtable = concept.style === 'roundtable';
  return (
  <div
    style={{
      position: 'absolute',
      left: isRoundtable ? 120 : 150,
      right: isRoundtable ? 120 : 150,
      bottom: isRoundtable ? 50 : 70,
      minHeight: isRoundtable ? 150 : 126,
      borderRadius: 18,
      padding: isRoundtable ? '24px 36px' : '26px 34px',
      background: 'rgba(0,0,0,0.64)',
      boxShadow: '0 18px 60px rgba(0,0,0,0.28)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      fontSize: isRoundtable ? 34 : 44,
      lineHeight: isRoundtable ? 1.18 : 1.16,
      fontWeight: 850,
    }}
  >
    {text}
  </div>
  );
};

const Background: React.FC<{concept: VideoConcept; progress: number}> = ({concept, progress}) => {
  const pulse = Math.sin(progress * Math.PI * 2);
  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(circle at ${25 + progress * 50}% ${30 + pulse * 10}%, ${concept.palette.panel} 0%, ${concept.palette.bg} 54%, #05070C 100%)`,
        }}
      />
      <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', inset: 0, opacity: 0.42}}>
        {Array.from({length: 18}).map((_, i) => {
          const y = 150 + i * 48 + Math.sin(progress * 8 + i) * 10;
          return <line key={i} x1={-80} x2={WIDTH + 80} y1={y} y2={y + 110} stroke={concept.palette.accent} strokeOpacity={0.05 + (i % 3) * 0.025} strokeWidth={3} />;
        })}
      </svg>
    </>
  );
};

const Scene: React.FC<{concept: VideoConcept; beatIndex: number; beatProgress: number; seconds: number; activeBeat?: BeatTiming; overFootage?: boolean}> = ({
  concept,
  beatIndex,
  beatProgress,
  seconds,
  activeBeat,
  overFootage,
}) => {
  if (concept.style === 'roundtable')
    return (
      <ThinkersPodcastScene
        concept={concept}
        beatIndex={beatIndex}
        beatProgress={beatProgress}
        seconds={seconds}
        activeBeat={activeBeat}
        dimBackdrop={overFootage}
      />
    );
  // Documentary-style concepts are footage-first; without footage the plain
  // graded background plus karaoke captions carries the story.
  if (concept.style === 'mockumentary') return null;
  if (concept.style === 'cartoon') return <CartoonScene concept={concept} beatIndex={beatIndex} beatProgress={beatProgress} seconds={seconds} />;
  if (concept.style === 'interview') return <InterviewScene concept={concept} beatIndex={beatIndex} beatProgress={beatProgress} seconds={seconds} />;
  if (concept.style === 'gameshow') return <GameShowScene concept={concept} beatIndex={beatIndex} beatProgress={beatProgress} seconds={seconds} />;
  if (concept.style === 'noir') return <NoirScene concept={concept} beatIndex={beatIndex} beatProgress={beatProgress} seconds={seconds} />;
  return <NewsScene concept={concept} beatIndex={beatIndex} beatProgress={beatProgress} seconds={seconds} />;
};

const CartoonScene: React.FC<SceneProps> = ({concept, beatIndex, beatProgress, seconds}) => {
  const pop = spring({frame: beatProgress * 35, fps: FPS, config: {damping: 12, stiffness: 120}});
  return (
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', inset: 0}}>
      <AtomLattice y={420} color={concept.palette.accent2} />
      <Photon x={280 + beatProgress * 240} y={520 + Math.sin(seconds * 4) * 12} color={concept.palette.accent} scale={1.1 + pop * 0.18} />
      <RayPath color={concept.palette.accent} low={beatIndex >= 2} highlight={beatIndex >= 3} />
      {beatIndex >= 5 && <Formula x={620} y={310} text="nλ = 2d sinθ" color={concept.palette.accent} />}
      <ComicBubble x={1180} y={300} text={beatIndex < 5 ? 'CLUE!' : 'PEAK!'} color={concept.palette.accent2} scale={pop} />
    </svg>
  );
};

const InterviewScene: React.FC<SceneProps> = ({concept, beatIndex, beatProgress, seconds}) => {
  return (
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', inset: 0}}>
      <rect x={250} y={280} width={1420} height={390} rx={24} fill={concept.palette.panel} opacity={0.88} />
      <Mic x={580} y={540} color={concept.palette.accent} />
      <Mic x={1340} y={540} color={concept.palette.accent2} />
      <SpeakerAvatar x={470} y={390} label="X-ray" color={concept.palette.accent} talking={beatIndex % 2 === 0} seconds={seconds} />
      <SpeakerAvatar x={1230} y={390} label="Atom" color={concept.palette.accent2} talking={beatIndex % 2 === 1} seconds={seconds} />
      <ShellDiagram x={960} y={490} color={concept.palette.accent} active={beatIndex >= 3} />
      {beatIndex >= 3 && <MiniGraph x={705} y={705} color={concept.palette.accent2} label="edge jump" />}
      <LowerThird text={beatIndex < 3 ? 'LIVE: photon energy vs inner-shell electrons' : 'XAS reads oxidation state and local geometry'} color={concept.palette.accent} />
    </svg>
  );
};

const GameShowScene: React.FC<SceneProps> = ({concept, beatIndex, beatProgress, seconds}) => {
  const reveal = beatIndex >= 4 ? 1 : beatProgress;
  return (
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', inset: 0}}>
      <rect x={0} y={250} width={WIDTH} height={440} fill={concept.palette.panel} opacity={0.62} />
      <text x={WIDTH / 2} y={305} fill={concept.palette.accent2} fontSize={58} fontWeight={900} textAnchor="middle">GUESS THAT PEAK</text>
      <PeakChart x={340} y={650} width={1220} height={330} color={concept.palette.accent} accent={concept.palette.accent2} reveal={reveal} broaden={beatIndex >= 3} />
      {[0, 1, 2].map((i) => (
        <Podium key={i} x={480 + i * 360} y={520} label={`${i + 1}`} color={i === beatIndex % 3 ? concept.palette.accent2 : concept.palette.accent} seconds={seconds + i} />
      ))}
      {beatIndex >= 5 && <Formula x={660} y={370} text="positions = phases • widths = size/strain" color={concept.palette.accent2} />}
    </svg>
  );
};

const NoirScene: React.FC<SceneProps> = ({concept, beatIndex, beatProgress, seconds}) => (
  <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', inset: 0}}>
    <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="url(#noirShade)" opacity={0.55} />
    <defs>
      <linearGradient id="noirShade" x1="0" x2="1">
        <stop offset="0" stopColor="#000" />
        <stop offset="0.5" stopColor="#1f1f1f" />
        <stop offset="1" stopColor="#000" />
      </linearGradient>
    </defs>
    <NoirBlinds seconds={seconds} />
    <ElectronTrail x={420} y={530} color={concept.palette.accent2} progress={beatProgress} />
    <ScatteringShell x={1020} y={515} color={concept.palette.accent} active={beatIndex >= 1} seconds={seconds} />
    {beatIndex >= 2 && <Oscillation x={1130} y={650} color={concept.palette.accent2} />}
    {beatIndex >= 4 && <RadialPeaks x={520} y={710} color={concept.palette.accent} />}
  </svg>
);

const NewsScene: React.FC<SceneProps> = ({concept, beatIndex, beatProgress, seconds}) => (
  <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', inset: 0}}>
    <rect x={210} y={250} width={1500} height={440} rx={22} fill={concept.palette.panel} opacity={0.78} />
    <text x={290} y={325} fill={concept.palette.accent2} fontSize={48} fontWeight={900}>SYNCHROTRON WEATHER</text>
    <StorageRing x={660} y={520} color={concept.palette.accent} progress={seconds} />
    <Beamline x={1000} y={520} color={concept.palette.accent2} beatIndex={beatIndex} beatProgress={beatProgress} />
    <NewsTicker text={tickerFor(beatIndex)} color={concept.palette.accent2} />
    <ForecastCard x={1280} y={350} color={concept.palette.accent} beatIndex={beatIndex} />
  </svg>
);

type SceneProps = {
  concept: VideoConcept;
  beatIndex: number;
  beatProgress: number;
  seconds: number;
  activeBeat?: BeatTiming;
};

const AtomLattice: React.FC<{y: number; color: string}> = ({y, color}) => (
  <g>
    {[0, 1, 2].map((row) => (
      <g key={row}>
        <line x1={520} x2={1480} y1={y + row * 110} y2={y + row * 110} stroke={color} strokeWidth={5} opacity={0.42} />
        {Array.from({length: 8}).map((_, i) => (
          <circle key={i} cx={560 + i * 130 + (row % 2) * 65} cy={y + row * 110} r={22} fill={color} opacity={0.85} />
        ))}
      </g>
    ))}
  </g>
);

const Photon: React.FC<{x: number; y: number; color: string; scale: number}> = ({x, y, color, scale}) => (
  <g transform={`translate(${x} ${y}) scale(${scale})`}>
    <circle r={44} fill={color} opacity={0.95} />
    <path d="M-58 0 C-35 -42, -10 42, 18 0 S65 38, 78 0" fill="none" stroke="#fff" strokeWidth={9} strokeLinecap="round" />
  </g>
);

const RayPath: React.FC<{color: string; low: boolean; highlight: boolean}> = ({color, low, highlight}) => (
  <g fill="none" strokeLinecap="round" strokeLinejoin="round">
    <path d="M250 370 L820 510 L1370 370" stroke={color} strokeWidth={11} opacity={0.8} />
    {low && <path d="M250 485 L900 620 L1490 485" stroke="#FF7A59" strokeWidth={11} opacity={0.86} />}
    {highlight && <path d="M870 510 L920 620 L970 510" stroke="#FFF5A3" strokeWidth={8} opacity={0.95} />}
  </g>
);

const Formula: React.FC<{x: number; y: number; text: string; color: string}> = ({x, y, text, color}) => (
  <g>
    <rect x={x - 30} y={y - 70} width={780} height={118} rx={20} fill="rgba(0,0,0,0.55)" stroke={color} strokeWidth={4} />
    <text x={x} y={y} fill={color} fontSize={66} fontWeight={900}>{text}</text>
  </g>
);

const ComicBubble: React.FC<{x: number; y: number; text: string; color: string; scale: number}> = ({x, y, text, color, scale}) => (
  <g transform={`translate(${x} ${y}) scale(${0.8 + scale * 0.25})`}>
    <path d="M0 -78 L28 -24 L92 -30 L44 16 L62 80 L0 42 L-62 80 L-44 16 L-92 -30 L-28 -24 Z" fill={color} opacity={0.92} />
    <text y={12} fill="#111827" fontSize={38} fontWeight={900} textAnchor="middle">{text}</text>
  </g>
);

const Mic: React.FC<{x: number; y: number; color: string}> = ({x, y, color}) => (
  <g transform={`translate(${x} ${y})`}>
    <rect x={-22} y={-70} width={44} height={100} rx={22} fill={color} />
    <path d="M-58 -10 C-55 60, 55 60, 58 -10" fill="none" stroke={color} strokeWidth={9} />
    <line x1={0} y1={65} x2={0} y2={112} stroke={color} strokeWidth={9} />
  </g>
);

const SpeakerAvatar: React.FC<{x: number; y: number; label: string; color: string; talking: boolean; seconds: number}> = ({x, y, label, color, talking, seconds}) => {
  const mouth = talking ? 12 + 8 * Math.abs(Math.sin(seconds * 10)) : 6;
  return (
    <g transform={`translate(${x} ${y})`}>
      <circle r={92} fill={color} opacity={0.92} />
      <circle cx={-28} cy={-18} r={12} fill="#0b1020" />
      <circle cx={28} cy={-18} r={12} fill="#0b1020" />
      <rect x={-38} y={32 - mouth / 2} width={76} height={mouth} rx={mouth / 2} fill="#0b1020" />
      <text y={145} fill="#fff" fontSize={34} fontWeight={900} textAnchor="middle">{label}</text>
    </g>
  );
};

const ShellDiagram: React.FC<{x: number; y: number; color: string; active: boolean}> = ({x, y, color, active}) => (
  <g transform={`translate(${x} ${y})`} fill="none" stroke={color}>
    {[48, 86, 124].map((r) => <circle key={r} r={r} strokeWidth={5} opacity={0.42} />)}
    <circle r={14} fill={color} stroke="none" />
    <circle cx={active ? 150 : 82} cy={active ? -126 : -26} r={15} fill={active ? '#FCA5A5' : color} stroke="none" />
    {active && <path d="M65 -24 C100 -52, 120 -88, 150 -126" stroke="#FCA5A5" strokeWidth={7} />}
  </g>
);

const MiniGraph: React.FC<{x: number; y: number; color: string; label: string}> = ({x, y, color, label}) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M0 120 L110 120 L140 30 L330 30" fill="none" stroke={color} strokeWidth={8} />
    <text x={350} y={42} fill={color} fontSize={32} fontWeight={800}>{label}</text>
  </g>
);

const LowerThird: React.FC<{text: string; color: string}> = ({text, color}) => (
  <g>
    <rect x={360} y={720} width={1200} height={72} rx={14} fill="rgba(0,0,0,0.56)" stroke={color} strokeWidth={3} />
    <text x={960} y={768} fill="#fff" fontSize={32} fontWeight={800} textAnchor="middle">{text}</text>
  </g>
);

const PeakChart: React.FC<{x: number; y: number; width: number; height: number; color: string; accent: string; reveal: number; broaden: boolean}> = ({x, y, width, height, color, accent, reveal, broaden}) => {
  const peaks = [0.18, 0.47, 0.78];
  return (
    <g transform={`translate(${x} ${y})`}>
      <line x1={0} y1={0} x2={width} y2={0} stroke="#fff" strokeOpacity={0.28} strokeWidth={4} />
      {peaks.map((p, i) => {
        const px = p * width;
        const h = [230, 300, 190][i] * reveal;
        const w = broaden && i === 1 ? 70 : 30;
        return <path key={p} d={`M${px - w} 0 C${px - w / 2} ${-h * 0.2}, ${px - w / 3} ${-h}, ${px} ${-h} C${px + w / 3} ${-h}, ${px + w / 2} ${-h * 0.2}, ${px + w} 0`} fill="none" stroke={i === 1 ? accent : color} strokeWidth={9} />;
      })}
    </g>
  );
};

const Podium: React.FC<{x: number; y: number; label: string; color: string; seconds: number}> = ({x, y, label, color, seconds}) => (
  <g transform={`translate(${x} ${y + Math.sin(seconds * 2) * 8})`}>
    <rect x={-88} y={0} width={176} height={102} rx={16} fill={color} opacity={0.92} />
    <text y={68} fill="#111827" fontSize={52} fontWeight={900} textAnchor="middle">{label}</text>
  </g>
);

const NoirBlinds: React.FC<{seconds: number}> = ({seconds}) => (
  <g opacity={0.42}>
    {Array.from({length: 12}).map((_, i) => (
      <rect key={i} x={-80} y={140 + i * 70 + Math.sin(seconds + i) * 4} width={WIDTH + 160} height={28} fill="#000" />
    ))}
  </g>
);

const ElectronTrail: React.FC<{x: number; y: number; color: string; progress: number}> = ({x, y, color, progress}) => (
  <g transform={`translate(${x} ${y})`}>
    <path d={`M0 0 C180 -160, 380 160, ${520 * progress + 80} 0`} stroke={color} strokeWidth={10} fill="none" strokeLinecap="round" />
    <circle cx={520 * progress + 80} cy={0} r={22} fill={color} />
  </g>
);

const ScatteringShell: React.FC<{x: number; y: number; color: string; active: boolean; seconds: number}> = ({x, y, color, active, seconds}) => (
  <g transform={`translate(${x} ${y})`} opacity={active ? 1 : 0.32}>
    {[0, 1, 2, 3].map((i) => {
      const angle = (Math.PI * 2 * i) / 4 + 0.25;
      const px = Math.cos(angle) * 180;
      const py = Math.sin(angle) * 110;
      return <circle key={i} cx={px} cy={py} r={34 + Math.sin(seconds * 4 + i) * 3} fill={color} />;
    })}
    <circle r={38} fill="#fff" />
    {[80, 135, 195].map((r) => <circle key={r} r={r} fill="none" stroke={color} strokeWidth={4} opacity={0.25} />)}
  </g>
);

const Oscillation: React.FC<{x: number; y: number; color: string}> = ({x, y, color}) => {
  const pts = Array.from({length: 80}).map((_, i) => {
    const px = (i / 79) * 520;
    const py = Math.sin(i * 0.42) * (70 * (1 - i / 100));
    return `${px},${py}`;
  });
  return (
    <g transform={`translate(${x} ${y})`}>
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth={7} />
      <text x={0} y={-90} fill={color} fontSize={34} fontWeight={900}>χ(k) oscillations</text>
    </g>
  );
};

const RadialPeaks: React.FC<{x: number; y: number; color: string}> = ({x, y, color}) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M0 90 C50 90, 50 -20, 92 -20 C135 -20, 136 90, 188 90 C240 90, 245 25, 290 25 C335 25, 342 90, 400 90" fill="none" stroke={color} strokeWidth={8} />
    <text x={0} y={142} fill={color} fontSize={32} fontWeight={900}>neighbor distances</text>
  </g>
);

const StorageRing: React.FC<{x: number; y: number; color: string; progress: number}> = ({x, y, color, progress}) => (
  <g transform={`translate(${x} ${y})`}>
    <ellipse rx={230} ry={135} fill="none" stroke={color} strokeWidth={12} opacity={0.82} />
    <circle cx={Math.cos(progress * 1.8) * 230} cy={Math.sin(progress * 1.8) * 135} r={18} fill="#fff" />
    <text y={230} fill="#fff" fontSize={34} fontWeight={900} textAnchor="middle">storage ring</text>
  </g>
);

const Beamline: React.FC<{x: number; y: number; color: string; beatIndex: number; beatProgress: number}> = ({x, y, color, beatIndex, beatProgress}) => (
  <g transform={`translate(${x} ${y})`}>
    <line x1={-120} y1={0} x2={470} y2={0} stroke={color} strokeWidth={12} strokeLinecap="round" />
    <rect x={30} y={-45} width={90} height={90} rx={14} fill={beatIndex >= 2 ? '#fff' : color} opacity={0.92} />
    <rect x={220} y={-58} width={110} height={116} rx={14} fill={beatIndex >= 3 ? '#fff' : color} opacity={0.92} />
    <circle cx={470 * beatProgress} cy={0} r={20} fill="#fff" />
    <text x={36} y={96} fill="#fff" fontSize={26} fontWeight={800}>mono</text>
    <text x={226} y={112} fill="#fff" fontSize={26} fontWeight={800}>sample</text>
  </g>
);

const NewsTicker: React.FC<{text: string; color: string}> = ({text, color}) => (
  <g>
    <rect x={0} y={850} width={WIDTH} height={76} fill={color} />
    <text x={70} y={900} fill="#05121E" fontSize={34} fontWeight={950}>BREAKING: {text}</text>
  </g>
);

const ForecastCard: React.FC<{x: number; y: number; color: string; beatIndex: number}> = ({x, y, color, beatIndex}) => (
  <g transform={`translate(${x} ${y})`}>
    <rect width={320} height={230} rx={20} fill="rgba(0,0,0,0.48)" stroke={color} strokeWidth={4} />
    <text x={28} y={58} fill={color} fontSize={34} fontWeight={900}>Beam forecast</text>
    <text x={28} y={122} fill="#fff" fontSize={30} fontWeight={800}>{beatIndex >= 2 ? 'Monochromatic' : 'Broadband'}</text>
    <text x={28} y={174} fill="#fff" fontSize={30} fontWeight={800}>{beatIndex >= 4 ? 'Data likely' : 'Aligning optics'}</text>
  </g>
);

const tickerFor = (beatIndex: number) =>
  ['relativistic electrons remain stable', 'undulators create bright X-rays', 'monochromator selects energy', 'mirrors focus beam', 'detectors collect evidence', 'coffee advisory in effect'][beatIndex] ?? 'photons incoming';
