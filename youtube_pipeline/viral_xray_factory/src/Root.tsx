import React from 'react';
import {Composition} from 'remotion';
import {concepts, FPS, HEIGHT, WIDTH} from './concepts';
import {XrayShort} from './XrayShort';
import audioMeta from '../public/data/audio-metadata.json';

type AudioMeta = Record<string, {duration: number}>;
const durations = audioMeta as AudioMeta;
export const compositionId = (id: string) => id.replaceAll('_', '-');

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {concepts.map((concept) => {
        const seconds = Math.max(durations[concept.id]?.duration ?? 42, 30);
        return (
          <Composition
            key={concept.id}
            id={compositionId(concept.id)}
            component={XrayShort}
            durationInFrames={Math.ceil((seconds + 1.5) * FPS)}
            fps={FPS}
            width={WIDTH}
            height={HEIGHT}
            defaultProps={{conceptId: concept.id}}
          />
        );
      })}
    </>
  );
};
