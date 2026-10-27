import { useState } from 'react';
import { strum, playMidi, isAudioSupported } from '@core/audio';

interface PlayButtonProps {
  /** Low-to-high MIDI notes; null entries are muted strings. */
  midi?: (number | null)[];
  /** Or a single MIDI note. */
  note?: number;
  label?: string;
  small?: boolean;
  direction?: 'down' | 'up';
}

/** Audio playback button. Synthesizes sound live — no audio files required. */
export default function PlayButton({ midi, note, label, small, direction = 'down' }: PlayButtonProps) {
  const [active, setActive] = useState(false);
  if (!isAudioSupported()) return null;

  const play = () => {
    if (midi) strum(midi, direction);
    else if (note !== undefined) playMidi(note);
    setActive(true);
    window.setTimeout(() => setActive(false), 350);
  };

  return (
    <button
      type="button"
      className={`btn btn-primary ${small ? 'btn-sm' : ''}`}
      onClick={play}
      aria-label={label ?? 'Play sound'}
      style={active ? { filter: 'brightness(1.2)' } : undefined}
    >
      <span aria-hidden="true">▶</span> {label ?? 'Play'}
    </button>
  );
}
