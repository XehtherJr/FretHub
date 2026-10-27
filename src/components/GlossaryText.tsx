import { Fragment, useState } from 'react';

const TERMS: { pattern: string; meaning: string }[] = [
  { pattern: 'enharmonic equivalents?', meaning: 'Two names for the same sounding pitch, like C sharp and D flat.' },
  { pattern: 'pitch classes?', meaning: 'All notes with the same letter and accidental, regardless of how high or low they sound.' },
  { pattern: 'key signatures?', meaning: 'The sharps or flats written at the start of music to show its usual notes.' },
  { pattern: 'whole (?:tones?|steps?)', meaning: 'A distance of two frets on one guitar string; also called a whole step.' },
  { pattern: 'half steps?', meaning: 'The distance from one fret to the next; also called a semitone.' },
  { pattern: 'semitones?', meaning: 'The distance from one fret to the next on the same string; also called a half step.' },
  { pattern: 'frets?', meaning: 'The metal strips on the neck; a fret position is the space just behind one.' },
  { pattern: 'octaves?', meaning: 'The distance between a note and the next higher or lower note with the same name: 12 frets apart.' },
  { pattern: 'intervals?', meaning: 'The distance between two notes, measured by their names and by the number of half steps.' },
  { pattern: 'triads?', meaning: 'Three-note chords made from a root, a third and a fifth.' },
  { pattern: 'arpeggios?', meaning: 'The notes of a chord played one after another rather than together.' },
  { pattern: 'tonic', meaning: 'The home note or home chord that a key feels centered around.' },
  { pattern: 'diatonic', meaning: 'Made using the notes of a particular scale or key.' },
  { pattern: 'chromatic', meaning: 'Using all twelve notes, one half step apart, rather than only the notes in one key.' },
  { pattern: 'inversions?', meaning: 'Chord arrangements where a note other than the root is the lowest sounding note.' },
  { pattern: 'cadences?', meaning: 'A short chord movement that gives a phrase a sense of arrival or pause.' },
  { pattern: 'dominant', meaning: 'The fifth note or chord of a key; it often creates a pull back to the home chord.' },
  { pattern: 'root', meaning: 'The note a chord or scale is named after and built around.' },
  { pattern: 'pitch', meaning: 'How high or low a sound is.' },
];
const MATCHER = new RegExp(`\\b(${TERMS.map((term) => term.pattern).join('|')})\\b`, 'gi');

function InlineTerm({ word, meaning }: { word: string; meaning: string }) {
  const [open, setOpen] = useState(false);
  return <span className="inline-term"><button type="button" aria-expanded={open} onClick={() => setOpen((value) => !value)}>{word}</button>{open && <span className="inline-definition"> ({meaning}) </span>}</span>;
}

/** A keyboard-accessible, in-context glossary; definitions open where read. */
export default function GlossaryText({ text }: { text: string }) {
  const chunks = text.split(MATCHER);
  return <>{chunks.map((chunk, index) => {
    const term = TERMS.find((entry) => new RegExp(`^(?:${entry.pattern})$`, 'i').test(chunk));
    return term ? <InlineTerm key={`${index}-${chunk}`} word={chunk} meaning={term.meaning} /> : <Fragment key={index}>{chunk}</Fragment>;
  })}</>;
}
