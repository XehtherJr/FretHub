import { useEffect, useState } from 'react';
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom';
import SearchModal from './SearchModal';
import ToastHost from './Toast';
import Icon from './Icon';

const NAV = [
  { to: '/fretboard', label: 'Fretboard' },
  { to: '/chords', label: 'Chords' },
  { to: '/scales', label: 'Scales' },
  { to: '/progressions', label: 'Progressions' },
  { to: '/theory', label: 'Theory' },
  { to: '/practice', label: 'Practice' },
  { to: '/tuner', label: 'Tuner' },
  { to: '/metronome', label: 'Metronome' },
];

export default function Layout() {
  const [searchOpen, setSearchOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location.pathname]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === '/' && !typing) {
        event.preventDefault();
        setSearchOpen(true);
      } else if (event.key === 'Escape') {
        setSearchOpen(false);
        setMenuOpen(false);
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
          <Link to="/" className="brand" aria-label="FretHub home">
            <span className="brand-mark" aria-hidden="true">
              <svg viewBox="0 0 32 32" fill="none">
                <path d="M6 7h20M6 16h20M6 25h20M10 5v22M16 5v22M22 5v22" stroke="currentColor" strokeWidth="1.15" />
                <circle cx="16" cy="11.5" r="3.1" fill="currentColor" />
              </svg>
            </span>
            <span>Fret<span className="brand-accent">Hub</span></span>
          </Link>

          <nav className={`main-nav ${menuOpen ? 'is-open' : ''}`} aria-label="Primary">
            {NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => isActive ? 'active' : ''}>
                {item.label}
              </NavLink>
            ))}
            <NavLink to="/library" className={({ isActive }) => `mobile-library ${isActive ? 'active' : ''}`}>Library</NavLink>
          </nav>

          <div className="header-actions">
            <button type="button" className="search-trigger" onClick={() => setSearchOpen(true)} aria-label="Search ⌘ K — Open global search">
              <Icon name="search" /><span className="search-trigger-text">Search</span><kbd aria-hidden="true">⌘ K</kbd>
            </button>
            <NavLink to="/library" className={({ isActive }) => `library-link ${isActive ? 'active' : ''}`}>Library</NavLink>
            <button type="button" className="mobile-menu-button" aria-label={menuOpen ? 'Close navigation' : 'Open navigation'} aria-expanded={menuOpen} onClick={() => setMenuOpen((value) => !value)}>
              <Icon name={menuOpen ? 'close' : 'menu'} />
            </button>
          </div>
        </div>
      </header>

      <main id="main-content"><Outlet /></main>

      <footer className="site-footer">
        <div className="footer-inner">
          <div><strong>FretHub</strong><span> A little more understanding, every time you play.</span></div>
          <div className="footer-links"><Link to="/fretboard">Fretboard</Link><Link to="/chords">Chords</Link><Link to="/theory">Theory</Link><Link to="/practice">Practice</Link><Link to="/tuner">Tuner</Link><Link to="/metronome">Metronome</Link></div>
          <span className="footer-note">MADE FOR THE CURIOUS GUITARIST</span>
        </div>
      </footer>

      <SearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ToastHost />
    </div>
  );
}
