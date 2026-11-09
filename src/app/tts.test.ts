import { describe, expect, it } from 'vitest';
import { splitSentences } from './tts';
import { withoutDirections } from './tts';

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

describe('directions for the voice', () => {
  it('leaves [directions] out of what is read', () => {
    expect(withoutDirections('[warm] Every step is on screen: [emphasis] what was asked.')).toBe('Every step is on screen: what was asked.');
    expect(withoutDirections('Said plainly [short pause] , then on.')).toBe('Said plainly, then on.');
    expect(withoutDirections('No directions here.')).toBe('No directions here.');
    expect(withoutDirections('We shipped it (long-break) on Friday (as planned).')).toBe('We shipped it on Friday (as planned).');
  });
});

