import { useCallback, useEffect, useState } from 'react';
import { getFavorites, getTabLibraryOwner, isLibraryWriteInProgress, toggleFavorite as persistToggle, LIBRARY_CHANGE_EVENT } from '@core/storage';

/** React binding over the localStorage favorites set. */
export function useFavorites() {
  const readView = () => ({ favorites: getFavorites(), owner: getTabLibraryOwner() });
  const [view, setView] = useState(readView);
  const { favorites, owner } = view;

  useEffect(() => {
    const refresh = () => { if (!isLibraryWriteInProgress()) setView(readView()); };
    refresh();
    window.addEventListener(LIBRARY_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(LIBRARY_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const toggle = useCallback(async (key: string) => {
    const nowFavorite = owner === null ? null : await persistToggle(key, owner);
    setView(readView());
    return getTabLibraryOwner() === owner ? nowFavorite : null;
  }, [owner]);

  const has = useCallback((key: string) => favorites.includes(key), [favorites]);

  return { favorites, toggle, has, owner };
}
