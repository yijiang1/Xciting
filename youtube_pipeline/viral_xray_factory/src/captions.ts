// Word-level caption paging shared by the Remotion composition (karaoke
// captions) and the SRT writer. Words come from Whisper word timestamps.

export type CaptionWord = {
  text: string;
  start: number;
  end: number;
};

export type CaptionPage = {
  start: number;
  end: number;
  words: CaptionWord[];
};

type PageOptions = {
  maxWords?: number;
  maxDuration?: number;
  maxGap?: number;
};

export const buildCaptionPages = (words: CaptionWord[], options: PageOptions = {}): CaptionPage[] => {
  const maxWords = options.maxWords ?? 4;
  const maxDuration = options.maxDuration ?? 2.6;
  const maxGap = options.maxGap ?? 0.7;

  const pages: CaptionPage[] = [];
  let current: CaptionWord[] = [];

  const flush = () => {
    if (current.length === 0) return;
    pages.push({start: current[0].start, end: current[current.length - 1].end, words: current});
    current = [];
  };

  for (const word of words) {
    const last = current[current.length - 1];
    const wouldExceed =
      current.length >= maxWords ||
      (current.length > 0 && word.end - current[0].start > maxDuration) ||
      (last !== undefined && word.start - last.end > maxGap);
    if (wouldExceed) flush();
    current.push(word);
    if (/[.!?…]$/.test(word.text)) flush();
  }
  flush();

  // Extend each page until the next one starts so captions never flicker off
  // between words.
  for (let i = 0; i < pages.length - 1; i += 1) {
    pages[i] = {...pages[i], end: Math.min(pages[i + 1].start, pages[i].end + 0.5)};
  }
  if (pages.length > 0) {
    const last = pages[pages.length - 1];
    pages[pages.length - 1] = {...last, end: last.end + 0.4};
  }
  return pages;
};
