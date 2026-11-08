// The microphone to record narration with: the one picked in a clip's "Check the microphone" (kept in this
// browser), else the system default. Echo cancellation off (it eats quiet speech), noise suppression on.

const KEY = 'jzm.micDevice';

export function micDevice(): string | undefined {
  try { return localStorage.getItem(KEY) || undefined; } catch { return undefined; }
}

export function setMicDevice(id: string | undefined) {
  try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* no storage */ }
}

export function micConstraints(): MediaTrackConstraints {
  const id = micDevice();
  return { echoCancellation: false, noiseSuppression: true, ...(id ? { deviceId: { ideal: id } } : {}) };
}
