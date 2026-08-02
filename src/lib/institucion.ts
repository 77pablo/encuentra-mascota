// CUENTAS INSTITUCIONALES — veterinarias, refugios y municipios (migración 0057).
//
// Por qué existe: el competidor real en Chile no es otra app de mascotas, es
// SOSAFE (2,5 M de usuarios, convenios con ~27 comunas). En densidad no les
// ganamos. Lo que sí podemos ser es la infraestructura que las instituciones
// adoptan porque es gratis y lo suyo está abandonado — la página "Mascotas
// Perdidas" de la Municipalidad de Santiago tiene 21 avisos, el último de
// febrero de 2024.
//
// ESTE ARCHIVO ES EL PORTERO DE LA INSIGNIA. Una insignia que dice
// "verificada" sin que nadie haya verificado nada es peor que no tener
// insignia: es la app poniéndole su firma a un desconocido. Por eso el único
// dato que la enciende es `institucion_verificada_en`, que solo puede escribir
// un admin (RPC `institucion_otorgar`, security definer, 0057). El usuario NO
// tiene permiso de escritura sobre ninguna columna `institucion_*` (el
// `revoke update` de la 0057 le deja solo nombre/foto/teléfono/red social).

export type TipoInstitucion = 'veterinaria' | 'refugio' | 'municipio';

// Los mismos tres valores del `check` de la 0057. Si acá y allá se
// desincronizan, la app dibuja algo que la base rechaza (o al revés).
export const TIPOS_INSTITUCION: TipoInstitucion[] = ['veterinaria', 'refugio', 'municipio'];

export interface Institucion {
  tipo: TipoInstitucion;
  nombre: string;
  comuna: string | null;
  contacto: string | null;
}

const ETIQUETAS: Record<TipoInstitucion, string> = {
  veterinaria: 'Veterinaria',
  refugio: 'Refugio',
  municipio: 'Municipalidad',
};

// El género importa. "Refugio verificada" en la ficha de un refugio es de esas
// cosas chicas que hacen que una institución no confíe en la herramienta.
const VERIFICADA: Record<TipoInstitucion, string> = {
  veterinaria: 'Veterinaria verificada',
  refugio: 'Refugio verificado',
  municipio: 'Municipalidad verificada',
};

// Íconos de línea (Ionicons), nunca emojis: la insignia tiene que ser sobria.
// Es un sello de confianza, no un cartel.
const ICONOS: Record<TipoInstitucion, string> = {
  veterinaria: 'medkit-outline',
  refugio: 'home-outline',
  municipio: 'business-outline',
};

function esTipo(v: unknown): v is TipoInstitucion {
  return typeof v === 'string' && (TIPOS_INSTITUCION as string[]).includes(v);
}

export function etiquetaInstitucion(tipo: TipoInstitucion): string {
  return ETIQUETAS[tipo] ?? 'Institución';
}

export function etiquetaVerificada(tipo: TipoInstitucion): string {
  return VERIFICADA[tipo] ?? 'Institución verificada';
}

export function iconoInstitucion(tipo: TipoInstitucion): string {
  return ICONOS[tipo] ?? 'business-outline';
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * Traduce una fila de `profiles` (o de `perfil_publico` / `mi_perfil`) a la
 * institución que hay que mostrar, o `null` si no hay ninguna que mostrar.
 *
 * FALLA CERRADO en los tres frentes:
 *   · sin `institucion_verificada_en` no hay insignia (aunque el resto esté);
 *   · un `tipo` fuera de la lista no dibuja una etiqueta que no controlamos;
 *   · sin nombre público la insignia no diría nada.
 *
 * Y tolera que la 0057 no esté aplicada: en esa ventana la fila no trae
 * ninguna de estas claves y esto devuelve null sin romper nada.
 */
export function institucionDe(fila: any): Institucion | null {
  if (!fila || typeof fila !== 'object') return null;
  if (!texto(fila.institucion_verificada_en)) return null;
  const tipo = fila.institucion_tipo;
  if (!esTipo(tipo)) return null;
  const nombre = texto(fila.institucion_nombre);
  if (!nombre) return null;
  return {
    tipo,
    nombre,
    comuna: texto(fila.institucion_comuna) || null,
    contacto: texto(fila.institucion_contacto) || null,
  };
}
