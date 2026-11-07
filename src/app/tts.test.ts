import { describe, expect, it } from 'vitest';
import { splitSentences } from './tts';

describe('splitSentences (prompter lines)', () => {
  it('keeps a single line break inside a sentence', () => {
    expect(splitSentences('Line one\nline two\nline three.')).toEqual(['Line one\nline two\nline three.']);
  });
  it('starts a new line after a sentence end or a blank line', () => {
    expect(splitSentences('First. Second?\nThird!')).toEqual(['First.', 'Second?', 'Third!']);
    expect(splitSentences('No full stop\n\nnext paragraph')).toEqual(['No full stop', 'next paragraph']);
  });
  it('does not start a line with leftover blank lines or spaces', () => {
    expect(splitSentences('Two blank lines\n\n\n\nthen this')).toEqual(['Two blank lines', 'then this']);
    expect(splitSentences('  Trailing   \n  next  ')).toEqual(['Trailing   \n  next']);
  });
});
