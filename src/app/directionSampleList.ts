// The examples in "How to direct your voice" (VoiceDirections.tsx): one short sentence said plainly and with different
// directions, so the difference can be heard (in a long sentence it spreads thin). server/directionSamples.ts makes
// them in the voice in use. The tips say what measuring them in Jakub's cloned voice showed.

export interface DirectionSample { id: string; label: string; text: string; tip: string }

const LINE = 'We shipped it on Friday.';

export const DIRECTION_SAMPLES: DirectionSample[] = [
  { id: 'plain', label: 'As written', text: LINE, tip: 'No direction: how the voice reads it by itself. Compare the others with this one.' },
  { id: 'excited', label: '[excited]', text: `[excited] ${LINE}`, tip: 'One mild word changes little: compare the next one.' },
  { id: 'very-excited', label: '[very excited, shouting with joy]', text: `[very excited, shouting with joy] ${LINE}`, tip: 'Say more, and stronger: clearly louder and higher. Descriptive directions work best.' },
  { id: 'whisper', label: '[whispering quietly]', text: `[whispering quietly] ${LINE}`, tip: 'Flatter and softer, but your cloned voice rarely truly whispers (it keeps to its sample): it can take a few tries.' },
  { id: 'sad', label: '[sad, disappointed, slow]', text: `[sad, disappointed, slow] ${LINE}`, tip: 'A mood and a pace together: up to three things at once.' },
  { id: 'emphasis', label: '[strong emphasis] on one word', text: 'We shipped it on [strong emphasis] Friday.', tip: 'Right before the word to stress: only that word changes.' },
  { id: 'break', label: '(long-break) a pause', text: 'We shipped it (long-break) on Friday.', tip: 'A real pause where you put it (about a second). Round brackets: (break), (long-break), (breath).' },
  { id: 'question', label: '[curious, rising]', text: '[curious, rising] Did we ship it on Friday?', tip: 'Helps a question sound like one.' },
];
