import React from 'react';
import {Composition} from 'remotion';
import {FORMATS, FPS, concepts} from './concepts';
import {compositionIdFor} from '../scripts/lib/render-targets';
import {XrayShort} from './XrayShort';
import {SizeCompare, sizeCompareFrames} from './SizeCompare';
import audioMeta from '../public/data/audio-metadata.json';

type AudioMeta = Record<string, {duration: number}>;
const durations = audioMeta as AudioMeta;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {concepts.flatMap((concept) => {
        const seconds = Math.max(durations[concept.id]?.duration ?? 42, 30);
        return concept.formats.map((format) => {
          const {width, height} = FORMATS[format];
          return (
            <Composition
              key={`${concept.id}-${format}`}
              id={compositionIdFor(concept.id, format)}
              component={XrayShort}
              durationInFrames={Math.ceil((seconds + 1.5) * FPS)}
              fps={FPS}
              width={width}
              height={height}
              defaultProps={{conceptId: concept.id}}
            />
          );
        });
      })}
      {(['portrait', 'landscape'] as const).map((format) => (
        <Composition
          key={`size-compare-${format}`}
          id={`SynchrotronSizes-${format}`}
          component={SizeCompare}
          durationInFrames={sizeCompareFrames}
          fps={FPS}
          width={FORMATS[format].width}
          height={FORMATS[format].height}
          defaultProps={{format}}
        />
      ))}
    </>
  );
};
