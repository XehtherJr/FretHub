/**
 * ChordDiagram — vertical, publication-style chord box built from a Voicing.
 * Purely presentational; the voicing itself comes from the engine.
 */
import { Voicing } from '@core/voicing-engine';
import { Tuning } from '@core/tunings';
import { fretPc } from '@core/voicing-engine';
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
  const fretted = frets.filter((f): f is number => f !== null && f > 0);
  const position = fretted.length ? Math.min(...fretted) : 0;
  const startFret = position <= 1 ? 1 : position;
  const highest = fretted.length ? Math.max(...fretted) : startFret;
  const rows = Math.max(5, highest - startFret + 1);
  const stringCount = frets.length;

  const tabLabel = frets.map((f) => (f === null ? 'x' : String(f))).join(' ');

  return (
    <figure
      className="chord-diagram"
      role="img"
      aria-label={`${name ? `${name}, ` : ''}fret positions low to high: ${tabLabel}`}
      style={{ margin: 0, ['--cd-strings' as string]: stringCount, ['--cd-rows' as string]: rows }}
    >
      <div className="cd-top">
        {frets.map((f, i) => (
          <span key={i} className={f === null ? 'muted' : ''}>
            {f === null ? '×' : f === 0 ? 'O' : ''}
          </span>
        ))}
      </div>

      <div
        className="cd-grid"
        style={{ ['--cd-nut' as string]: startFret === 1 ? '5px' : '2px' }}
      >
        {startFret > 1 && <span className="cd-position-label">fr. {startFret}</span>}

        {barre && (
          <div
            className="cd-barre"
            style={{
              top: `calc(${((barre.fret - startFret) / rows) * 100}% + ${32 / rows}%)`,
              height: `${36 / rows}%`,
              left: `calc(${(barre.stringFrom / stringCount) * 100}% + 4%)`,
              width: `calc(${((barre.stringTo - barre.stringFrom + 1) / stringCount) * 100}% - 8%)`,
            }}
            aria-hidden="true"
          >
            1
          </div>
        )}

        {Array.from({ length: rows }).map((_, row) =>
          frets.map((f, col) => {
            const isFirstRow = row === 0;
            const inThisCell = f !== null && f > 0 && f - startFret === row;
            const isRoot = inThisCell && rootPc !== undefined && fretPc(tuning, col, f as number) === rootPc;
            return (
              <div key={`${row}-${col}`} className={`cd-fret-cell ${isFirstRow ? 'cd-row-first' : ''}`}>
                {inThisCell && (
                  <span className={`cd-dot ${isRoot ? 'root' : ''}`}>
                    {fingers[col] !== 'x' && fingers[col] !== 0 ? fingers[col] : ''}
                  </span>
                )}
              </div>
            );
          }),
        )}
      </div>

      {showNotes && !compact && (
        <div className="cd-notes">
          {frets.map((f, i) => (
            <span key={i}>{f === null ? '–' : pcToNote(fretPc(tuning, i, f))}</span>
          ))}
        </div>
      )}
      {name && <figcaption className="cd-name">{name}</figcaption>}
    </figure>
  );
}
