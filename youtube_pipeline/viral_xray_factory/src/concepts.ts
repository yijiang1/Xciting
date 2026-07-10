export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export type VideoStyle = 'cartoon' | 'interview' | 'gameshow' | 'noir' | 'news' | 'roundtable' | 'mockumentary';
export type OpenAiVoice = 'alloy' | 'ash' | 'ballad' | 'cedar' | 'coral' | 'echo' | 'fable' | 'marin' | 'nova' | 'onyx' | 'sage' | 'shimmer' | 'verse';

export type Beat = {
  text: string;
  visual: string;
  speaker?: string;
  openaiVoice?: OpenAiVoice;
  openaiInstructions?: string;
  localVoice?: string;
  localRate?: number;
  role?: 'host' | 'physicist' | 'humanist' | 'artist-history';
};

export type VideoConcept = {
  id: string;
  style: VideoStyle;
  title: string;
  hook: string;
  topic: string;
  voice: OpenAiVoice;
  ttsInstructions: string;
  palette: {
    bg: string;
    accent: string;
    accent2: string;
    ink: string;
    panel: string;
  };
  beats: Beat[];
  upload: {
    title: string;
    description: string;
    tags: string[];
  };
};

const aiDisclosure = 'Voiceover is AI-generated.';
const fictionalRoundtableDisclosure =
  'Fictional educational dialogue inspired by public historical ideas. AI-generated synthetic voices are not impersonations.';
const fictionalSatireDisclosure =
  'Fictional satire. Professor Alistair Vane does not exist; any resemblance to real persons or institutions is coincidental. Voiceover is AI-generated.';

export const concepts: VideoConcept[] = [
  {
    id: 'cartoon_bragg_detective',
    style: 'cartoon',
    title: 'The Crystal Mirror Mystery',
    hook: 'Why does a crystal flash at one angle and ignore the next?',
    topic: "Bragg's law",
    voice: 'marin',
    ttsInstructions:
      'Energetic cartoon narrator. Bright, playful, fast but clear. Add curiosity and comic timing without sounding childish.',
    palette: {bg: '#0C2742', accent: '#FFD166', accent2: '#5EEAD4', ink: '#F8FAFC', panel: '#12395C'},
    beats: [
      {text: 'Detective Photon enters the crystal city with one question: who stole the X-ray beam?', visual: 'cartoon detective photon arrives'},
      {text: 'Every atom is lined up in planes, like tiny apartment floors made of electrons.', visual: 'stacked atom floors'},
      {text: 'One beam bounces from the top floor. Another dives deeper, then bounces back.', visual: 'two animated ray paths'},
      {text: 'The deeper beam walks an extra distance: two d sine theta.', visual: 'highlight path difference'},
      {text: 'If that extra walk is exactly n wavelengths, the waves clap together.', visual: 'waves align and sparkle'},
      {text: "That is Bragg's law: n lambda equals two d sine theta. Mystery solved; diffraction peak unlocked.", visual: 'formula badge and peak burst'},
    ],
    upload: {
      title: "Why Crystals Flash: Bragg's Law as a Cartoon Mystery",
      description: `${aiDisclosure}\nA short cartoon explanation of X-ray diffraction and Bragg's law: n lambda = 2 d sin(theta).`,
      tags: ['x-ray diffraction', 'Bragg law', 'crystallography', 'science animation', 'XRD', 'physics'],
    },
  },
  {
    id: 'interview_absorption_edge',
    style: 'interview',
    title: 'An X-ray Interviews an Atom',
    hook: 'Why does absorption suddenly jump at an edge?',
    topic: 'X-ray absorption edges',
    voice: 'coral',
    ttsInstructions:
      'Two-person science podcast energy in one voice: warm, witty, crisp. Slight changes in tone between interviewer and atom.',
    palette: {bg: '#15151E', accent: '#7DD3FC', accent2: '#FCA5A5', ink: '#F8FAFC', panel: '#242436'},
    beats: [
      {text: 'Welcome back. Today our guest is an atom, and the question is personal: why do you absorb X-rays?', visual: 'studio host and atom guest'},
      {text: 'The atom says: I only take energy packets that can kick an inner electron into an allowed state.', visual: 'electron shell closeup'},
      {text: 'Below the edge, the photon is too weak. It knocks, but nobody answers.', visual: 'low energy photon rejected'},
      {text: 'At the edge, the photon has enough energy to launch a core electron. The absorption jumps.', visual: 'edge jump graph'},
      {text: 'Near the edge, the outgoing electron wave feels the local chemistry and shape of empty states.', visual: 'XANES region waves'},
      {text: 'That is why XAS can tell oxidation state, coordination, and local structure without asking the crystal to behave.', visual: 'XAS summary cards'},
    ],
    upload: {
      title: 'X-ray Absorption Edges Explained as an Interview',
      description: `${aiDisclosure}\nA fast, conversational explanation of why X-ray absorption edges happen and what XAS can reveal.`,
      tags: ['XAS', 'XANES', 'x-ray absorption', 'synchrotron', 'oxidation state', 'science podcast'],
    },
  },
  {
    id: 'gameshow_xrd_peaks',
    style: 'gameshow',
    title: 'Guess That Peak!',
    hook: 'Can you identify a crystal from three bright lines?',
    topic: 'XRD peak fingerprints',
    voice: 'nova',
    ttsInstructions:
      'High-energy game show host. Big smiles, punchy pacing, dramatic pauses, but keep the scientific terms clear.',
    palette: {bg: '#101827', accent: '#A7F3D0', accent2: '#FDE047', ink: '#F8FAFC', panel: '#1F2937'},
    beats: [
      {text: 'Welcome to Guess That Peak, where crystals reveal themselves with suspiciously perfect lineups.', visual: 'game show stage'},
      {text: 'Contestant one gets three peaks: low angle, medium angle, high angle. Not random. Never random.', visual: 'three peak podiums'},
      {text: 'Each peak is a set of atomic planes satisfying Bragg’s law at a different spacing.', visual: 'planes to peaks mapping'},
      {text: 'Change the structure, and the peak positions move. Change the grain size, and the peaks broaden.', visual: 'peak shift and broadening'},
      {text: 'So an XRD pattern is a fingerprint: positions identify phases; widths reveal size and strain.', visual: 'fingerprint peak pattern'},
      {text: 'Final answer: the crystal was telling us its identity the whole time. The detector just kept score.', visual: 'winner reveal'},
    ],
    upload: {
      title: 'Guess That Peak: XRD Patterns Explained Like a Game Show',
      description: `${aiDisclosure}\nA game-show style explanation of how XRD peak positions, widths, and intensities reveal crystal phases.`,
      tags: ['XRD', 'x-ray diffraction', 'crystal structure', 'powder diffraction', 'phase identification', 'science game'],
    },
  },
  {
    id: 'noir_exafs_echo',
    style: 'noir',
    title: 'EXAFS After Dark',
    hook: 'The photoelectron leaves the atom, but the neighbors talk back.',
    topic: 'EXAFS scattering',
    voice: 'onyx',
    ttsInstructions:
      'Cinematic noir narrator. Low, deliberate, mysterious, with dry humor and clean pronunciation of EXAFS.',
    palette: {bg: '#111111', accent: '#E5E7EB', accent2: '#F59E0B', ink: '#F9FAFB', panel: '#202020'},
    beats: [
      {text: 'Past the absorption edge, a photoelectron walks into the dark.', visual: 'noir electron alley'},
      {text: 'It does not travel alone. Neighboring atoms scatter the wave back like whispers in an alley.', visual: 'scattered waves'},
      {text: 'Those whispers interfere with the outgoing wave, making oscillations above the edge.', visual: 'EXAFS oscillation graph'},
      {text: 'The rhythm depends on distance. The strength depends on how many neighbors are out there.', visual: 'radial shell clues'},
      {text: 'Fourier transform the oscillations, and the local structure starts to appear from the fog.', visual: 'transform to radial peaks'},
      {text: 'EXAFS is not magic. It is atomic echo location with a trench coat.', visual: 'detective reveal'},
    ],
    upload: {
      title: 'EXAFS Explained as Atomic Noir',
      description: `${aiDisclosure}\nA noir-style short about EXAFS: photoelectron scattering, interference, and local structure.`,
      tags: ['EXAFS', 'XAFS', 'x-ray absorption spectroscopy', 'photoelectron', 'local structure', 'science noir'],
    },
  },
  {
    id: 'news_synchrotron_weather',
    style: 'news',
    title: 'Synchrotron Weather Report',
    hook: 'Today’s forecast: bright beam, scattered photons, and a 90 percent chance of data.',
    topic: 'synchrotron beamlines',
    voice: 'sage',
    ttsInstructions:
      'Fast-paced science news anchor with playful confidence. Clear, punchy, and slightly dramatic.',
    palette: {bg: '#052E2B', accent: '#67E8F9', accent2: '#FBBF24', ink: '#F8FAFC', panel: '#0F4A45'},
    beats: [
      {text: 'Good evening from the synchrotron. The storage ring is calm, the electrons are relativistic, and the beam is bright.', visual: 'news desk and storage ring map'},
      {text: 'Undulators make the electrons wiggle, and wiggling charges throw off intense X-rays.', visual: 'undulator wiggle'},
      {text: 'Monochromators select one energy, because experiments do not appreciate chaotic buffets.', visual: 'energy selection'},
      {text: 'Mirrors focus the beam down to the sample, where chemistry, structure, and motion get interrogated.', visual: 'focused beam on sample'},
      {text: 'Detectors collect the evidence: absorption, diffraction, scattering, fluorescence, sometimes all before lunch.', visual: 'detector dashboard'},
      {text: 'Tomorrow’s forecast: more photons, more coffee, and a small craft advisory for anyone aligning slits.', visual: 'weather forecast outro'},
    ],
    upload: {
      title: 'Synchrotron Beamlines Explained as a Weather Report',
      description: `${aiDisclosure}\nA newsroom-style explanation of synchrotron beamlines, undulators, monochromators, mirrors, and detectors.`,
      tags: ['synchrotron', 'beamline', 'x-rays', 'undulator', 'monochromator', 'science news'],
    },
  },
  {
    id: 'roundtable_knowledge_wisdom',
    style: 'roundtable',
    title: 'The Nine Minds Podcast',
    hook: 'Nine historical minds ask what knowledge should serve.',
    topic: 'Knowledge, wisdom, beauty, justice',
    voice: 'sage',
    ttsInstructions:
      'Thoughtful long-form podcast narration. Calm, reflective, intellectually lively, with clear transitions between speakers.',
    palette: {bg: '#12131A', accent: '#F6C85F', accent2: '#5CC8FF', ink: '#FAFAF2', panel: '#243447'},
    beats: [
      {
        speaker: 'Host',
        localVoice: 'Daniel',
        localRate: 176,
        role: 'host',
        text: 'Host: Welcome to a fictional roundtable built from public lives, texts, lectures, and artworks. One question for nine minds: when knowledge gives us power faster than judgment, what should it serve?',
        visual: 'source-built fictional roundtable opens',
      },
      {
        speaker: 'Einstein',
        localVoice: 'Albert',
        localRate: 166,
        role: 'physicist',
        text: 'Einstein: Distill me as distrust of the obvious. Relativity taught me that measurement depends on frames; wonder taught me that knowledge should make power more humble, not more arrogant.',
        visual: 'distillation: frames, wonder, humility',
      },
      {
        speaker: 'Curie',
        localVoice: 'Samantha',
        localRate: 168,
        role: 'physicist',
        text: 'Curie: Distill me as disciplined evidence. Radioactivity was invisible, so I trusted instruments, tons of pitchblende, and years of repeated separation before I trusted fame.',
        visual: 'distillation: measurement makes invisible forces visible',
      },
      {
        speaker: 'Feynman',
        localVoice: 'Ralph',
        localRate: 182,
        role: 'physicist',
        text: 'Feynman: Distill me as curiosity with a trapdoor. The pleasure is finding things out, but scientific integrity begins when you work hardest against fooling yourself.',
        visual: 'distillation: curiosity disciplined by self-suspicion',
      },
      {
        speaker: 'Socrates',
        localVoice: 'Daniel',
        localRate: 164,
        role: 'humanist',
        text: 'Socrates: Distill me as a public question. Before asking what knowledge can do, examine the person using it; an unexamined intelligence is only a faster appetite.',
        visual: 'distillation: examine the knower',
      },
      {
        speaker: 'Confucius',
        localVoice: 'Rishi',
        localRate: 160,
        role: 'humanist',
        text: 'Confucius: Distill me as relationship made ethical. Learning becomes humane through ren, and becomes reliable through li: habits, roles, respect, and care practiced daily.',
        visual: 'distillation: learning becomes humane through relation',
      },
      {
        speaker: 'Shakespeare',
        localVoice: 'Moira',
        localRate: 170,
        role: 'humanist',
        text: 'Shakespeare: Distill me as motive under stage light. Humans can know the truth and still kneel to ambition, jealousy, vanity, fear, or love.',
        visual: 'distillation: truth enters human drama',
      },
      {
        speaker: 'Leonardo',
        localVoice: 'Junior',
        localRate: 170,
        role: 'artist-history',
        text: 'Leonardo: Distill me as the eye that experiments. To know a wing, draw it; to know water, follow the spiral. Art and science meet in attention.',
        visual: 'distillation: drawing as experiment',
      },
      {
        speaker: 'Frida',
        localVoice: 'Tessa',
        localRate: 166,
        role: 'artist-history',
        text: 'Frida: Distill me as truth returning to the body. Pain, identity, color, politics, and love are not footnotes; they are where history enters the skin.',
        visual: 'distillation: truth has a body',
      },
      {
        speaker: 'Mandela',
        localVoice: 'Karen',
        localRate: 160,
        role: 'artist-history',
        text: 'Mandela: Distill me as dignity organized. Knowledge matters when it becomes courage, negotiation, law, schools, and institutions strong enough to outlive revenge.',
        visual: 'distillation: dignity organized into justice',
      },
      {
        speaker: 'Host',
        localVoice: 'Daniel',
        localRate: 176,
        role: 'host',
        text: 'Host: So the table is not asking whether knowledge is powerful. It is asking who disciplines power: evidence, character, community, beauty, or justice?',
        visual: 'the central question sharpens',
      },
      {
        speaker: 'Einstein',
        localVoice: 'Albert',
        localRate: 166,
        role: 'physicist',
        text: 'Einstein: Evidence must discipline power first. But equations do not end responsibility. When science changes war, energy, or the planet, the scientist becomes a citizen in public.',
        visual: 'responsibility radiates beyond equations',
      },
      {
        speaker: 'Socrates',
        localVoice: 'Daniel',
        localRate: 164,
        role: 'humanist',
        text: 'Socrates: Then test the word responsibility. Is it guilt after action, or the habit of asking before action: what is good, who is harmed, and what do I pretend not to know?',
        visual: 'responsibility as pre-action questioning',
      },
      {
        speaker: 'Curie',
        localVoice: 'Samantha',
        localRate: 168,
        role: 'physicist',
        text: 'Curie: Better questions require patience. The public sees the glow, but not the notebook, the failed separations, the burns, the long obedience to fact.',
        visual: 'the notebook slows appetite',
      },
      {
        speaker: 'Feynman',
        localVoice: 'Ralph',
        localRate: 182,
        role: 'physicist',
        text: 'Feynman: And the notebook has to report what ruins your favorite idea. Nature is the judge. A beautiful theory still gets tossed when the experiment says no.',
        visual: 'nature interrupts beautiful theory',
      },
      {
        speaker: 'Confucius',
        localVoice: 'Rishi',
        localRate: 160,
        role: 'humanist',
        text: 'Confucius: Honesty is not only a method. It is a social practice. A laboratory has teachers, students, sponsors, elders, juniors, and duties to the wider household.',
        visual: 'truth as a social practice',
      },
      {
        speaker: 'Leonardo',
        localVoice: 'Junior',
        localRate: 170,
        role: 'artist-history',
        text: 'Leonardo: Add craft. A tool carries the hand that made it. Design is ethics while it is still a sketch, before bronze, gears, code, or policy harden it.',
        visual: 'design as ethics in material form',
      },
      {
        speaker: 'Frida',
        localVoice: 'Tessa',
        localRate: 166,
        role: 'artist-history',
        text: 'Frida: And ask whose body the tool touches. Grand words are clean because they have no nerves. A scar is more precise.',
        visual: 'the abstract becomes bodily consequence',
      },
      {
        speaker: 'Shakespeare',
        localVoice: 'Moira',
        localRate: 170,
        role: 'humanist',
        text: 'Shakespeare: Every age crowns its cleverest ambition and calls it destiny. My job is to bring the crown downstage until the blood on it can be seen.',
        visual: 'ambition revealed under theatre lights',
      },
      {
        speaker: 'Mandela',
        localVoice: 'Karen',
        localRate: 160,
        role: 'artist-history',
        text: 'Mandela: Seeing the blood is not enough. A wounded society needs courts, schools, habits of listening, and a path back from revenge into shared rule.',
        visual: 'justice as institutions and repair',
      },
      {
        speaker: 'Host',
        localVoice: 'Daniel',
        localRate: 176,
        role: 'host',
        text: 'Host: The room divides into three verbs: discover, interpret, and repair. Is wisdom one of them, or the rhythm that keeps all three from becoming dangerous alone?',
        visual: 'three verbs: discover, interpret, repair',
      },
      {
        speaker: 'Feynman',
        localVoice: 'Ralph',
        localRate: 182,
        role: 'physicist',
        text: 'Feynman: Discovery has to move first sometimes; you cannot regulate a mystery nobody has noticed. But discovery must publish the uncertainty, not hide it in the drawer.',
        visual: 'discovery with uncertainty attached',
      },
      {
        speaker: 'Socrates',
        localVoice: 'Daniel',
        localRate: 164,
        role: 'humanist',
        text: 'Socrates: Interpretation must walk beside it. Facts do not tell us by themselves what courage, justice, moderation, or a good life should mean.',
        visual: 'facts need a question about the good',
      },
      {
        speaker: 'Mandela',
        localVoice: 'Karen',
        localRate: 160,
        role: 'artist-history',
        text: 'Mandela: Repair must not arrive last. If knowledge helps break a community, apology without reconstruction is only another performance.',
        visual: 'repair cannot be the afterthought',
      },
      {
        speaker: 'Curie',
        localVoice: 'Samantha',
        localRate: 168,
        role: 'physicist',
        text: 'Curie: Then the answer is not one ruler. Knowledge should serve life, and life asks for accuracy, restraint, usefulness, mercy, and time.',
        visual: 'accuracy, restraint, mercy, and time',
      },
      {
        speaker: 'Shakespeare',
        localVoice: 'Moira',
        localRate: 170,
        role: 'humanist',
        text: 'Shakespeare: I accept that ending if tragedy remains in the room. Wisdom begins when triumph stops flattering itself and listens for the cost offstage.',
        visual: 'wisdom interrupts triumph',
      },
      {
        speaker: 'Einstein',
        localVoice: 'Albert',
        localRate: 166,
        role: 'physicist',
        text: 'Einstein: Wonder keeps expertise from becoming ownership. The universe is not small enough to belong to one profession, one nation, or one victorious method.',
        visual: 'wonder keeps expertise humble',
      },
      {
        speaker: 'Host',
        localVoice: 'Daniel',
        localRate: 176,
        role: 'host',
        text: 'Host: Final synthesis: knowledge should serve the enlargement of life: tested by evidence, disciplined by doubt, interpreted by culture, shaped by craft, embodied in care, and accountable to justice.',
        visual: 'final synthesis around the table',
      },
      {
        speaker: 'Host',
        localVoice: 'Daniel',
        localRate: 176,
        role: 'host',
        text: 'Host: That is the episode. Nine distilled minds, one impossible table, and a reminder: intelligence becomes wisdom only when it learns whom it serves.',
        visual: 'closing reminder: whom does intelligence serve',
      },
    ],
    upload: {
      title: 'The Nine Minds Podcast: Einstein, Curie, Socrates, Frida, Mandela and More',
      description: `${fictionalRoundtableDisclosure}\nAn animated roundtable podcast where nine historical figures debate what knowledge should serve when discovery outruns wisdom.`,
      tags: ['animated podcast', 'history of ideas', 'Einstein', 'Marie Curie', 'Socrates', 'Confucius', 'Shakespeare', 'Frida Kahlo', 'Nelson Mandela'],
    },
  },
  {
    id: 'mockumentary_professor_vane',
    style: 'mockumentary',
    title: 'The Untouchable Professor',
    hook: 'He faked science for twenty years. A birthday cake ended him.',
    topic: 'Research misconduct (fictional satire)',
    voice: 'ash',
    ttsInstructions:
      'Prestige true-crime documentary narrator: dry, deadpan, quietly amused. Slow deliberate pacing, perfect diction, a hint of an eyebrow raised on every punchline. Never break into laughter; let the absurdity do the work.',
    palette: {bg: '#17110B', accent: '#D9A441', accent2: '#B33A3A', ink: '#F5EFE2', panel: '#2A2118'},
    beats: [
      {
        text: 'Meet Professor Alistair Vane. Legendary scientist. Four hundred papers, sixty awards, one small problem: a great deal of it was fiction.',
        visual: 'grand office, awards wall, proud professor',
      },
      {
        text: 'As a young researcher, he discovered something more powerful than any molecule: the image editor. Flip a figure, tweak a curve, and suddenly every experiment works on the first try.',
        visual: 'young researcher at glowing monitor, duplicated images',
      },
      {
        text: "Years later, the internet's data detectives noticed the same cells starring in five different papers. Same image, new caption. His research had become a cinematic universe.",
        visual: 'red string collage of duplicated figures',
      },
      {
        text: 'The university investigated. The committee were his old friends. The journals? He reviewed for them. The inquiry took six years and concluded, with great confidence, nothing.',
        visual: 'committee closes folders in unison',
      },
      {
        text: 'Students who asked questions were invited to pursue exciting opportunities elsewhere. Students who stayed quiet received glowing letters. Everyone learned something. Mostly fear.',
        visual: 'young researcher leaves with cardboard box',
      },
      {
        text: 'For twenty years, nothing stuck. The evidence piled up online, and the awards piled up on his shelf. Fraud, it turns out, is also peer reviewed.',
        visual: 'trophy shelf grows, professor ages',
      },
      {
        text: "Then came his sixty-fifth birthday. An ice sculpture. A string quartet. A cake covered in actual gold. All of it billed to his research grant as 'conference catering.'",
        visual: 'opulent gala, gilded cake, ice sculpture',
      },
      {
        text: 'And that was the end. Not the fabricated data — the cake. The finance office does not debate statistics. A receipt is a receipt, and an ice sculpture is not a conference.',
        visual: 'auditor lamp, receipts, escorted out',
      },
      {
        text: 'He survived two decades of scientific misconduct and fell to a birthday party. The moral: peer review forgives many sins. Accounting forgives none.',
        visual: 'empty chair, bright rectangle where portrait hung',
      },
    ],
    upload: {
      title: 'He Faked Science for 20 Years. A Birthday Cake Ended Him.',
      description: `${fictionalSatireDisclosure}\nA satirical mockumentary about research misconduct: fabricated figures, toothless inquiries, and the one thing academia audits properly — receipts.`,
      tags: ['research fraud', 'academic misconduct', 'satire', 'peer review', 'science', 'mockumentary', 'retraction', 'academia'],
    },
  },
];
