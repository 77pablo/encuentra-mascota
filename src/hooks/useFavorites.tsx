import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { addFavorite, listMyFavoriteIds, removeFavorite } from '../services/favorites';
import { useAuth } from './useAuth';

interface FavoritesState {
  isFavorite: (petId: string) => boolean;
  toggle: (petId: string) => void;
  refresh: () => void;
}

const FavoritesContext = createContext<FavoritesState | undefined>(undefined);

export function FavoritesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  // Set de pet_id guardados por el usuario. Sin sesión queda vacío (degrada).
  const [ids, setIds] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (!user) {
      setIds(new Set());
      return;
    }
    listMyFavoriteIds(user.id)
      .then((list) => setIds(new Set(list)))
      .catch((e) => console.error('No se pudieron cargar los guardados:', e));
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const isFavorite = useCallback((petId: string) => ids.has(petId), [ids]);

  const toggle = useCallback(
    (petId: string) => {
      if (!user) return; // sin sesión no hay dónde guardar
      const yaEsta = ids.has(petId);
      // Optimista: actualizamos el set local de inmediato y revertimos si falla.
      setIds((prev) => {
        const next = new Set(prev);
        if (yaEsta) next.delete(petId);
        else next.add(petId);
        return next;
      });
      const accion = yaEsta ? removeFavorite(user.id, petId) : addFavorite(user.id, petId);
      accion.catch((e) => {
        console.error('No se pudo actualizar el guardado:', e);
        setIds((prev) => {
          const next = new Set(prev);
          if (yaEsta) next.add(petId);
          else next.delete(petId);
          return next;
        });
      });
    },
    [user, ids],
  );

  return (
    <FavoritesContext.Provider value={{ isFavorite, toggle, refresh }}>
      {children}
    </FavoritesContext.Provider>
  );
}

export function useFavorites(): FavoritesState {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites debe usarse dentro de <FavoritesProvider>');
  return ctx;
}
