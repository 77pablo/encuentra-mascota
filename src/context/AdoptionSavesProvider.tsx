import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  addAdoptionSave,
  listMyAdoptionSaveIds,
  removeAdoptionSave,
} from '../services/adoptionSaves';
import { useAuth } from '../hooks/useAuth';

interface AdoptionSavesState {
  guardadas: Set<string>;
  alternar: (adoptionId: string) => void;
  estaGuardada: (adoptionId: string) => boolean;
  refresh: () => void;
}

const AdoptionSavesContext = createContext<AdoptionSavesState | undefined>(undefined);

// Espeja `FavoritesProvider` (src/hooks/useFavorites.tsx) pero contra la
// tabla paralela `adoption_saves`. Si la tabla no existe todavía (o la
// consulta falla por lo que sea), `guardadas` queda como set vacío: no
// rompe la app, solo no se pinta ningún corazón (degrada).
export function AdoptionSavesProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [guardadas, setGuardadas] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    if (!user) {
      setGuardadas(new Set());
      return;
    }
    listMyAdoptionSaveIds(user.id)
      .then((list) => setGuardadas(new Set(list)))
      .catch((e) => console.error('No se pudieron cargar las adopciones guardadas:', e));
  }, [user]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const estaGuardada = useCallback((adoptionId: string) => guardadas.has(adoptionId), [
    guardadas,
  ]);

  const alternar = useCallback(
    (adoptionId: string) => {
      if (!user) return; // sin sesión no hay dónde guardar
      const yaEsta = guardadas.has(adoptionId);
      // Optimista: actualizamos el set local de inmediato y revertimos si falla.
      setGuardadas((prev) => {
        const next = new Set(prev);
        if (yaEsta) next.delete(adoptionId);
        else next.add(adoptionId);
        return next;
      });
      const accion = yaEsta
        ? removeAdoptionSave(user.id, adoptionId)
        : addAdoptionSave(user.id, adoptionId);
      accion.catch((e) => {
        console.error('No se pudo actualizar la adopción guardada:', e);
        setGuardadas((prev) => {
          const next = new Set(prev);
          if (yaEsta) next.add(adoptionId);
          else next.delete(adoptionId);
          return next;
        });
      });
    },
    [user, guardadas],
  );

  return (
    <AdoptionSavesContext.Provider value={{ guardadas, alternar, estaGuardada, refresh }}>
      {children}
    </AdoptionSavesContext.Provider>
  );
}

export function useAdoptionSaves(): AdoptionSavesState {
  const ctx = useContext(AdoptionSavesContext);
  if (!ctx) throw new Error('useAdoptionSaves debe usarse dentro de <AdoptionSavesProvider>');
  return ctx;
}
