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

/** Stable storage/identity key for a chord. */
export function chordKey(rootName: string, typeId: string): string {
  return `${rootName}|${typeId}`;
}
