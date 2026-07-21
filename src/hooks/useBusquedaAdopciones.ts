import { mensajeDeErrorDb } from '../lib/dbErrors';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buscarAdopciones,
  AdopcionConDistancia,
  Cursor,
  FiltrosAdopcion,
  TAMANO_PAGINA,
} from '../services/busquedaAdopciones';

// Búsqueda paginada de adopciones contra el servidor. Espejo de
// `useBusquedaReportes`: ver ahí el porqué de cada cuidado (reiniciar al
// cambiar filtros, no duplicar el pedido de "más", descartar respuestas
// tardías).

export interface EstadoBusquedaAdopciones {
  adopciones: AdopcionConDistancia[];
  cargando: boolean; // primera página
  cargandoMas: boolean; // páginas siguientes
  error: string | null;
  hayMas: boolean;
  recargar: () => void;
  cargarMas: () => void;
}

export function useBusquedaAdopciones(
  filtros: FiltrosAdopcion,
  limite: number = TAMANO_PAGINA,
): EstadoBusquedaAdopciones {
  const [adopciones, setAdopciones] = useState<AdopcionConDistancia[]>([]);
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const [hayMas, setHayMas] = useState(true);
  const [cargando, setCargando] = useState(true);
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Identifica la búsqueda vigente: si vuelve una respuesta de otra, se ignora.
  const peticionRef = useRef(0);
  const pidiendoRef = useRef(false);

  // Serializamos los filtros para no re-disparar la búsqueda cuando el objeto
  // cambia de identidad pero su contenido es el mismo (pasa en cada render).
  const clave = JSON.stringify(filtros);

  const primeraPagina = useCallback(() => {
    const miPeticion = ++peticionRef.current;
    pidiendoRef.current = true;
    setCargando(true);
    setError(null);
    buscarAdopciones(filtros, null, limite)
      .then((pagina) => {
        if (miPeticion !== peticionRef.current) return; // llegó tarde
        setAdopciones(pagina.adopciones);
        setCursor(pagina.cursor);
        setHayMas(pagina.cursor !== null);
      })
      .catch((e: any) => {
        if (miPeticion !== peticionRef.current) return;
        setError(mensajeDeErrorDb(e));
      })
      .finally(() => {
        if (miPeticion !== peticionRef.current) return;
        setCargando(false);
        pidiendoRef.current = false;
      });
    // `filtros` entra por `clave`: ver el comentario de arriba.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, limite]);

  useEffect(primeraPagina, [primeraPagina]);

  const cargarMas = useCallback(() => {
    if (pidiendoRef.current || !hayMas || cursor === null) return;
    const miPeticion = peticionRef.current;
    pidiendoRef.current = true;
    setCargandoMas(true);
    buscarAdopciones(filtros, cursor, limite)
      .then((pagina) => {
        if (miPeticion !== peticionRef.current) return;
        // Filtramos por id: si dos páginas se solapan (p. ej. alguien publicó
        // justo en el borde), no queremos la misma tarjeta dos veces.
        setAdopciones((previas) => {
          const vistas = new Set(previas.map((a) => a.id));
          return [...previas, ...pagina.adopciones.filter((a) => !vistas.has(a.id))];
        });
        setCursor(pagina.cursor);
        setHayMas(pagina.cursor !== null);
      })
      .catch(() => {
        // Un error al pedir "más" no debe borrar lo que el usuario ya está
        // mirando: cortamos la paginación en silencio.
        if (miPeticion === peticionRef.current) setHayMas(false);
      })
      .finally(() => {
        if (miPeticion !== peticionRef.current) return;
        setCargandoMas(false);
        pidiendoRef.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clave, cursor, hayMas, limite]);

  return { adopciones, cargando, cargandoMas, error, hayMas, recargar: primeraPagina, cargarMas };
}
