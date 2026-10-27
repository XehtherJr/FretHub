import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildEncyclopedia, chordSearchNames, BuiltChord } from '@core/chords';
import { SCALE_TYPES } from '@core/scales';
import { LESSONS } from '@/data/lessons';
import { chordPath, scalePath, lessonPath } from '@/lib/urls';

interface SearchModalProps {
  open: boolean;
  onClose: () => void;
}

interface ResultRow {
  id: string;
  symbol: string;
  title: string;
  meta: string;
  path: string;
  kind: 'Chord' | 'Scale' | 'Lesson' | 'Tool';
}

let encyclopediaCache: BuiltChord[] | null = null;
function encyclopedia(): BuiltChord[] {
  if (!encyclopediaCache) encyclopediaCache = buildEncyclopedia();
  return encyclopediaCache;
}

export default function SearchModal({ open, onClose }: SearchModalProps) {
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQuery('');
      setFocus(0);
      window.setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const results = useMemo<ResultRow[]>(() => {
    const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const rows: ResultRow[] = [];

    if (tokens.length === 0) {
      // Onboarding suggestions when the palette is empty.
      const popular: [string, string][] = [
        ['G', 'major'], ['C', 'major'], ['E', 'minor'], ['A', 'dominant-7'], ['D', 'minor-7'],
      ];
      for (const [root, typeId] of popular) {
        const chord = encyclopedia().find((c) => c.rootName === root && c.typeId === typeId);
        if (!chord) continue;
        rows.push({
          id: `chord-${chord.rootName}-${chord.typeId}`,
          symbol: chord.shortName,
          title: chord.fullName,
          meta: `${chord.tones.map((t) => t.name).join(' · ')} — formula ${chord.formula.join(' ')}`,
          path: chordPath(chord.rootName, chord.typeId),
          kind: 'Chord',
        });
      }
      return rows;
    }

    for (const tool of [
      { id: 'tuner', title: 'Guitar tuner', meta: 'Tune by microphone or reference note', path: '/tuner' },
      { id: 'metronome', title: 'Metronome', meta: 'Steady, timing coach and disappearing click', path: '/metronome' },
    ]) {
      if (tokens.every((token) => `${tool.title} ${tool.meta}`.toLowerCase().includes(token))) {
        rows.push({ ...tool, symbol: 'Tool', kind: 'Tool' });
      }
    }

    const chordRows: ResultRow[] = [];
    for (const chord of encyclopedia()) {
      const haystack = [
        chord.shortName.toLowerCase(),
        chord.fullName.toLowerCase(),
        chord.typeName.toLowerCase(),
        ...chordSearchNames(chord),
      ].join(' § ');
      if (tokens.every((t) => haystack.includes(t))) {
        chordRows.push({
          id: `chord-${chord.rootName}-${chord.typeId}`,
          symbol: chord.shortName,
          title: chord.fullName,
          meta: `${chord.tones.map((t) => t.name).join(' · ')} — formula ${chord.formula.join(' ')}`,
          path: chordPath(chord.rootName, chord.typeId),
          kind: 'Chord',
        });
      }
      if (chordRows.length >= 12) break;
    }
    rows.push(...chordRows);

    for (const scale of SCALE_TYPES) {
      const haystack = `${scale.name} ${scale.id} ${scale.category} ${scale.intervals.join(' ')}`.toLowerCase();
      if (tokens.every((t) => haystack.includes(t))) {
        rows.push({
          id: `scale-${scale.id}`,
          symbol: scale.name.split(' ')[0],
          title: scale.name,
          meta: `${scale.stepFormula} — ${scale.category}`,
          path: scalePath(scale.id),
          kind: 'Scale',
        });
      }
    }

    for (const lesson of LESSONS) {
      const haystack = `${lesson.title} ${lesson.summary} ${levelText(lesson.level)}`.toLowerCase();
      if (tokens.every((t) => haystack.includes(t))) {
        rows.push({
          id: `lesson-${lesson.id}`,
          symbol: 'Theory',
          title: lesson.title,
          meta: `${levelText(lesson.level)} · ~${lesson.minutes} min`,
          path: lessonPath(lesson.id),
          kind: 'Lesson',
        });
      }
    }

    return rows.slice(0, 24);
  }, [query]);

  useEffect(() => setFocus(0), [query]);

  if (!open) return null;

  const go = (row: ResultRow) => {
    navigate(row.path);
    onClose();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setFocus((f) => Math.min(f + 1, results.length - 1));
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setFocus((f) => Math.max(f - 1, 0));
    }
    if (e.key === 'Enter' && results[focus]) go(results[focus]);
  };

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Global search">
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <input
          ref={inputRef}
          type="search"
          placeholder="Search chords (Cmaj7, G7b9), notes (C E G), formulas (1 b3 5), scales, lessons…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          aria-label="Search the encyclopedia"
        />
        <div className="modal-results">
          {results.length === 0 && (
            <p className="muted small" style={{ padding: '1rem' }}>
              No matches. Try a chord symbol (<code>Cm7</code>), a note set (<code>G B D F</code>),
              a formula (<code>1 3 5 b7</code>) or a scale name.
            </p>
          )}
          {results.map((row, i) => (
            <button
              key={row.id}
              type="button"
              className={`search-result ${i === focus ? 'focused' : ''}`}
              onMouseEnter={() => setFocus(i)}
              onClick={() => go(row)}
            >
              <span className="symbol">{row.symbol}</span>
              <span>
                <strong>{row.title}</strong>
                <span className="meta" style={{ display: 'block' }}>{row.meta}</span>
              </span>
              <span className="pill" style={{ marginLeft: 'auto' }}>{row.kind}</span>
            </button>
          ))}
        </div>
        <div className="search-hint">
          <kbd>↑</kbd> <kbd>↓</kbd> navigate · <kbd>Enter</kbd> open · <kbd>Esc</kbd> close
        </div>
      </div>
    </div>
  );
}

function levelText(level: string): string {
  return level === 'beginner' ? 'beginner' : level === 'intermediate' ? 'intermediate' : 'advanced';
}
