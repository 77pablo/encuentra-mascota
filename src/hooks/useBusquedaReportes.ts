import { mensajeDeErrorDb } from '../lib/dbErrors';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buscarReportes,
  Cursor,
  FiltrosBusqueda,
  PetConDistancia,
  TAMANO_PAGINA,
} from '../services/busqueda';

// Búsqueda paginada de reportes contra el servidor.
//
// Se encarga de tres cosas que son fáciles de hacer mal a mano:
//   · reiniciar la lista cuando cambian los filtros (y NO mezclar resultados
//     viejos con nuevos);
//   · pedir la página siguiente una sola vez, aunque la lista dispare varias
//     veces el evento de "llegué al final";
//   · descartar respuestas que llegan tarde. Si el usuario cambia un filtro
//     mientras la consulta anterior viaja, esa respuesta ya no sirve: sin este
//     cuidado, la lista muestra el resultado del filtro anterior.

export interface EstadoBusqueda {
  reportes: PetConDistancia[];
  cargando: boolean; // primera página
  cargandoMas: boolean; // páginas siguientes
  error: string | null;
  hayMas: boolean;
  recargar: () => void;
  cargarMas: () => void;
}

export function useBusquedaReportes(
  filtros: FiltrosBusqueda,
  limite: number = TAMANO_PAGINA,
): EstadoBusqueda {
  const [reportes, setReportes] = useState<PetConDistancia[]>([]);
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
  const clave = JSON.stringify({
    ...filtros,
    desde: filtros.desde ? filtros.desde.toISOString() : null,
  });

  const primeraPagina = useCallback(() => {
    const miPeticion = ++peticionRef.current;
    pidiendoRef.current = true;
    setCargando(true);
    setError(null);
    buscarReportes(filtros, null, limite)
      .then((pagina) => {
        if (miPeticion !== peticionRef.current) return; // llegó tarde
        setReportes(pagina.reportes);
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
    buscarReportes(filtros, cursor, limite)
      .then((pagina) => {
        if (miPeticion !== peticionRef.current) return;
        // Filtramos por id: si dos páginas se solapan (p. ej. alguien publicó
        // justo en el borde), no queremos la misma tarjeta dos veces.
        setReportes((previos) => {
          const vistos = new Set(previos.map((r) => r.id));
          return [...previos, ...pagina.reportes.filter((r) => !vistos.has(r.id))];
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

  return { reportes, cargando, cargandoMas, error, hayMas, recargar: primeraPagina, cargarMas };
}
