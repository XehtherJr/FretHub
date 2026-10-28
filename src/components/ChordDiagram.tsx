/** A conventional vertical chord chart, drawn from an engine-generated voicing. */
import { useId } from 'react';
import { Voicing, fretPc } from '@core/voicing-engine';
import { Tuning } from '@core/tunings';
import { pcToNote } from '@core/notes';

interface ChordDiagramProps {
  voicing: Voicing;
  tuning: Tuning;
  name?: string;
  showNotes?: boolean;
  rootPc?: number;
  compact?: boolean;
}

export default function ChordDiagram({
  voicing, tuning, name, showNotes = true, rootPc, compact,
}: ChordDiagramProps) {
  const { frets, fingers, barre } = voicing;
  const barres = voicing.barres ?? (barre ? [barre] : []);
  const descriptionId = useId();
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const position = fretted.length ? Math.min(...fretted) : 0;
  const startFret = position <= 1 ? 1 : position;
  const highest = fretted.length ? Math.max(...fretted) : startFret;
  const rows = Math.max(5, highest - startFret + 1);
  const stringCount = frets.length;
  const stringGap = 24;
  const fretGap = 27;
  const left = 30;
  const top = 28;
  const right = left + (stringCount - 1) * stringGap;
  const bottom = top + rows * fretGap;
  const width = right + 30;
  const height = bottom + (showNotes && !compact ? 25 : 6);
  const tabLabel = frets.map((f) => f === null ? 'x' : String(f)).join(' ');
  const fingeringDescription = frets.map((fret, index) => {
    const string = `string ${stringCount - index}`;
    if (fret === null) return `${string} muted`;
    if (fret === 0) return `${string} open`;
    return `${string}, fret ${fret}, finger ${fingers[index]}`;
  }).join('; ');
  const barreDescription = barres.map((item) => `Finger ${fingers[item.stringFrom]} barres fret ${item.fret} from string ${stringCount - item.stringFrom} through string ${stringCount - item.stringTo}`).join('; ');

  return (
    <figure
      className={`chord-diagram ${compact ? 'is-compact' : ''}`}
      role="img"
      aria-label={`${name ? `${name}, ` : ''}fret positions low to high: ${tabLabel}`}
      aria-describedby={descriptionId}
    >
      <span id={descriptionId} className="sr-only">Suggested fingering: {fingeringDescription}. {barreDescription && `${barreDescription}. `}Finger numbers are estimates.</span>
      <svg className="cd-illustration" viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
        {frets.map((fret, index) => (
          <text key={index} x={left + index * stringGap} y="19" textAnchor="middle" className={`cd-open-marker ${fret === 0 && rootPc !== undefined && fretPc(tuning, index, 0) === rootPc ? 'root' : ''}`}>
            {fret === null ? '×' : fret === 0 ? 'O' : ''}
          </text>
        ))}
        {startFret > 1 && <text x={left - 8} y={top + fretGap / 2 + 4} textAnchor="end" className="cd-position-label">{startFret}fr</text>}
        {frets.map((_, index) => (
          <line key={index} x1={left + index * stringGap} x2={left + index * stringGap} y1={top} y2={bottom} className="cd-string" />
        ))}
        {Array.from({ length: rows + 1 }, (_, row) => (
          <line key={row} x1={left} x2={right} y1={top + row * fretGap} y2={top + row * fretGap} className={row === 0 && startFret === 1 ? 'cd-nut' : 'cd-fret'} />
        ))}
        {barres.map((item) => (
          <g className="cd-barre" key={`${item.fret}:${item.stringFrom}:${item.stringTo}`}>
            <rect
              x={left + item.stringFrom * stringGap - 9}
              y={top + (item.fret - startFret + 0.5) * fretGap - 9}
              width={(item.stringTo - item.stringFrom) * stringGap + 18}
              height="18"
              rx="9"
            />
            <text x={left + (item.stringFrom + item.stringTo) * stringGap / 2} y={top + (item.fret - startFret + 0.5) * fretGap + 3.5} textAnchor="middle">{fingers[item.stringFrom]}</text>
          </g>
        ))}
        {frets.map((fret, index) => {
          if (fret === null || fret === 0) return null;
          const isRoot = rootPc !== undefined && fretPc(tuning, index, fret) === rootPc;
          const onBarre = barres.some((item) => fret === item.fret && index >= item.stringFrom && index <= item.stringTo);
          if (onBarre && !isRoot) return null;
          const finger = fingers[index];
          return (
            <g className={`cd-dot ${isRoot ? 'root' : ''}`} key={index}>
              <circle cx={left + index * stringGap} cy={top + (fret - startFret + 0.5) * fretGap} r="9" />
              <text x={left + index * stringGap} y={top + (fret - startFret + 0.5) * fretGap + 3.5} textAnchor="middle">
                {finger !== 'x' && finger !== 0 ? finger : ''}
              </text>
            </g>
          );
        })}
        {showNotes && !compact && frets.map((fret, index) => (
          <text key={index} x={left + index * stringGap} y={bottom + 19} textAnchor="middle" className="cd-note-name">
            {fret === null ? '–' : pcToNote(fretPc(tuning, index, fret))}
          </text>
        ))}
      </svg>
      {name && <figcaption className="cd-name">{name}</figcaption>}
    </figure>
  );
}
