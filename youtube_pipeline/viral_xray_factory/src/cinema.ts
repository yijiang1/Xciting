// Cinematic prompt library for generative footage (Sora 2 / Veo 3.1).
// Each concept gets a "style bible" plus one shot description per beat.
// Keep every prompt free of readable text/labels: burned-in captions are
// composited by Remotion, and generated text is the fastest way to look AI-made.

export type CinemaSpec = {
  mode: 'per-beat' | 'ambient';
  stylePrompt: string;
  // One entry per beat (per-beat mode). Falls back to beat.visual when missing.
  shots?: string[];
  // Reusable establishing loops (ambient mode).
  ambientShots?: string[];
  musicPrompt?: string;
};

export const NEGATIVE_PROMPT =
  'No on-screen text, no letters, no numbers, no captions, no subtitles, no user interface, no watermark, no logo.';

export const cinema: Record<string, CinemaSpec> = {
  cartoon_bragg_detective: {
    mode: 'per-beat',
    stylePrompt:
      'Premium 2D animated educational short in the spirit of a top-tier science animation studio: flat design with soft paper texture, subtle grain, gentle parallax, deep navy palette with warm amber and teal rim light, smooth cinematic camera moves. A tiny glowing photon character wearing a detective trench coat and fedora explores a vast luminous crystal city built from neatly stacked glowing atom spheres.',
    shots: [
      'Wide establishing shot at night: the photon detective walks into a glittering crystal city, rows of glowing atomic spheres stacked like skyscraper floors, volumetric light shafts drifting between the towers.',
      'Slow lateral dolly across perfectly ordered horizontal planes of glowing atoms stacked like apartment floors, tiny electrons shimmering on each level.',
      'Two bright X-ray beams enter at the same angle: one reflects off the top plane of atoms, the other dives one layer deeper and reflects back, both drawn as elegant curving light trails.',
      'Close-up on the deeper beam threading between two atomic planes, its extra path glowing warm amber while the geometry of the layers stays crisp and calm.',
      'Two gentle golden light waves drift together over the crystal city and align into one calm synchronized ripple pattern, the city softly glowing in harmony.',
      'Triumphant hero shot: the photon detective tips his fedora as a radiant starburst of diffracted light erupts from the crystal skyline, celebratory sparks drifting down.',
    ],
    musicPrompt:
      'Playful mystery-cartoon underscore: pizzicato strings, light woodwinds, soft vibraphone, gentle percussion, curious and warm, instrumental, loopable, no vocals.',
  },
  interview_absorption_edge: {
    mode: 'per-beat',
    stylePrompt:
      'Stylized 3D animated late-night podcast studio: cozy dramatic lighting, walnut desk with two studio microphones, cyan and coral neon rim light, shallow depth of field with cinematic bokeh. The two charming abstract characters are a glowing X-ray photon orb with expressive energy and a plush round atom with softly glowing electron shells.',
    shots: [
      'Warm wide two-shot of the studio: the glowing photon-orb host leans in while the plush atom guest settles into its chair, city lights bokeh behind the glass.',
      'Macro close-up of the atom guest: its inner electron shells glow and rotate slowly as it gestures, dust motes floating in the key light.',
      'A dim, weak photon drifts up to the atom and taps against the outer shell like knocking on a door, then bounces away into the dark, the atom unmoved.',
      'A bright energetic photon strikes the atom; a tiny core electron launches upward like a rocket with a luminous trail while the whole shell flares.',
      'Dreamlike shot: a rippling electron wave expands from the atom and explores the glowing shapes of its neighborhood, like an aurora feeling out empty spaces.',
      'Pull-back shot of the studio desk where soft holographic panels of abstract glowing charts and molecular shapes float between host and guest.',
    ],
    musicPrompt:
      'Late-night talk show lo-fi: warm Rhodes piano, soft upright bass, brushed drums, relaxed and witty, instrumental, loopable, no vocals.',
  },
  gameshow_xrd_peaks: {
    mode: 'per-beat',
    stylePrompt:
      'Retro-futuristic television game show stage with glossy reflective floor, sweeping neon teal and gold spotlights, glittering curtain backdrop, dramatic crane camera moves, vibrant stylized 3D with 1980s glamour and modern polish.',
    shots: [
      'Sweeping crane shot over the glittering stage as spotlights converge on three empty podiums, confetti cannons waiting in the wings.',
      'Three luminous crystal columns of different heights rise from the podiums like chart peaks, each catching a different colored spotlight.',
      'A giant hologram of stacked atomic planes rotates above the stage; beams of light reflect off it at distinct angles toward the podiums.',
      'The middle crystal column stretches taller and visibly broadens while the stage lights shift hue, the audience silhouettes gasping.',
      'A giant glowing fingerprint made of sharp spectral peaks hovers over the stage, slowly rotating under the spotlights.',
      'Winner moment: golden confetti rains down on a gleaming crystal trophy at center stage under a single triumphant spotlight.',
    ],
    musicPrompt:
      'High-energy retro game show theme: funky brass stabs, disco strings, driving bass, glittering synth arps, exciting, instrumental, loopable, no vocals.',
  },
  noir_exafs_echo: {
    mode: 'per-beat',
    stylePrompt:
      'Black-and-white film noir with heavy 35mm grain, deep chiaroscuro shadows, venetian blind light, drifting cigarette-smoke haze, rain-slick alley reflections, slow deliberate dolly moves, one single warm amber accent light in an otherwise monochrome world.',
    shots: [
      'A lone glowing orb of light in a tiny trench coat walks into a foggy alley at night, its glow reflecting off the wet cobblestones.',
      'Shadowy round figures in doorways and fire escapes send faint ripples of light back toward the glowing orb, like whispered echoes.',
      'The overlapping ripples interfere across the wet pavement, forming slowly oscillating bands of light and dark.',
      'Concentric rings of streetlamp glow at different distances pulse at different rhythms through the fog.',
      'The fog slowly resolves into ghostly concentric peaks of light emerging from darkness, like a skyline appearing at dawn.',
      'The glowing detective stands under a single streetlight, tips its hat, and the echoing ripples fade into the mist.',
    ],
    musicPrompt:
      'Smoky film-noir jazz: muted trumpet, brushed snare, double bass, sparse piano, mysterious and dry, instrumental, loopable, no vocals.',
  },
  news_synchrotron_weather: {
    mode: 'per-beat',
    stylePrompt:
      'Sleek photorealistic broadcast news studio: glass desk, giant curved LED wall showing swirling weather-style graphics of a glowing particle storage ring, cool teal and amber studio lighting, polished floor reflections, smooth steadicam moves.',
    shots: [
      'Wide studio establishing shot: the giant LED wall glows with a radar-style map of a luminous storage ring, studio lights sweeping gently.',
      'LED wall close-up: a stream of bright electrons wiggles through an undulator of alternating magnets, throwing off brilliant fans of light.',
      'Elegant animated diagram on the wall: a rainbow beam enters a crystal and a single pure color exits, the rest fading away.',
      'A pair of curved mirrors focuses a thin brilliant beam down onto a tiny sample that sparkles as the beam lands.',
      'A wall of glowing detector panels lights up one by one like a dashboard of storms, data pulses rippling across.',
      'Weather-forecast style outro: stylized sun-like photon icons drift over a glowing aerial map of a circular synchrotron facility at dusk.',
    ],
    musicPrompt:
      'Modern broadcast news bed: pulsing synth arps, confident strings, subtle percussion, urgent but bright, instrumental, loopable, no vocals.',
  },
  mockumentary_professor_vane: {
    mode: 'per-beat',
    stylePrompt:
      'Prestige dark-academia documentary reenactment: wood-paneled university interiors, brass banker lamps, oil portraits, dust motes drifting in shafts of window light, moody cinematic lighting with a muted amber and deep-green grade, shallow depth of field, slow dolly and rack-focus moves, photorealistic, dry satirical tone.',
    shots: [
      'Slow push-in on a distinguished elderly professor in a tweed jacket posing proudly in a grand wood-paneled office, the wall behind him crowded with framed medals and trophies, golden late-afternoon window light.',
      'Reenactment: a young researcher alone in a dark laboratory at night, face lit only by a bright monitor showing rows of nearly identical microscope images, a faint satisfied smile.',
      'A detective-style evidence wall: printed scientific figures pinned up and connected by red string, a magnifying glass held over two identical images, dramatic desk-lamp lighting.',
      'A long mahogany committee table in a dim boardroom; a row of older academics in suits close identical leather folders in unison and nod to one another, lamplight and drifting dust.',
      'A dejected young researcher carries a cardboard box of belongings down a grand vaulted university corridor while colleagues watch silently from doorways.',
      'A bookshelf slowly filling with golden trophies and framed medals as dust motes drift; the aging professor admires his own reflection in the glass cabinet.',
      'An opulent banquet-hall birthday gala: a towering gilded cake with sparkling candles, a glistening swan ice sculpture, a string quartet playing, a champagne tower under chandelier light.',
      "A stern auditor's desk at night with a green banker's lamp and tall stacks of paper receipts; through the open doorway, the old professor carries a small box past his own awards wall.",
      'An empty leather office chair in the grand wood-paneled office; on the wall, a bright clean rectangle where a large portrait once hung, a single medal lying on the floor.',
    ],
    musicPrompt:
      'Sly satirical documentary underscore: sneaky pizzicato strings, harpsichord, a lopsided little waltz, dry and mischievous, instrumental, loopable, no vocals.',
  },
  roundtable_knowledge_wisdom: {
    mode: 'ambient',
    stylePrompt:
      'Cinematic, warm and contemplative: a vast dark wood-paneled library at night, one great round table lit by candles, floating dust motes, volumetric warm light, extremely slow camera moves, photorealistic, painterly color grade.',
    ambientShots: [
      'Extremely slow orbital shot around a candlelit round wooden table with nine empty leather chairs in a vast dark library, dust motes drifting in the warm light.',
      'Slow dolly across shelves of old books and manuscripts by candlelight, soft shadows breathing as the flames flicker.',
      'An abstract constellation of softly glowing points of light drifting above a dark round table, connected by faint luminous threads, very slow drift.',
      'Rain streaking down tall library windows at night, warm interior candle glow reflected in the glass, extremely slow push-in.',
    ],
    musicPrompt:
      'Contemplative chamber underscore: warm cello, soft piano, distant choir pad, slow and thoughtful, instrumental, loopable, no vocals.',
  },
};
