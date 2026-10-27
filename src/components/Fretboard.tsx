/**
 * Fretboard — the reusable interactive instrument surface.
 *
 * Renders any tuning (6/7/8 strings), any fret count, capo and arbitrary
 * note markers. When `interactive`, every string/fret cell is a real button
 * so the whole board is keyboard and screen-reader operable.
 */
import { Tuning } from '@core/tunings';
import { fretPc } from '@core/voicing-engine';
import { pcToNote } from '@core/notes';

export type MarkerVariant = 'root' | 'tone' | 'scale' | 'cool' | 'open-string';

export interface FretMarkerData {
  stringIndex: number;
  fret: number;
  label?: string;
  variant?: MarkerVariant;
}

interface FretboardProps {
  tuning: Tuning;
  capo?: number;
  fretCount?: number;
  markers?: FretMarkerData[];
  interactive?: boolean;
  onToggle?: (stringIndex: number, fret: number, pc: number) => void;
  selectedKeys?: Set<string>;
  showNoteNames?: boolean;
  showFretNumbers?: boolean;
  preferFlats?: boolean;
  ariaLabel?: string;
}

const INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAYS = new Set([12, 24]);

export function markerKey(stringIndex: number, fret: number): string {
  return `${stringIndex}:${fret}`;
}

export default function Fretboard({
  tuning,
  capo = 0,
  fretCount = 12,
  markers = [],
  interactive = false,
  onToggle,
  selectedKeys,
  showNoteNames = true,
  showFretNumbers = true,
  preferFlats = false,
  ariaLabel = 'Guitar fretboard',
}: FretboardProps) {
  const markerMap = new Map<string, FretMarkerData>();
  for (const m of markers) markerMap.set(markerKey(m.stringIndex, m.fret), m);
  for (const key of selectedKeys ?? []) {
    if (!markerMap.has(key)) {
      const [s, f] = key.split(':').map(Number);
      markerMap.set(key, {
        stringIndex: s,
        fret: f,
        variant: 'tone',
        label: pcToNote(fretPc(tuning, s, f), preferFlats),
      });
    }
  }

  // Visual row order: highest-pitched string at the top.
  const visualIndices = tuning.strings.map((_, i) => i).reverse();
  const frets = Array.from({ length: fretCount }, (_, i) => i + 1);

  return (
    <div className="fb-scroll">
      <div
        className="fretboard"
        role={interactive ? 'group' : 'img'}
        aria-label={ariaLabel}
        style={{
          ['--fb-frets' as string]: fretCount,
          ['--capo-fret' as string]: capo,
          position: 'relative',
        }}
      >
        {capo > 0 && <div className="fb-capo" aria-hidden="true">capo {capo}</div>}

        {visualIndices.map((stringIndex) => {
          const open = tuning.strings[stringIndex];
          const thick = stringIndex < 2 ? 'true' : 'false';
          return (
            <div className="fb-row" key={stringIndex} data-thick={thick}>
              {/* open-string column */}
              <div className="fb-open-cell">
                {(() => {
                  const key = markerKey(stringIndex, 0);
                  const marker = markerMap.get(key);
                  const pc = fretPc(tuning, stringIndex, 0);
                  const label = marker?.label ?? pcToNote(pc, preferFlats);
                  if (interactive) {
                    return (
                      <button
                        type="button"
                        className={`fb-note ${marker ? `v-${marker.variant ?? 'tone'}` : ''}`}
                        aria-label={`${open.label} string open, note ${pcToNote(pc, preferFlats)}${marker ? ', selected' : ''}`}
                        aria-pressed={!!marker}
                        onClick={() => onToggle?.(stringIndex, 0, pc)}
                      >
                        {showNoteNames ? label : ''}
                      </button>
                    );
                  }
                  return marker ? (
                    <span className={`fb-note v-${marker.variant ?? 'tone'}`}>{showNoteNames ? label : ''}</span>
                  ) : (
                    <span className="fb-string-label">{open.label}</span>
                  );
                })()}
              </div>

              {frets.map((fret) => {
                const key = markerKey(stringIndex, fret);
                const marker = markerMap.get(key);
                const pc = fretPc(tuning, stringIndex, fret);
                const label = marker?.label ?? pcToNote(pc, preferFlats);
                const disabledByCapo = capo > 0 && fret <= capo;
                const inlay = INLAYS.has(fret) ? 'single' : DOUBLE_INLAYS.has(fret) ? 'double' : null;

                const inner = marker ? (
                  <span className={`fb-note v-${marker.variant ?? 'tone'}`} aria-hidden={!interactive}>
                    {showNoteNames ? label : ''}
                  </span>
                ) : null;

                if (interactive) {
                  return (
                    <button
                      type="button"
                      key={fret}
                      className={`fb-cell ${marker ? '' : 'is-empty interactive'} ${fret === 1 ? 'fret-0' : ''}`}
                      disabled={disabledByCapo}
                      aria-label={`String ${stringIndex + 1}, fret ${fret}, note ${pcToNote(pc, preferFlats)}${marker ? ', selected' : ''}`}
                      aria-pressed={!!marker}
                      onClick={() => !disabledByCapo && onToggle?.(stringIndex, fret, pc)}
                    >
                      {inlay && (
                        <span className={`fb-inlay ${inlay === 'double' ? 'double' : ''}`} aria-hidden="true">
                          <span className="dot" />
                          {inlay === 'double' && <span className="dot" />}
                        </span>
                      )}
                      {inner}
                    </button>
                  );
                }

                return (
                  <div key={fret} className={`fb-cell ${fret === 1 ? 'fret-0' : ''}`}>
                    {inlay && (
                      <span className={`fb-inlay ${inlay === 'double' ? 'double' : ''}`} aria-hidden="true">
                        <span className="dot" />
                        {inlay === 'double' && <span className="dot" />}
                      </span>
                    )}
                    {inner}
                  </div>
                );
              })}
            </div>
          );
        })}

        {showFretNumbers && (
          <div className="fb-fret-numbers" aria-hidden="true">
            <span />
            {frets.map((f) => (
              <span key={f}>{f}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
