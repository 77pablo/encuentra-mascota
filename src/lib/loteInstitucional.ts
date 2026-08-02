import type { Ambito } from './radioSugerido';

// CARGA EN LOTE PARA CUENTAS INSTITUCIONALES (tanda 12, migración 0057).
//
// Un refugio con 15 animales no los sube de a uno con el formulario actual: le
// pide 15 veces la misma comuna, el mismo punto del mapa y la misma
// confirmación. Esta es la versión mínima —repetir el formulario conservando lo
// común— y ya cambia el costo de usar la app para ellos.
//
// LO QUE SE LIMPIA IMPORTA MÁS QUE LO QUE SE CONSERVA. Publicar al animal #2
// con la foto del #1 no es una molestia de usabilidad: es un reporte falso con
// la cara de otro perro, en una app cuyo único activo es que la gente le crea.
// Por eso la decisión está acá, en una función pura con tests, y no repartida
// entre quince `setState` de la pantalla.

export interface FormularioReporte {
  // --- común al lote: se conserva ---
  estado: 'perdida' | 'encontrada';
  especie: 'perro' | 'gato' | 'otro';
  comuna: string | null;
  comunaManual: boolean;
  comunasAlcance: string[];
  coords: { lat: number; lng: number };
  // --- de ESE animal: se limpia ---
  ambito: Ambito | null;
  raza: string;
  nombre: string;
  descripcion: string;
  ofreceRecompensa: boolean;
  sena1: string;
  sena2: string;
  fotoUris: string[];
  confirmado: boolean;
  origenMyPet: string | null;
}

/**
 * El formulario para el SIGUIENTE animal del lote. No muta el anterior.
 */
export function siguienteDelLote(prev: FormularioReporte): FormularioReporte {
  return {
    // Lo común. `comunaManual` viaja a propósito: si se reseteara, el efecto
    // que auto-sugiere la comuna desde el pin volvería a pisarla a partir del
    // segundo animal (el refugio elige la comuna donde apareció el animal, con
    // el pin en su sede) y todo saldría publicado en la comuna de la sede.
    estado: prev.estado,
    especie: prev.especie,
    comuna: prev.comuna,
    comunaManual: prev.comunaManual,
    // Copia, no la misma referencia: la pantalla hace `push`/`filter` sobre
    // esta lista y no queremos que toque la del reporte ya publicado.
    comunasAlcance: [...prev.comunasAlcance],
    coords: { ...prev.coords },

    // Lo del animal anterior. Todo a cero.
    ambito: null,
    raza: '',
    nombre: '',
    descripcion: '',
    ofreceRecompensa: false,
    // La seña es la defensa antiestafa de UN animal concreto. Heredada, valida
    // a un impostor que describe la cicatriz del perro anterior.
    sena1: '',
    sena2: '',
    fotoUris: [],
    // El texto de la casilla dice "confirmo que la foto es de la mascota". La
    // foto cambió: la afirmación hay que volver a hacerla.
    confirmado: false,
    // Sin esto el animal #2 queda enganchado a la ficha "Mi mascota" del #1, y
    // el QR del collar del #1 pasa a decir que está perdido otro perro. Es un
    // bug mudo: nada en la pantalla lo muestra.
    origenMyPet: null,
  };
}

export type OfertaPostPublicacion =
  | { tipo: 'lote' }
  | { tipo: 'guia'; destino: 'GuiaPerdida' | 'GuiaEncontrada' };

/**
 * Qué se le ofrece a quien acaba de publicar.
 *
 * La guía de "qué hacer ahora" está escrita para el dueño angustiado de una
 * mascota perdida. A un refugio que va por el animal 7 de 15 no le sirve, y
 * encadenar dos confirms seguidos es la forma más rápida de que cierre la app.
 */
export function ofertaTrasPublicar(o: {
  esInstitucion: boolean;
  estado: 'perdida' | 'encontrada';
}): OfertaPostPublicacion {
  if (o.esInstitucion) return { tipo: 'lote' };
  return { tipo: 'guia', destino: o.estado === 'perdida' ? 'GuiaPerdida' : 'GuiaEncontrada' };
}
