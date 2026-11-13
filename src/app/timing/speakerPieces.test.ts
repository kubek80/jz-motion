import { describe, expect, it } from 'vitest';
import { speakerPieces } from './useNarrationRecording';

describe('a narration take in a podcast, cut by who speaks', () => {
  it('stays one piece when one person says it all (or there is no cast)', () => {
    expect(speakerPieces([{ at: 0, speaker: 'jakub' }, { at: 4, speaker: 'jakub' }], 10)).toEqual([{ from: 0, to: 10, speaker: 'jakub' }]);
    expect(speakerPieces([{ at: 0 }, { at: 3 }], 10)).toEqual([{ from: 0, to: 10, speaker: undefined }]);
    expect(speakerPieces([], 6)).toEqual([{ from: 0, to: 6 }]);
  });

  it('is cut where the speaker changes', () => {
    expect(speakerPieces([{ at: 0, speaker: 'jakub' }, { at: 3, speaker: 'anna' }, { at: 5, speaker: 'anna' }, { at: 7.5, speaker: 'jakub' }], 10)).toEqual([
      { from: 0, to: 3, speaker: 'jakub' },
      { from: 3, to: 7.5, speaker: 'anna' },
      { from: 7.5, to: 10, speaker: 'jakub' },
    ]);
  });

  it('drops a piece too short to matter, joining what is around it', () => {
    expect(speakerPieces([{ at: 0, speaker: 'jakub' }, { at: 2, speaker: 'anna' }, { at: 2.01, speaker: 'jakub' }], 6)).toEqual([{ from: 0, to: 6, speaker: 'jakub' }]);
  });
});
