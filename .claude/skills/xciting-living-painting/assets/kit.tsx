// Building blocks for animating the painted scenes.
import React from 'react';
import {Easing, Img, interpolate, random, staticFile} from 'remotion';

export const clamp = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;
export type SceneProps = {lf: number; len: number}; // frame within page, page length

// ---------- camera over a painting ----------
export type Cam = [cx: number, cy: number, zoom: number]; // focus point (0..1 of the image) and zoom (1 = just covers the frame)
const camAt = (keys: Cam[], p: number): Cam => {
  const q = Easing.inOut(Easing.sin)(Math.min(1, Math.max(0, p))) * (keys.length - 1);
  const i = Math.min(keys.length - 2, Math.floor(q)), t = q - i;
  return keys[i].map((v, j) => v + (keys[i + 1][j] - v) * t) as Cam;
};

// Water shimmer: streaky noise that drifts sideways, displacing a copy of the painting below the waterline.
// The noise only exists inside the filter region, so its drift must stay within the 30% margin or the
// empty edge slides into view as a hard vertical tear. Drift therefore sways (sine) within TRAVEL px.
const TRAVEL = 320;
const drift = (lf: number, v: number) => TRAVEL * Math.sin((lf * v) / TRAVEL);
export const Shimmer: React.FC<{id: string; lf: number; scale: number; freq?: string; vx?: number; vy?: number; xOnly?: boolean}> = ({id, lf, scale, freq = '0.004 0.05', vx = 0.8, vy = 0, xOnly}) => (
  <svg width={0} height={0} style={{position: 'absolute'}}>
    <filter id={id} x="-30%" y="-30%" width="160%" height="160%">
      <feTurbulence type="fractalNoise" baseFrequency={freq} numOctaves={2} seed={3} result="n" />
      <feOffset in="n" dx={drift(lf, vx)} dy={drift(lf, vy)} result="o" />
      <feColorMatrix in="o" type="matrix" values={xOnly ? '1 0 0 0 0  0 0 0 0 0.5  0 0 1 0 0  0 0 0 1 0' : '1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 1 0'} result="m" />
      <feDisplacementMap in="SourceGraphic" in2="m" scale={scale} xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);

type PaintingProps = SceneProps & {
  src: string;
  iw?: number;
  ih?: number;
  keys: Cam[];
  water?: number | string; // image-y fraction where the water begins, or a CSS mask selecting the water
  haze?: {x: number; y: number; r: number; vy?: number}; // wavering patch (a figure that may not be there, falling water), image px
  wind?: string; // CSS mask over painted reeds/grass that should bend in travelling gusts
  layers?: React.ReactNode; // extra HTML layers that move with the painting
  anchored?: React.ReactNode; // SVG drawn in image pixel coordinates, moves with the painting
};
export const Painting: React.FC<PaintingProps> = ({src, iw = 1536, ih = 1024, keys, lf, len, water, haze, wind, layers, anchored}) => {
  const [cx, cy, z] = camAt(keys, lf / len);
  const cover = Math.max(1920 / iw, 1080 / ih) * z;
  const W = iw * cover, H = ih * cover;
  const left = Math.min(0, Math.max(1920 - W, 960 - cx * W)), top = Math.min(0, Math.max(1080 - H, 540 - cy * H));
  const img = staticFile(`scenes/${src}.png`);
  const full: React.CSSProperties = {position: 'absolute', inset: 0, width: '100%', height: '100%'};
  const mask = (m: string): React.CSSProperties => ({WebkitMaskImage: m, maskImage: m});
  return (
    <div style={{position: 'absolute', inset: 0, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left, top, width: W, height: H}}>
        <Img src={img} style={full} />
        {layers}
        {water !== undefined && (
          <>
            <Shimmer id={`w-${src}`} lf={lf} scale={10} />
            <Img src={img} style={{...full, filter: `url(#w-${src})`, ...mask(typeof water === 'string' ? water : `linear-gradient(to bottom, transparent ${water * 100}%, black ${water * 100 + 5}%)`)}} />
          </>
        )}
        {wind && (
          <>
            <Shimmer id={`g-${src}`} lf={lf} scale={22} freq="0.0035 0.009" vx={3.2} xOnly />
            <Img src={img} style={{...full, filter: `url(#g-${src})`, ...mask(wind)}} />
          </>
        )}
        {haze && (
          <>
            <Shimmer id={`h-${src}`} lf={lf} scale={9} freq="0.03 0.012" vx={0} vy={haze.vy ?? -0.8} />
            <Img src={img} style={{...full, filter: `url(#h-${src})`,
              ...mask(`radial-gradient(ellipse ${(haze.r / iw) * 100}% ${(haze.r * 1.6 / ih) * 100}% at ${(haze.x / iw) * 100}% ${(haze.y / ih) * 100}%, black 40%, transparent 100%)`)}} />
          </>
        )}
        {anchored && (
          <svg viewBox={`0 0 ${iw} ${ih}`} preserveAspectRatio="none" style={full}>
            {anchored}
          </svg>
        )}
      </div>
    </div>
  );
};

// ---------- atmosphere ----------
// a band of drifting fog (tileable texture), screen space
export const Fog: React.FC<{lf: number; y: number; h: number; speed: number; o: number; seed?: number}> = ({lf, y, h, speed, o, seed = 0}) => {
  const w = (h * 2048) / 640, x = -((((lf * speed + seed * 577) % w) + w) % w);
  return (
    <div style={{position: 'absolute', left: 0, top: y, width: 1920, height: h, overflow: 'hidden', opacity: o}}>
      {Array.from({length: Math.ceil(1920 / w) + 1}, (_, i) => (
        <Img key={i} src={staticFile('fog.png')} style={{position: 'absolute', left: x + i * w, top: 0, width: w, height: h}} />
      ))}
    </div>
  );
};
// soft round mist patch (anchored or screen)
export const Mist: React.FC<{x: number; y: number; rx: number; ry: number; o: number}> = ({x, y, rx, ry, o}) => (
  <div style={{position: 'absolute', left: x - rx, top: y - ry, width: rx * 2, height: ry * 2, borderRadius: '50%', opacity: o,
    background: 'radial-gradient(closest-side, rgba(250,248,242,0.95), rgba(250,248,242,0.6) 45%, rgba(250,248,242,0))'}} />
);
export const SvgMist: React.FC<{x: number; y: number; rx: number; ry: number; o: number; id: string}> = ({x, y, rx, ry, o, id}) => (
  <>
    <defs>
      <radialGradient id={id}>
        <stop offset={0} stopColor="rgb(250,248,242)" stopOpacity={0.95} />
        <stop offset={0.5} stopColor="rgb(250,248,242)" stopOpacity={0.55} />
        <stop offset={1} stopColor="rgb(250,248,242)" stopOpacity={0} />
      </radialGradient>
    </defs>
    <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={`url(#${id})`} opacity={o} />
  </>
);

// ---------- life ----------
// ink-stroke bird with flapping wings
export const Bird: React.FC<{x: number; y: number; s: number; lf: number; phase?: number; speed?: number; color?: string}> = ({x, y, s, lf, phase = 0, speed = 4, color = 'rgb(70,62,56)'}) => {
  const f = Math.sin(lf / speed + phase);
  return (
    <path d={`M${x - s} ${y + s * 0.15 * f} Q${x - s / 2} ${y - s * 0.55 * f} ${x} ${y} Q${x + s / 2} ${y - s * 0.55 * f} ${x + s} ${y + s * 0.15 * f}`}
      fill="none" stroke={color} strokeWidth={Math.max(1.2, s / 7)} strokeLinecap="round" />
  );
};
// twinkling glint (dew, frost, sun on water)
export const Glint: React.FC<{x: number; y: number; s: number; o: number}> = ({x, y, s, o}) =>
  o <= 0.01 ? null : (
    <g transform={`translate(${x} ${y}) scale(${s})`} opacity={o} fill="white" style={{filter: 'drop-shadow(0 0 3px white)'}}>
      <ellipse rx={12} ry={1.1} />
      <ellipse rx={1.1} ry={12} />
      <circle r={2.4} />
    </g>
  );
export const twinkle = (lf: number, seed: string, rate = 16) => Math.max(0, Math.sin(lf / rate + random(seed) * 40)) ** 8;
// expanding rings on water
export const Ripples: React.FC<{x: number; y: number; lf: number; start?: number; period?: number; max?: number; count?: number; o?: number}> = ({x, y, lf, start = 0, period = 90, max = 260, count = 3, o = 0.7}) => (
  <g fill="none" stroke="white" style={{filter: 'blur(1.6px)'}}>
    {Array.from({length: count}, (_, r) => {
      const t = lf - start - (r * period) / count;
      if (t < 0) return null;
      const p = (t % period) / period, rx = 10 + p * max;
      return <ellipse key={r} cx={x} cy={y} rx={rx} ry={rx * 0.18} strokeWidth={0.8 + (1 - p) * 2.5} opacity={Math.min(1, p * 6) * (1 - p) * o} />;
    })}
  </g>
);
// cut-out sprite, optionally swaying from its base
export const Sprite: React.FC<{src: string; x: number; y: number; w: number; sway?: number; lf: number; flip?: boolean; o?: number; phase?: number}> = ({src, x, y, w, sway = 0, lf, flip, o = 1, phase = 0}) => (
  <Img src={staticFile(`scenes/${src}.png`)} style={{position: 'absolute', left: x, top: y, width: w, opacity: o, transformOrigin: '50% 100%',
    transform: `${flip ? 'scaleX(-1) ' : ''}skewX(${sway * (Math.sin(lf / 28 + phase) + 0.35 * Math.sin(lf / 11 + phase * 2))}deg)`}} />
);
// light, fast particles (leaves, fluff, sparks) streaming across the screen
export const Stream: React.FC<{lf: number; n: number; seed: string; vx: number; vy?: number; y0: number; y1: number; draw: (i: number, x: number, y: number, r: (s: string) => number) => React.ReactNode}> = ({lf, n, seed, vx, vy = 0, y0, y1, draw}) => (
  <svg width={1920} height={1080} style={{position: 'absolute', inset: 0}}>
    {Array.from({length: n}, (_, i) => {
      const r = (s: string) => random(`${seed}${s}${i}`);
      const speed = 0.6 + r('v') * 0.8, span = 2300;
      const x = ((((r('x') * span + lf * vx * speed) % span) + span) % span) - 190;
      const y = y0 + r('y') * (y1 - y0) + lf * vy * speed + Math.sin(lf / 13 + r('p') * 6) * 14;
      return <g key={i}>{draw(i, vx > 0 ? x : 1920 - x, y, r)}</g>;
    })}
  </svg>
);
