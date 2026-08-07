import { Pet } from '../services/pets';
import { Profile } from '../services/profile';
import { petUrl } from './links';
import { tieneRecompensa } from './recompensa';

export interface AficheContent {
  titular: string;
  nombre: string | null;
  subtitulo: string;
  senas: string;
  // Un BOOLEANO, no el texto. El afiche se imprime y se pega en un poste: es la
  // superficie más pública que tenemos. Si acá viviera la cifra, estaría a un
  // `{content.recompensa}` de salir en la calle. Ver src/lib/recompensa.ts.
  hayRecompensa: boolean;
  zonaTexto: string;
  foto: string | null;
  whatsappDigits: string;
  whatsappDisplay: string;
  waLink: string | null;
  url: string;
}

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'Perro',
  gato: 'Gato',
  otro: 'Mascota',
};

// Deja solo los dígitos del teléfono (formato que usa wa.me).
export function normalizarWhatsapp(telefono: string | null | undefined): string {
  return (telefono ?? '').replace(/\D/g, '');
}

// F17: ya no hay ninguna guardia que bloquee generar sin WhatsApp cargado
// (esa pantalla murió en A3). Lo que este booleano decide hoy es el PRESET
// del interruptor "Incluir mi número de WhatsApp" en AficheOpciones: sin
// número, arranca apagado (y sin interruptor visible: ver AficheOpciones.tsx)
// porque no hay nada que incluir.
export function faltaWhatsapp(profile: Pick<Profile, 'telefono'> | null | undefined): boolean {
  return normalizarWhatsapp(profile?.telefono).length === 0;
}

export function armarSubtitulo(pet: Pick<Pet, 'especie' | 'raza'>): string {
  const base = especieLabel[pet.especie];
  return pet.raza ? `${base} · ${pet.raza}` : base;
}

export function armarNombreArchivo(pet: Pick<Pet, 'nombre' | 'especie'>): string {
  const raw = (pet.nombre || especieLabel[pet.especie]).toLowerCase();
  const slug =
    raw
      .normalize('NFD')
      .replace(/[\u0300-\u036F]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mascota';
  return `afiche-${slug}.png`;
}

// El QR es lo primero que se lee: tiene que decir a dónde va y que no hay
// trámite. Es lo que de verdad frena a un vecino: no saber qué le van a pedir.
export const TEXTO_QR = 'Escaneá para ver su ficha y avisar. No hace falta crear cuenta.';

// Respaldo si falta EXPO_PUBLIC_WEB_URL en la app compilada. Es NUESTRO
// dominio de Cloudflare (el mismo ORIGEN_PROD del worker): el respaldo viejo,
// encuentratumascota.app, era un dominio ajeno — quien lo registrara se
// quedaba con los escaneos de cada afiche impreso.
export const RESPALDO_WEB = 'https://encuentras-mascota.pages.dev';

export interface AficheOpciones {
  /** Decisión de Pablo: prendido por defecto; el dueño lo apaga al generar. */
  incluirNumero?: boolean;
}

export function armarAfiche(
  pet: Pet,
  profile: Pick<Profile, 'telefono'> | null,
  opciones: AficheOpciones = {},
): AficheContent {
  const incluirNumero = opciones.incluirNumero ?? true;
  const digits = incluirNumero ? normalizarWhatsapp(profile?.telefono) : '';
  return {
    titular:
      pet.estado === 'perdida'
        ? pet.robada
          ? 'SE BUSCA · ROBADA'
          : 'SE BUSCA'
        : '¿CONOCÉS A ESTA MASCOTA?',
    nombre: pet.nombre || null,
    subtitulo: armarSubtitulo(pet),
    senas: pet.descripcion,
    hayRecompensa: tieneRecompensa(pet.recompensa),
    zonaTexto: 'Visto cerca de esta zona',
    foto: pet.fotos?.[0] ?? null,
    whatsappDigits: digits,
    whatsappDisplay: incluirNumero ? (profile?.telefono ?? '') : '',
    waLink: digits ? `https://wa.me/${digits}` : null,
    url: petUrl(pet.id) ?? `${RESPALDO_WEB}/mascota/${pet.id}`,
  };
}

// Lo que se le pide a la fotocopiadora, listo para copiar/compartir. La
// búsqueda física resuelve el 30-49% de los casos; este texto es la parte
// de la app que trabaja en la calle.
export function textoImprenta(nombre: string | null): string {
  const quien = nombre ? `de ${nombre}` : 'de mi mascota';
  return (
    `Hola, necesito imprimir afiches ${quien}:\n` +
    `· 20 copias tamaño carta, a color.\n` +
    `· En papel fluorescente (amarillo o rosado) si tienen: una hoja blanca no se ve desde un auto.\n` +
    `· 4 ampliaciones a doble carta para las esquinas con más tráfico.\n\n` +
    `Después pegalos a la altura de los ojos: semáforos, paraderos, la entrada del almacén y la feria.`
  );
}
