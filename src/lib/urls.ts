/** Central route helpers so URL conventions never drift across pages. */

export function chordPath(rootName: string, typeId: string): string {
  return `/chords/${encodeURIComponent(rootName)}/${encodeURIComponent(typeId)}`;
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
