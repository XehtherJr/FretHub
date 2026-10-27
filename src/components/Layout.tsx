import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link } from 'react-router-dom';
import SearchModal from './SearchModal';
import ToastHost from './Toast';

const NAV = [
  { to: '/chords', label: 'Chords' },
  { to: '/fretboard', label: 'Fretboard' },
  { to: '/theory', label: 'Theory' },
  { to: '/scales', label: 'Scales' },
  { to: '/progressions', label: 'Progressions' },
  { to: '/practice', label: 'Practice' },
  { to: '/library', label: 'Library' },
];

export default function Layout() {
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === '/' && !typing) {
        e.preventDefault();
        setSearchOpen(true);
      } else if (e.key === 'Escape') {
        setSearchOpen(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <header className="site-header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="Frethub home">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none">
                <circle cx="9" cy="10" r="4.2" stroke="#f0c274" strokeWidth="1.6" />
                <circle cx="16.5" cy="15.5" r="2.6" stroke="#f0c274" strokeWidth="1.6" />
                <path d="M12.4 12.6 15 14.4" stroke="#f0c274" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </span>
            Frethub
          </Link>

          <nav className="main-nav" aria-label="Primary">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <button
              type="button"
              className="search-trigger"
              onClick={() => setSearchOpen(true)}
              aria-label="Open global search"
            >
              <span aria-hidden="true">🔍</span>
              <span className="search-trigger-text">Search chords, scales…</span>
              <kbd>⌘K</kbd>
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        <Outlet />
      </main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div>
            <strong style={{ color: 'var(--cream)' }}>Frethub</strong> — guitar chord encyclopedia
            & music theory platform. All calculations run locally in your browser.
          </div>
          <div>
            <Link to="/chords">Encyclopedia</Link> ·{' '}
            <Link to="/fretboard">Fretboard</Link> ·{' '}
            <Link to="/theory">Theory</Link> ·{' '}
            <Link to="/practice">Practice</Link>
          </div>
        </div>
      </footer>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ToastHost />
    </div>
  );
}
