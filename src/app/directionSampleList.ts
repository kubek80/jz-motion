// The examples in "How to direct your voice" (VoiceDirections.tsx): one sentence said plainly and with different
// directions, so the difference can be heard. server/directionSamples.ts makes them in the voice in use.

export interface DirectionSample { id: string; label: string; text: string; tip: string }

const LINE = 'Every step is on screen: what was asked, what came back, and what the checker found.';

export const DIRECTION_SAMPLES: DirectionSample[] = [
  { id: 'plain', label: 'As written', text: LINE, tip: 'No direction: how the voice reads it by itself.' },
  { id: 'emphasis', label: '[emphasis] on a word', text: 'Every step is on screen: what was asked, what came back, and [emphasis] what the checker found.', tip: 'Put it right before the word or phrase to stress.' },
  { id: 'warm', label: '[warm, slower]', text: `[warm, slower] ${LINE}`, tip: 'At the start: a calmer, friendlier reading of the whole sentence.' },
  { id: 'excited', label: '[excited]', text: `[excited] ${LINE}`, tip: 'More energy; good for a reveal or the end of a demo.' },
  { id: 'serious', label: '[serious, professional broadcast tone]', text: `[serious, professional broadcast tone] ${LINE}`, tip: 'Free-form descriptions work: say how it should sound.' },
  { id: 'pause', label: '[short pause] mid-sentence', text: 'Every step is on screen: what was asked, [short pause] what came back, and what the checker found.', tip: 'A breath exactly where you want it (kept: pauses you ask for are not shortened).' },
  { id: 'whisper', label: '[whispering]', text: `[whispering] ${LINE}`, tip: 'For an aside. Strong directions change the voice a lot: use them rarely.' },
  { id: 'question', label: '[curious, rising]', text: '[curious, rising] So what did the checker find?', tip: 'Helps a question sound like one.' },
];
