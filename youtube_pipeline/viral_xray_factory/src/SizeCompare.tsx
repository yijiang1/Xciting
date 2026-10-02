// Labels, music and whooshes over the Blender flyover rendered by
// scripts/blender/synchrotron_compare.py. Both read the same timing from
// content/compare/synchrotrons.json, so a label shows exactly while the
// camera holds on its ring.

import React from 'react';
import {AbsoluteFill, Audio, Easing, OffthreadVideo, Sequence, interpolate, staticFile, useCurrentFrame} from 'remotion';
import data from '../content/compare/synchrotrons.json';
import type {Format} from './concepts';

const T = data.timing;
const fps = T.fps;
const intro = Math.round(T.introS * fps);
const move = Math.round(T.moveS * fps);
const hold = Math.round(T.holdS * fps);
const outroStart = intro + data.items.length * (move + hold);
export const sizeCompareFrames = outroStart + Math.round((T.outroMoveS + T.outroHoldS) * fps);

const holdStart = (i: number) => intro + i * (move + hold) + move;
const font = "Inter, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif";
const shadow = '0 2px 18px rgba(0,0,0,0.75), 0 1px 3px rgba(0,0,0,0.9)';

const fmt = (m: number) => `${m.toLocaleString('en-US', {maximumFractionDigits: 1})} m`;

const Card: React.FC<{i: number; portrait: boolean}> = ({i, portrait}) => {
  const frame = useCurrentFrame() - 10; // Sequence starts 10 frames early: 0 = arrival
  const it = data.items[i];
  const inOp = interpolate(frame, [-8, 4], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const outOp = interpolate(frame, [hold - 6, hold + 4], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  const count = interpolate(frame, [-6, 22], [0, it.circumferenceM], {
    extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: Easing.out(Easing.cubic),
  });
  const rise = interpolate(inOp, [0, 1], [24, 0]);
  return (
    <div style={{
      position: 'absolute', left: portrait ? 60 : 80, right: portrait ? 60 : undefined, top: portrait ? 190 : 80,
      opacity: inOp * outOp, transform: `translateY(${rise}px)`, color: 'white', fontFamily: font, textShadow: shadow,
    }}>
      <div style={{fontSize: portrait ? 104 : 88, fontWeight: 900, lineHeight: 1.02}}>{it.name}</div>
      <div style={{fontSize: portrait ? 40 : 34, fontWeight: 600, marginTop: 10, opacity: 0.95}}>
        {it.flag} {it.place}
      </div>
      <div style={{marginTop: portrait ? 26 : 20, display: 'flex', alignItems: 'baseline', gap: 16}}>
        <span style={{fontSize: portrait ? 92 : 78, fontWeight: 900, fontVariantNumeric: 'tabular-nums'}}>{fmt(count)}</span>
        <span style={{fontSize: portrait ? 34 : 28, fontWeight: 700, opacity: 0.85}}>ring</span>
      </div>
      {'note' in it && (
        <div style={{fontSize: portrait ? 32 : 27, fontWeight: 600, opacity: 0.85, marginTop: 4}}>{it.note}</div>
      )}
    </div>
  );
};

const Intro: React.FC<{portrait: boolean}> = ({portrait}) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [0, 8, intro - 8, intro], [0, 1, 1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 60, right: 60, top: portrait ? 190 : 80, opacity: op, color: 'white', fontFamily: font, textShadow: shadow}}>
      <div style={{fontSize: portrait ? 96 : 84, fontWeight: 900, lineHeight: 1.02, maxWidth: 1000}}>How big is an X-ray synchrotron?</div>
    </div>
  );
};

const Outro: React.FC<{portrait: boolean}> = ({portrait}) => {
  const frame = useCurrentFrame();
  const op = interpolate(frame, [20, 36], [0, 1], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'});
  return (
    <div style={{position: 'absolute', left: 60, right: 60, top: portrait ? 190 : 80, opacity: op, color: 'white', fontFamily: font, textShadow: shadow}}>
      <div style={{fontSize: portrait ? 60 : 70, fontWeight: 900, lineHeight: 1.05, whiteSpace: 'nowrap'}}>Which one have you used? 👇</div>
      {/* Portrait: just above the Shorts title/channel overlay (bottom ~20%), left-aligned clear of the side buttons. */}
      <div style={{position: 'fixed', bottom: portrait ? 440 : 40, left: portrait ? 60 : 80, maxWidth: 840, fontSize: portrait ? 40 : 32, fontWeight: 700, opacity: 0.95}}>
        Check out more videos at youtube.com/@Xciting-o8d
      </div>
    </div>
  );
};

export const SizeCompare: React.FC<{format: Format}> = ({format}) => {
  const portrait = format === 'portrait';
  return (
    <AbsoluteFill style={{background: 'black'}}>
      <OffthreadVideo src={staticFile(`footage/compare/${data.id}-${format}.mp4`)} muted />
      <AbsoluteFill style={{background: 'linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 32%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.35) 100%)'}} />
      <Sequence durationInFrames={intro}><Intro portrait={portrait} /></Sequence>
      {data.items.map((it, i) => (
        <Sequence key={it.name} from={holdStart(i) - 10} durationInFrames={hold + 20} layout="none">
          <Card i={i} portrait={portrait} />
        </Sequence>
      ))}
      <Sequence from={outroStart} layout="none"><Outro portrait={portrait} /></Sequence>
      <Audio
        src={staticFile(`footage/compare/${data.id}-music.mp3`)}
        volume={(f) => interpolate(f, [sizeCompareFrames - 45, sizeCompareFrames - 1], [1, 0], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'})}
      />
      {data.items.map((it, i) => (
        <Sequence key={it.name} from={holdStart(i) - move}>
          <Audio src={staticFile('footage/compare/whoosh.wav')} volume={0.5} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
};
