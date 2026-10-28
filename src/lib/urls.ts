/** Central route helpers so URL conventions never drift across pages. */

import { TUNINGS } from '@core/tunings';

export interface InstrumentContext { tuning?: string; capo?: number; }

/** Validate optional shareable instrument settings rather than trusting URL input. */
export function instrumentFromSearch(params: URLSearchParams): { tuning: string; capo: number } {
  const tuning = params.get('tuning');
  const capo = Number(params.get('capo'));
  return {
    tuning: TUNINGS.some((item) => item.id === tuning) ? tuning! : 'standard',
    capo: Number.isInteger(capo) && capo >= 0 && capo <= 7 ? capo : 0,
  };
}

function addInstrument(params: URLSearchParams, instrument?: InstrumentContext): void {
  if (instrument?.tuning && instrument.tuning !== 'standard') params.set('tuning', instrument.tuning);
  if (instrument?.capo && Number.isInteger(instrument.capo) && instrument.capo > 0 && instrument.capo <= 7) params.set('capo', String(instrument.capo));
}

export function chordPath(rootName: string, typeId: string, bassName?: string, instrument?: InstrumentContext): string {
  const path = `/chords/${encodeURIComponent(rootName)}/${encodeURIComponent(typeId)}`;
  const params = new URLSearchParams();
  if (bassName) params.set('bass', bassName);
  addInstrument(params, instrument);
  return params.toString() ? `${path}?${params.toString()}` : path;
}

/** Open a chord on the physical fretboard, retaining bass and instrument settings. */
export function fretboardChordPath(rootName: string, typeId: string, bassName?: string, instrument?: InstrumentContext): string {
  const params = new URLSearchParams({ chord: `${rootName}|${typeId}` });
  if (bassName) params.set('bass', bassName);
  addInstrument(params, instrument);
  return `/fretboard?${params.toString()}`;
}

export function scalePath(scaleId: string, root?: string): string {
  const params = root ? `?root=${encodeURIComponent(root)}` : '';
  return `/scales/${encodeURIComponent(scaleId)}${params}`;
}

export function lessonPath(lessonId: string): string {
  return `/theory/${encodeURIComponent(lessonId)}`;
}

/** A shareable entry into the relationship study, preserving musical context. */
export function triadStudyPath(root?: string, quality?: string, scale?: string, instrument?: { tuning?: string; capo?: number; frets?: number }): string {
  const params = new URLSearchParams();
  if (root) params.set('root', root);
  if (quality) params.set('quality', quality);
  if (scale) params.set('scale', scale);
  if (instrument?.tuning) params.set('tuning', instrument.tuning);
  if (instrument?.capo) params.set('capo', String(instrument.capo));
  if (instrument?.frets) params.set('frets', String(instrument.frets));
  const query = params.toString();
  return `/theory/triads/explore${query ? `?${query}` : ''}`;
}

/** Stable storage/identity key for a chord. */
export function chordKey(rootName: string, typeId: string): string {
  return `${rootName}|${typeId}`;
}
