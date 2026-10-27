import { useCallback, useEffect, useState } from 'react';
import { getFavorites, toggleFavorite as persistToggle, LIBRARY_CHANGE_EVENT } from '@core/storage';

/** React binding over the localStorage favorites set. */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    const refresh = () => setFavorites(getFavorites());
    refresh();
    window.addEventListener(LIBRARY_CHANGE_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(LIBRARY_CHANGE_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);

  const toggle = useCallback((key: string) => {
    const nowFavorite = persistToggle(key);
    setFavorites(getFavorites());
    return nowFavorite;
  }, []);

  const has = useCallback((key: string) => favorites.includes(key), [favorites]);

  return { favorites, toggle, has };
}
