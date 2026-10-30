import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import LibraryPage from './LibraryPage';

beforeEach(() => localStorage.clear());

describe('library record isolation', () => {
  it('shows valid chords while retaining invalid favorite, note, recent and progression records', () => {
    const favorites = ['H|major', 'C|major', 'C|not-a-type'];
    const notes = { 'H|major': 'Keep this unknown note', 'C|major': 'A useful note' };
    const recents = [
      { key: 'H|major', rootName: 'H', typeId: 'major', shortName: 'H', viewedAt: 10 },
      { key: 'C|major', rootName: 'C', typeId: 'major', shortName: 'C', viewedAt: 20 },
    ];
    const progressions = [{ id: 'future', name: 'Unknown', chords: [{ future: true }] }];
    for (const [key, value] of Object.entries({ favorites, notes, recents, progressions })) localStorage.setItem(`frethub:${key}`, JSON.stringify(value));
    render(<MemoryRouter><LibraryPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Your library, your way' })).toBeInTheDocument();
    expect(screen.getByText('A useful note')).toBeInTheDocument();
    expect(screen.getByText(/some saved chord records could not be displayed/i)).toBeInTheDocument();
    for (const [key, value] of Object.entries({ favorites, notes, recents, progressions })) expect(JSON.parse(localStorage.getItem(`frethub:${key}`)!)).toEqual(value);
  });

  it('does not crash or rewrite malformed collection containers', () => {
    localStorage.setItem('frethub:favorites', JSON.stringify({ future: true }));
    localStorage.setItem('frethub:notes', JSON.stringify([1, 2]));
    localStorage.setItem('frethub:recents', JSON.stringify('future format'));
    render(<MemoryRouter><LibraryPage /></MemoryRouter>);
    expect(screen.getByRole('heading', { name: 'Your library, your way' })).toBeInTheDocument();
    expect(screen.getByText(/unsupported or damaged library data/i)).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem('frethub:favorites')!)).toEqual({ future: true });
    expect(JSON.parse(localStorage.getItem('frethub:recents')!)).toBe('future format');
  });
});
