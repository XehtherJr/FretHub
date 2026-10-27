import { useCallback, useEffect, useState } from 'react';
import { getFavorites, toggleFavorite as persistToggle } from '@core/storage';

/** React binding over the localStorage favorites set. */
export function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>([]);

  useEffect(() => {
    setFavorites(getFavorites());
  }, []);

  const toggle = useCallback((key: string) => {
    const nowFavorite = persistToggle(key);
    setFavorites(getFavorites());
    return nowFavorite;
  }, []);

  const has = useCallback((key: string) => favorites.includes(key), [favorites]);

  return { favorites, toggle, has };
}
