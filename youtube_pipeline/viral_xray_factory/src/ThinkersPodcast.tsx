import React from 'react';
import {FPS, HEIGHT, VideoConcept, WIDTH} from './concepts';

export type PodcastBeat = {
  start?: number;
  end?: number;
  text: string;
  visual: string;
  speaker?: string;
  role?: 'host' | 'physicist' | 'humanist' | 'artist-history';
};

type PersonRole = 'physicist' | 'humanist' | 'artist-history';
type Motif = 'wild-hair' | 'radium' | 'bongo' | 'beard' | 'ritual' | 'collar' | 'sketch' | 'flowers' | 'jacket';

type Person = {
  name: string;
  fullName: string;
  role: PersonRole;
  x: number;
  y: number;
  color: string;
  accent: string;
  skin: string;
  essence: string;
  symbol: string;
  motif: Motif;
};

const people: Person[] = [
  {
    name: 'Einstein',
    fullName: 'Albert Einstein',
    role: 'physicist',
    x: 350,
    y: 360,
    color: '#63D7FF',
    accent: '#F6C85F',
    skin: '#E8C4A2',
    essence: 'scale + humility',
    symbol: 'E=mc^2',
    motif: 'wild-hair',
  },
  {
    name: 'Curie',
    fullName: 'Marie Curie',
    role: 'physicist',
    x: 555,
    y: 585,
    color: '#77E0B5',
    accent: '#C7F464',
    skin: '#E3BFA8',
    essence: 'patient measurement',
    symbol: 'Ra',
    motif: 'radium',
  },
  {
    name: 'Feynman',
    fullName: 'Richard Feynman',
    role: 'physicist',
    x: 280,
    y: 625,
    color: '#FFB86C',
    accent: '#FF6B6B',
    skin: '#D8A47F',
    essence: 'doubt + play',
    symbol: 'QED',
    motif: 'bongo',
  },
  {
    name: 'Socrates',
    fullName: 'Socrates',
    role: 'humanist',
    x: 795,
    y: 300,
    color: '#D7B7FF',
    accent: '#F2E9D8',
    skin: '#C99A73',
    essence: 'examined life',
    symbol: '?',
    motif: 'beard',
  },
  {
    name: 'Confucius',
    fullName: 'Confucius',
    role: 'humanist',
    x: 960,
    y: 510,
    color: '#F7D06B',
    accent: '#E45D5D',
    skin: '#D6A06C',
    essence: 'relationship + duty',
    symbol: 'li',
    motif: 'ritual',
  },
  {
    name: 'Shakespeare',
    fullName: 'William Shakespeare',
    role: 'humanist',
    x: 1125,
    y: 300,
    color: '#FF8FA3',
    accent: '#F8F0D8',
    skin: '#DFB08C',
    essence: 'motive + drama',
    symbol: 'act',
    motif: 'collar',
  },
  {
    name: 'Leonardo',
    fullName: 'Leonardo da Vinci',
    role: 'artist-history',
    x: 1570,
    y: 360,
    color: '#80ED99',
    accent: '#F6C85F',
    skin: '#D6A47C',
    essence: 'vision as experiment',
    symbol: 'sketch',
    motif: 'sketch',
  },
  {
    name: 'Frida',
    fullName: 'Frida Kahlo',
    role: 'artist-history',
    x: 1365,
    y: 585,
    color: '#FF6B7A',
    accent: '#4DD3C9',
    skin: '#B96E4A',
    essence: 'truth has a body',
    symbol: 'body',
    motif: 'flowers',
  },
  {
    name: 'Mandela',
    fullName: 'Nelson Mandela',
    role: 'artist-history',
    x: 1640,
    y: 625,
    color: '#8DD4FF',
    accent: '#6EE7B7',
    skin: '#7B4B32',
    essence: 'justice made public',
    symbol: 'dignity',
    motif: 'jacket',
  },
];

const roleLabel: Record<PersonRole, string> = {
  physicist: 'Physics',
  humanist: 'Philosophy / Literature',
  'artist-history': 'Art / History',
};

const roleColor: Record<PersonRole | 'host', string> = {
  physicist: '#63D7FF',
  humanist: '#F7D06B',
  'artist-history': '#FF8FA3',
  host: '#FAFAF2',
};

export const ThinkersPodcastScene: React.FC<{
  concept: VideoConcept;
  activeBeat?: PodcastBeat;
  beatIndex: number;
  beatProgress: number;
  seconds: number;
}> = ({concept, activeBeat, beatIndex, beatProgress, seconds}) => {
  const activeName = activeBeat?.speaker ?? 'Host';
  const activePerson = people.find((person) => person.name === activeName);
  const pulse = 0.5 + 0.5 * Math.sin(seconds * Math.PI * 2.2);
  const activeColor = activePerson?.color ?? concept.palette.accent;
  const camera = cameraTransform(activePerson, seconds);

  return (
    <svg width={WIDTH} height={HEIGHT} style={{position: 'absolute', inset: 0}}>
      <defs>
        <linearGradient id="studioGlow" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="#263A45" />
          <stop offset="0.46" stopColor="#171923" />
          <stop offset="1" stopColor="#321F2A" />
        </linearGradient>
        <radialGradient id="tableGlow" cx="50%" cy="45%" r="65%">
          <stop offset="0" stopColor={concept.palette.accent} stopOpacity="0.22" />
          <stop offset="0.58" stopColor={concept.palette.panel} stopOpacity="0.28" />
          <stop offset="1" stopColor="#000000" stopOpacity="0" />
        </radialGradient>
        <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="14" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
        <filter id="cinemaGrain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="9" result="noise" />
          <feColorMatrix type="saturate" values="0" />
          <feComponentTransfer>
            <feFuncA type="table" tableValues="0 0.08" />
          </feComponentTransfer>
        </filter>
      </defs>

      <rect width={WIDTH} height={HEIGHT} fill="url(#studioGlow)" opacity={0.82} />
      <CinematicBackdrop seconds={seconds} activeColor={activeColor} />
      <StarMap seconds={seconds} />
      <g transform={camera}>
        <RoleRails />
        <SpeakerSpotlight person={activePerson} color={activeColor} seconds={seconds} />
        <PodcastTable seconds={seconds} activeColor={activeColor} />

        {people.map((person, index) => (
          <ThinkerAvatar
            key={person.name}
            person={person}
            active={person.name === activeName}
            index={index}
            seconds={seconds}
            pulse={pulse}
          />
        ))}

        <IdeaOrbit seconds={seconds} beatIndex={beatIndex} activeColor={activeColor} />
      </g>
      <CinematicForeground activeColor={activeColor} beatProgress={beatProgress} seconds={seconds} />
    </svg>
  );
};

const cameraTransform = (activePerson: Person | undefined, seconds: number) => {
  const zoom = activePerson ? 1.026 + Math.sin(seconds * 0.55) * 0.004 : 1;
  const panX = activePerson ? (960 - activePerson.x) * 0.032 : 0;
  const panY = activePerson ? (520 - activePerson.y) * 0.026 : 0;
  return `translate(${panX.toFixed(2)} ${panY.toFixed(2)}) translate(960 540) scale(${zoom.toFixed(4)}) translate(-960 -540)`;
};

const CinematicBackdrop: React.FC<{seconds: number; activeColor: string}> = ({seconds, activeColor}) => (
  <g>
    <path d="M0 160 C320 95, 610 126, 960 92 C1315 58, 1550 96, 1920 38 L1920 0 L0 0 Z" fill="#05070C" opacity={0.45} />
    <path d="M0 930 C340 855, 630 910, 960 864 C1285 819, 1560 848, 1920 786 L1920 1080 L0 1080 Z" fill="#05070C" opacity={0.52} />
    <g opacity={0.44}>
      {[
        {x: 385, color: '#63D7FF', delay: 0},
        {x: 960, color: activeColor, delay: 1.3},
        {x: 1535, color: '#FF8FA3', delay: 2.4},
      ].map((light) => {
        const sway = Math.sin(seconds * 0.32 + light.delay) * 28;
        return (
          <path
            key={light.x}
            d={`M${light.x + sway} 30 L${light.x - 190} 810 L${light.x + 230} 810 Z`}
            fill={light.color}
            opacity={0.11}
          />
        );
      })}
    </g>
    <rect x={0} y={826} width={WIDTH} height={254} fill="#07090F" opacity={0.38} />
    <ellipse cx={960} cy={840} rx={760} ry={100} fill={activeColor} opacity={0.09} />
  </g>
);

const StarMap: React.FC<{seconds: number}> = ({seconds}) => (
  <g opacity={0.72}>
    {Array.from({length: 68}).map((_, index) => {
      const cx = (index * 151) % WIDTH;
      const cy = 175 + ((index * 89) % 620);
      const r = 1.4 + (index % 4) * 0.55;
      const opacity = 0.22 + 0.36 * (0.5 + 0.5 * Math.sin(seconds * 0.9 + index));
      return <circle key={index} cx={cx} cy={cy} r={r} fill="#FAFAF2" opacity={opacity} />;
    })}
    {Array.from({length: 12}).map((_, index) => {
      const x1 = 180 + index * 142;
      const y1 = 230 + ((index * 57) % 360);
      return (
        <line
          key={index}
          x1={x1}
          y1={y1}
          x2={x1 + 78}
          y2={y1 + Math.sin(seconds * 0.6 + index) * 28}
          stroke="#FAFAF2"
          strokeOpacity={0.08}
          strokeWidth={2}
        />
      );
    })}
  </g>
);

const RoleRails: React.FC = () => (
  <g>
    <RoleRail x={170} y={220} w={485} label="3 Physicists" role="physicist" />
    <RoleRail x={705} y={200} w={510} label="3 Philosophers / Writers" role="humanist" />
    <RoleRail x={1265} y={220} w={485} label="3 Artists / History Makers" role="artist-history" />
  </g>
);

const RoleRail: React.FC<{x: number; y: number; w: number; label: string; role: PersonRole}> = ({x, y, w, label, role}) => (
  <g transform={`translate(${x} ${y})`} opacity={0.9}>
    <line x1={0} x2={w} y1={0} y2={0} stroke={roleColor[role]} strokeWidth={4} strokeLinecap="round" strokeOpacity={0.75} />
    <text x={w / 2} y={-18} fill={roleColor[role]} fontSize={24} fontWeight={850} textAnchor="middle">
      {label}
    </text>
  </g>
);

const SpeakerSpotlight: React.FC<{person: Person | undefined; color: string; seconds: number}> = ({person, color, seconds}) => {
  if (!person) return null;
  const radius = 176 + Math.sin(seconds * 2.1) * 10;
  return (
    <g opacity={0.92}>
      <circle cx={person.x} cy={person.y} r={radius} fill={color} opacity={0.14} filter="url(#softGlow)" />
      <path
        d={`M${person.x - 80} 58 L${person.x - 152} ${person.y + 46} Q${person.x} ${person.y + 130} ${person.x + 152} ${person.y + 46} L${person.x + 80} 58 Z`}
        fill={color}
        opacity={0.075}
      />
    </g>
  );
};

const PodcastTable: React.FC<{seconds: number; activeColor: string}> = ({seconds, activeColor}) => (
  <g transform="translate(960 720)">
    <ellipse rx={610} ry={155} fill="url(#tableGlow)" />
    <ellipse rx={565} ry={118} fill="rgba(16, 18, 24, 0.88)" stroke="#F6C85F" strokeOpacity={0.52} strokeWidth={4} />
    <ellipse rx={460} ry={76} fill="rgba(246, 200, 95, 0.10)" />
    {Array.from({length: 9}).map((_, index) => {
      const angle = -Math.PI + (index / 8) * Math.PI;
      const x = Math.cos(angle) * 430;
      const y = Math.sin(angle) * 70 - 6;
      return <TableMic key={index} x={x} y={y} active={index === Math.floor(seconds * 0.9) % 9} activeColor={activeColor} />;
    })}
    <Waveform x={-210} y={38} color={activeColor} seconds={seconds} />
    <text y={17} fill="#FAFAF2" fontSize={32} fontWeight={900} textAnchor="middle">
      WHAT SHOULD KNOWLEDGE SERVE?
    </text>
  </g>
);

const TableMic: React.FC<{x: number; y: number; active: boolean; activeColor: string}> = ({x, y, active, activeColor}) => (
  <g transform={`translate(${x} ${y})`}>
    <line x1={0} x2={0} y1={10} y2={54} stroke={active ? activeColor : '#6B7280'} strokeWidth={5} strokeLinecap="round" />
    <rect x={-13} y={-26} width={26} height={46} rx={13} fill={active ? activeColor : '#B7B9C3'} opacity={active ? 1 : 0.72} />
  </g>
);

const ThinkerAvatar: React.FC<{
  person: Person;
  active: boolean;
  index: number;
  seconds: number;
  pulse: number;
}> = ({person, active, index, seconds, pulse}) => {
  const bob = Math.sin(seconds * 1.5 + index) * (active ? 7 : 3);
  const mouth = active ? 7 + Math.abs(Math.sin(seconds * 12)) * 16 : 6;
  const ring = active ? 1 + pulse * 0.12 : 1;

  return (
    <g transform={`translate(${person.x} ${person.y + bob})`}>
      {active && <SpeakingRings color={person.color} scale={ring} />}
      <circle r={90} fill={person.color} opacity={active ? 0.22 : 0.1} filter={active ? 'url(#softGlow)' : undefined} />
      <circle r={72} fill="rgba(8, 10, 15, 0.78)" stroke={person.color} strokeWidth={active ? 5 : 2.5} />
      <circle cy={2} r={48} fill={person.skin} />
      <MotifMark motif={person.motif} color={person.color} accent={person.accent} skin={person.skin} />
      <circle cx={-16} cy={-8} r={5} fill="#12131A" />
      <circle cx={17} cy={-8} r={5} fill="#12131A" />
      <rect x={-21} y={23 - mouth / 2} width={42} height={mouth} rx={mouth / 2} fill="#12131A" opacity={active ? 0.92 : 0.72} />
      <SymbolBadge symbol={person.symbol} color={person.color} />
      <text y={108} fill="#FAFAF2" fontSize={28} fontWeight={900} textAnchor="middle">
        {person.name}
      </text>
      <text y={138} fill={person.color} fontSize={18} fontWeight={800} textAnchor="middle">
        {roleLabel[person.role]}
      </text>
      <text y={164} fill="#D7DADF" fontSize={18} fontWeight={700} textAnchor="middle">
        {person.essence}
      </text>
    </g>
  );
};

const SpeakingRings: React.FC<{color: string; scale: number}> = ({color, scale}) => (
  <g opacity={0.88}>
    {[98, 123, 149].map((radius, index) => (
      <circle key={radius} r={radius * scale + index * 4} fill="none" stroke={color} strokeWidth={4 - index} strokeOpacity={0.42 - index * 0.1} />
    ))}
  </g>
);

const MotifMark: React.FC<{motif: Motif; color: string; accent: string; skin: string}> = ({motif, color, accent, skin}) => {
  if (motif === 'wild-hair') {
    return (
      <g>
        <path
          d="M-48 -30 C-82 -62, -38 -78, -62 -106 C-22 -86, -18 -120, 4 -83 C35 -116, 34 -72, 74 -90 C48 -60, 77 -45, 47 -28"
          fill="#F3F4F6"
        />
        <path d="M-24 19 C-13 30, 13 30, 25 19" stroke="#F3F4F6" strokeWidth={7} strokeLinecap="round" fill="none" />
      </g>
    );
  }
  if (motif === 'radium') {
    return (
      <g>
        <path d="M-45 -28 C-18 -62, 38 -63, 52 -22 L44 -44 C12 -76, -35 -61, -49 -17 Z" fill="#3C2E2A" />
        {[0, 1, 2].map((index) => (
          <circle key={index} cx={-30 + index * 30} cy={-62 - (index % 2) * 8} r={7} fill={accent} opacity={0.9} />
        ))}
      </g>
    );
  }
  if (motif === 'bongo') {
    return (
      <g>
        <path d="M-42 -30 C-16 -65, 34 -60, 46 -24 L40 -48 C8 -75, -38 -54, -48 -17 Z" fill="#4B2B1D" />
        <ellipse cx={42} cy={48} rx={17} ry={11} fill={accent} />
        <ellipse cx={64} cy={50} rx={15} ry={10} fill={color} />
      </g>
    );
  }
  if (motif === 'beard') {
    return (
      <g>
        <path d="M-49 -20 C-40 -55, 45 -57, 51 -18 C27 -32, -19 -33, -49 -20 Z" fill="#D8D1C7" />
        <path d="M-38 20 C-28 72, 30 72, 39 20 C20 38, -17 38, -38 20 Z" fill="#D8D1C7" />
      </g>
    );
  }
  if (motif === 'ritual') {
    return (
      <g>
        <rect x={-44} y={-62} width={88} height={20} rx={4} fill="#2B211C" />
        <path d="M-35 -42 C-14 -68, 24 -68, 42 -42 Z" fill="#2B211C" />
        <path d="M-34 42 C-15 58, 18 58, 36 42" stroke="#2B211C" strokeWidth={9} strokeLinecap="round" />
      </g>
    );
  }
  if (motif === 'collar') {
    return (
      <g>
        <path d="M-48 -28 C-22 -61, 25 -62, 47 -27 L38 -50 C6 -75, -34 -55, -48 -28 Z" fill="#8B4A2F" />
        <path d="M-58 48 L-28 29 L0 51 L29 29 L58 48 L20 76 L0 55 L-20 76 Z" fill={accent} />
      </g>
    );
  }
  if (motif === 'sketch') {
    return (
      <g>
        <path d="M-47 -28 C-10 -70, 34 -54, 49 -28 L42 -53 C5 -78, -34 -54, -47 -28 Z" fill="#6B4B2D" />
        <path d="M35 35 L75 0" stroke={accent} strokeWidth={7} strokeLinecap="round" />
        <circle cx={78} cy={-3} r={6} fill={accent} />
      </g>
    );
  }
  if (motif === 'flowers') {
    return (
      <g>
        <path d="M-48 -28 C-18 -62, 31 -61, 48 -27 C18 -39, -17 -39, -48 -28 Z" fill="#17120F" />
        {[-31, 0, 31].map((cx, index) => (
          <g key={cx} transform={`translate(${cx} -61)`}>
            <circle r={10} fill={index === 1 ? accent : color} />
            <circle cx={8} cy={2} r={6} fill="#FDE68A" />
          </g>
        ))}
        <path d="M-20 -20 C-5 -12, 5 -12, 21 -20" stroke="#17120F" strokeWidth={5} strokeLinecap="round" />
      </g>
    );
  }
  return (
    <g>
      <path d="M-46 -28 C-18 -57, 30 -59, 49 -25 L39 -48 C3 -72, -35 -52, -46 -28 Z" fill="#1F2937" />
      <path d="M-48 54 L-18 32 L0 60 L19 32 L48 54" stroke={accent} strokeWidth={10} strokeLinecap="round" fill="none" />
    </g>
  );
};

const SymbolBadge: React.FC<{symbol: string; color: string}> = ({symbol, color}) => (
  <g transform="translate(58 -55)">
    <circle r={25} fill="rgba(0, 0, 0, 0.72)" stroke={color} strokeWidth={3} />
    <text y={7} fill={color} fontSize={symbol.length > 5 ? 12 : 16} fontWeight={950} textAnchor="middle">
      {symbol}
    </text>
  </g>
);

const Waveform: React.FC<{x: number; y: number; color: string; seconds: number}> = ({x, y, color, seconds}) => (
  <g transform={`translate(${x} ${y})`}>
    {Array.from({length: 22}).map((_, index) => {
      const h = 16 + Math.abs(Math.sin(seconds * 5 + index * 0.65)) * 34;
      return <rect key={index} x={index * 19} y={-h / 2} width={9} height={h} rx={5} fill={color} opacity={0.68} />;
    })}
  </g>
);

const IdeaOrbit: React.FC<{seconds: number; beatIndex: number; activeColor: string}> = ({seconds, beatIndex, activeColor}) => {
  const ideas = ['evidence', 'doubt', 'culture', 'craft', 'body', 'justice'];
  return (
    <g transform="translate(960 620)" opacity={0.48}>
      {ideas.map((idea, index) => {
        const angle = seconds * 0.16 + index * ((Math.PI * 2) / ideas.length);
        const x = Math.cos(angle) * 300;
        const y = Math.sin(angle) * 54;
        const selected = index === beatIndex % ideas.length;
        return (
          <g key={idea} transform={`translate(${x} ${y})`}>
            <circle r={selected ? 10 : 5} fill={selected ? activeColor : '#FAFAF2'} opacity={selected ? 0.9 : 0.34} />
            <circle r={selected ? 18 : 10} fill="none" stroke={selected ? activeColor : '#FAFAF2'} strokeWidth={2} strokeOpacity={selected ? 0.3 : 0.08} />
          </g>
        );
      })}
    </g>
  );
};

const CinematicForeground: React.FC<{activeColor: string; beatProgress: number; seconds: number}> = ({activeColor, beatProgress, seconds}) => (
  <g pointerEvents="none">
    <rect x={0} y={0} width={WIDTH} height={24} fill="#020308" opacity={0.88} />
    <rect x={0} y={HEIGHT - 24} width={WIDTH} height={24} fill="#020308" opacity={0.88} />
    <rect x={0} y={0} width={WIDTH} height={HEIGHT} filter="url(#cinemaGrain)" opacity={0.55} />
    <rect x={34} y={48} width={4} height={92} fill={activeColor} opacity={0.36 + beatProgress * 0.16} />
    <rect x={WIDTH - 38} y={HEIGHT - 164} width={4} height={92} fill={activeColor} opacity={0.28 + Math.sin(seconds * 1.4) * 0.06} />
    <rect x={0} y={0} width={WIDTH} height={HEIGHT} fill="none" stroke="#FAFAF2" strokeOpacity={0.035} strokeWidth={12} />
  </g>
);

const WrappedSvgText: React.FC<{
  x: number;
  y: number;
  text: string;
  fill: string;
  fontSize: number;
  lineHeight: number;
  maxChars: number;
  maxLines: number;
}> = ({x, y, text, fill, fontSize, lineHeight, maxChars, maxLines}) => {
  const lines = wrapText(text, maxChars, maxLines);
  return (
    <text fill={fill} fontSize={fontSize} fontWeight={760}>
      {lines.map((line, index) => (
        <tspan key={line} x={x} y={y + index * lineHeight}>
          {line}
        </tspan>
      ))}
    </text>
  );
};

const wrapText = (text: string, maxChars: number, maxLines: number) => {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;
  const clipped = lines.slice(0, maxLines);
  clipped[maxLines - 1] = `${clipped[maxLines - 1].replace(/[.,;:]$/, '')}...`;
  return clipped;
};
