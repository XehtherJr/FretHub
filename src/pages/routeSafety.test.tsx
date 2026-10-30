import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '@/App';

function renderAt(path: string) { return render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>); }

describe('route parameters', () => {
  it.each(['/chords/%25/major', '/chords/C/%25'])('shows an unknown-chord fallback for %s', (path) => {
    renderAt(path);
    expect(screen.getByRole('heading', { name: 'Unknown chord' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to the encyclopedia' })).toBeInTheDocument();
  });
  it('shows the lesson fallback for a percent sign instead of decoding twice', () => {
    renderAt('/theory/%25');
    expect(screen.getByRole('heading', { name: 'Lesson not found' })).toBeInTheDocument();
  });
  it('still decodes valid sharp spellings exactly once', () => {
    renderAt('/chords/C%23/major');
    expect(screen.getByRole('heading', { name: 'C#' })).toBeInTheDocument();
  });
});
