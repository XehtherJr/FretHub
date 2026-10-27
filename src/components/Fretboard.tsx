/**
 * A physical fretboard shared by the workbench, scale library and practice.
 *
 * `tuning` is always the un-capoed tuning. Frets are physical fret numbers;
 * fret 0 represents the open string (sounding at the capo when one is used).
 * Pitch calculation stays in the music engine; this component only lays out
 * its results and reports the selected string, fret and pitch class.
 */
import { KeyboardEvent, useId, useRef, useState } from 'react';
import { Tuning } from '@core/tunings';
import { fretPc } from '@core/voicing-engine';
import { fretToMidi, pcToNote } from '@core/notes';
import { FRETBOARD_NUT_X, fretCentreX, fretWireX } from '@/lib/fretboardGeometry';

export type MarkerVariant = 'root' | 'tone' | 'scale' | 'cool' | 'open-string';

export interface FretMarkerData {
  stringIndex: number;
  /** Physical fret number, or 0 for the open string. */
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
  /** Select positions, or audition positions without changing the overlay. */
  interaction?: 'select' | 'play';
  onToggle?: (stringIndex: number, fret: number, pc: number) => void;
  selectedKeys?: Set<string>;
  showNoteNames?: boolean;
  showFretNumbers?: boolean;
  preferFlats?: boolean;
  ariaLabel?: string;
}

const INLAYS = new Set([3, 5, 7, 9, 15, 17, 19, 21]);
const DOUBLE_INLAYS = new Set([12, 24]);
const STRING_GAP = 44;
const FIRST_STRING_Y = 57;
const OPEN_LEFT = 32;

export function markerKey(stringIndex: number, fret: number): string {
  return `${stringIndex}:${fret}`;
}

export default function Fretboard({
  tuning,
  capo = 0,
  fretCount = 12,
  markers = [],
  interactive = false,
  interaction = 'select',
  onToggle,
  selectedKeys,
  showNoteNames = true,
  showFretNumbers = true,
  preferFlats = false,
  ariaLabel = 'Guitar fretboard',
}: FretboardProps) {
  const id = useId().replace(/:/g, '');
  const boardRef = useRef<HTMLDivElement>(null);
  const [focusKey, setFocusKey] = useState(() => markerKey(tuning.strings.length - 1, 0));
  const markerMap = new Map<string, FretMarkerData>();
  const soundingFret = (fret: number) => fret === 0 ? capo : fret;

  for (const marker of markers) markerMap.set(markerKey(marker.stringIndex, marker.fret), marker);
  for (const key of selectedKeys ?? []) {
    if (!markerMap.has(key)) {
      const [stringIndex, fret] = key.split(':').map(Number);
      markerMap.set(key, {
        stringIndex,
        fret,
        variant: 'tone',
        label: pcToNote(fretPc(tuning, stringIndex, soundingFret(fret)), preferFlats),
      });
    }
  }

  const stringCount = tuning.strings.length;
  const visualIndices = tuning.strings.map((_, i) => i).reverse();
  const frets = Array.from({ length: fretCount }, (_, i) => i + 1);
  const endX = fretWireX(fretCount) + 5;
  const width = endX + 5;
  const lastStringY = FIRST_STRING_Y + (stringCount - 1) * STRING_GAP;
  const bottomAtNut = lastStringY + 26;
  const height = bottomAtNut + 53;
  const boardPath = `M ${FRETBOARD_NUT_X} 31 L ${endX} 22 L ${endX} ${bottomAtNut + 9} L ${FRETBOARD_NUT_X} ${bottomAtNut} Z`;
  const percent = (value: number) => `${(value / width) * 100}%`;
  const stringY = (visualIndex: number, x: number) => {
    const across = Math.max(0, (x - FRETBOARD_NUT_X) / (endX - FRETBOARD_NUT_X));
    const taper = (visualIndex / Math.max(1, stringCount - 1)) * 2 - 1;
    return FIRST_STRING_Y + visualIndex * STRING_GAP + taper * 8 * across;
  };
  const isPlayable = (fret: number) => fret === 0 || fret > capo;
  const fallbackKey = markerKey(stringCount - 1, 0);
  const [focusedString, focusedFret] = focusKey.split(':').map(Number);
  const effectiveFocusKey = focusedString >= 0 && focusedString < stringCount && focusedFret <= fretCount && isPlayable(focusedFret)
    ? focusKey : fallbackKey;

  const handleNavigation = (event: KeyboardEvent<HTMLButtonElement>, stringIndex: number, fret: number) => {
    let nextString = stringIndex;
    let nextFret = fret;
    switch (event.key) {
      case 'ArrowUp': nextString = Math.min(stringCount - 1, stringIndex + 1); break;
      case 'ArrowDown': nextString = Math.max(0, stringIndex - 1); break;
      case 'ArrowRight': nextFret = fret === 0 ? Math.min(fretCount, capo + 1) : Math.min(fretCount, fret + 1); break;
      case 'ArrowLeft': nextFret = fret <= capo + 1 ? 0 : fret - 1; break;
      case 'Home': nextFret = 0; break;
      case 'End': nextFret = fretCount; break;
      default: return;
    }
    event.preventDefault();
    const nextKey = markerKey(nextString, nextFret);
    setFocusKey(nextKey);
    boardRef.current?.querySelector<HTMLButtonElement>(`button[data-position="${nextKey}"]`)?.focus();
  };

  const renderPosition = (stringIndex: number, visualIndex: number, fret: number) => {
    const key = markerKey(stringIndex, fret);
    const marker = markerMap.get(key);
    const physicalFret = soundingFret(fret);
    const pc = fretPc(tuning, stringIndex, physicalFret);
    const midi = fretToMidi(tuning.strings[stringIndex].pc, tuning.strings[stringIndex].octave, physicalFret);
    const noteName = pcToNote(pc, preferFlats);
    const pitchName = `${noteName}${Math.floor(midi / 12) - 1}`;
    const label = marker?.label ?? noteName;
    const open = fret === 0;
    const left = open ? OPEN_LEFT : fretWireX(fret - 1);
    const right = open ? FRETBOARD_NUT_X : fretWireX(fret);
    const centre = (left + right) / 2;
    const y = stringY(visualIndex, centre);
    const positionStyle = {
      left: percent(left),
      width: percent(right - left),
      top: `${y - STRING_GAP / 2}px`,
      height: `${STRING_GAP}px`,
    };
    const note = marker ? (
      <span className={`fb-note v-${marker.variant ?? 'tone'}`} aria-hidden="true">{showNoteNames ? label : ''}</span>
    ) : open && showNoteNames ? (
      <span className="fb-open-note" aria-hidden="true">{noteName}</span>
    ) : showNoteNames && interactive ? (
      <span className="fb-hover-note" aria-hidden="true">{noteName}</span>
    ) : null;

    if (!interactive) {
      return note ? <span key={key} className="fb-position fb-static" style={positionStyle}>{note}</span> : null;
    }

    const stringNumber = stringCount - stringIndex;
    const positionLabel = open
      ? `${tuning.strings[stringIndex].label} string open${capo ? `, capo fret ${capo}` : ''}${showNoteNames ? `, note ${pitchName}` : ''}, string ${stringNumber}`
      : `String ${stringNumber}, fret ${fret}${showNoteNames ? `, note ${pitchName}` : ''}`;
    return (
      <button
        key={key}
        type="button"
        className={`fb-position fb-hit ${open ? 'is-open' : ''} ${marker ? 'has-marker' : ''}`}
        style={positionStyle}
        data-position={key}
        disabled={!isPlayable(fret)}
        tabIndex={key === effectiveFocusKey ? 0 : -1}
        aria-label={`${positionLabel}${interaction === 'play' ? ', play note' : marker ? ', selected' : ''}`}
        aria-pressed={interaction === 'select' ? !!marker : undefined}
        onFocus={() => setFocusKey(key)}
        onKeyDown={(event) => handleNavigation(event, stringIndex, fret)}
        onClick={() => onToggle?.(stringIndex, fret, pc)}
      >
        {note}
      </button>
    );
  };

  return (
    <div className="fb-scroll">
      <div
        ref={boardRef}
        className="fretboard"
        role={interactive ? 'group' : 'img'}
        aria-label={ariaLabel}
        style={{ minWidth: `${width}px`, height: `${height}px` }}
      >
        <svg className="fb-instrument" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id={`${id}-wood`} x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
              <stop offset="0" stopColor="#241b19" />
              <stop offset="0.14" stopColor="#49302a" />
              <stop offset="0.47" stopColor="#382521" />
              <stop offset="0.78" stopColor="#46302a" />
              <stop offset="1" stopColor="#211917" />
            </linearGradient>
            <linearGradient id={`${id}-fret`} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0" stopColor="#4a403a" />
              <stop offset="0.4" stopColor="#d8d1c2" />
              <stop offset="0.7" stopColor="#a49b8d" />
              <stop offset="1" stopColor="#554a43" />
            </linearGradient>
            <radialGradient id={`${id}-inlay`}>
              <stop offset="0" stopColor="#d5c9ae" />
              <stop offset="1" stopColor="#867864" />
            </radialGradient>
            <clipPath id={`${id}-clip`}><path d={boardPath} /></clipPath>
          </defs>

          {/* A tapered fingerboard, with long irregular grain rather than tiled texture. */}
          <path d={boardPath} fill={`url(#${id}-wood)`} stroke="#171311" strokeWidth="2" />
          <g clipPath={`url(#${id}-clip)`} fill="none">
            {[0.07, 0.14, 0.23, 0.34, 0.47, 0.55, 0.66, 0.76, 0.84, 0.92].map((fraction, index) => {
              const y = 25 + fraction * (bottomAtNut - 16);
              const bend = (index % 3 - 1) * 7;
              return <path key={fraction} d={`M ${FRETBOARD_NUT_X} ${y} C ${width * 0.27} ${y + bend}, ${width * 0.62} ${y - bend * 0.8}, ${endX} ${y + bend * 0.45}`} stroke={index % 2 ? '#bd8c6c' : '#120e0c'} strokeWidth={index % 3 === 0 ? 2 : 1} opacity={index % 2 ? 0.08 : 0.17} />;
            })}
            {capo > 0 && <rect x={FRETBOARD_NUT_X} y="15" width={fretWireX(capo) - FRETBOARD_NUT_X} height={height} fill="#0c0b0a" opacity="0.3" />}
          </g>
          <path d={`M ${FRETBOARD_NUT_X} 31 L ${endX} 22 M ${FRETBOARD_NUT_X} ${bottomAtNut} L ${endX} ${bottomAtNut + 9}`} fill="none" stroke="#a27860" strokeOpacity="0.24" strokeWidth="2" />

          {frets.filter((fret) => INLAYS.has(fret) || DOUBLE_INLAYS.has(fret)).map((fret) => {
            const x = fretCentreX(fret);
            const middle = (FIRST_STRING_Y + lastStringY) / 2;
            const offset = (lastStringY - FIRST_STRING_Y) * 0.27;
            return DOUBLE_INLAYS.has(fret) ? (
              <g key={fret} fill={`url(#${id}-inlay)`} opacity="0.75">
                <circle cx={x} cy={middle - offset} r="6.5" /><circle cx={x} cy={middle + offset} r="6.5" />
              </g>
            ) : <circle key={fret} cx={x} cy={middle} r="6.5" fill={`url(#${id}-inlay)`} opacity="0.75" />;
          })}

          {frets.map((fret) => {
            const x = fretWireX(fret);
            const across = (x - FRETBOARD_NUT_X) / (endX - FRETBOARD_NUT_X);
            return <rect key={fret} x={x - 2.2} y={31 - 9 * across} width="4.4" height={bottomAtNut - 31 + 18 * across} fill={`url(#${id}-fret)`} />;
          })}
          {/* The nut is a distinct piece, not the first fret wire. */}
          <rect x={FRETBOARD_NUT_X - 4} y="29" width="8" height={bottomAtNut - 27} rx="1" fill="#d4c9b6" />
          <rect x={FRETBOARD_NUT_X + 1} y="29" width="2" height={bottomAtNut - 27} fill="#756c60" opacity="0.6" />

          {visualIndices.map((stringIndex, visualIndex) => {
            const y1 = stringY(visualIndex, FRETBOARD_NUT_X);
            const y2 = stringY(visualIndex, endX);
            const thickness = 1.1 + (stringIndex === 0 ? 2.2 : (stringCount - 1 - stringIndex) / Math.max(1, stringCount - 1) * 2.2);
            const wound = stringIndex < Math.max(3, stringCount - 3);
            return (
              <g key={stringIndex}>
                <line x1={OPEN_LEFT} y1={y1 + 1.3} x2={endX} y2={y2 + 1.3} stroke="#0e0b0a" strokeWidth={thickness + 1.5} opacity="0.65" />
                <line x1={OPEN_LEFT} y1={y1} x2={endX} y2={y2} stroke={wound ? '#b6a99a' : '#ded6c7'} strokeWidth={thickness} />
                {wound && <line x1={OPEN_LEFT} y1={y1 - 0.35} x2={endX} y2={y2 - 0.35} stroke="#f0e7d7" strokeWidth="0.55" strokeDasharray="2 2.4" opacity="0.6" />}
                <text x="10" y={y1 + 4} className="fb-svg-string-label">{pcToNote(tuning.strings[stringIndex].pc, preferFlats)}</text>
              </g>
            );
          })}

          {capo > 0 && (
            <g className="fb-capo">
              <rect x={fretWireX(capo) - 11} y="26" width="9" height={bottomAtNut - 17} rx="3" fill="#222220" stroke="#9b9385" strokeWidth="1.5" />
              <text x={fretWireX(capo) - 7} y="15" textAnchor="middle" className="fb-svg-capo-label">capo {capo}</text>
            </g>
          )}
          <text x="54" y="15" textAnchor="middle" className="fb-svg-caption">OPEN</text>
          {showFretNumbers && frets.map((fret) => (
            <text key={fret} x={fretCentreX(fret)} y={bottomAtNut + 36} textAnchor="middle" className="fb-svg-fret-number">{fret}</text>
          ))}
        </svg>
        {visualIndices.flatMap((stringIndex, visualIndex) => [0, ...frets].map((fret) => renderPosition(stringIndex, visualIndex, fret)))}
      </div>
    </div>
  );
}
