// LA SEÑA SECRETA DE VERIFICACIÓN.
//
// Una o dos señas particulares que NO se publican en ningún lado: una cicatriz en
// la panza, la oreja izquierda mordida, que se sienta cuando le decís "cama". La
// gracia es exactamente esa: no están en el aviso, así que quien llama diciendo
// "la tengo" solo las puede describir si de verdad tiene al animal enfrente.
//
// El FBI, la BBB y varias policías estatales tienen alertas activas por estafas
// con mascotas perdidas —incluida la variante con fotos generadas por IA, que
// vuelve inútil el "mandame una foto"—. Contra una foto falsa, la seña sigue
// funcionando: el que la generó con IA no sabe de qué lado está la cicatriz.
//
// Acá vive solo la parte pura. Que la seña no se filtre es asunto de la migración
// 0047 (tabla aparte, RLS del dueño) y del guardián
// `__tests__/db/senasPrivadas.test.ts`.

// Tope por seña. Coincide con el CHECK de la migración 0047: si acá dejáramos
// pasar algo más largo, el error volvería de la base como jerga de Postgres.
export const MAX_SENA = 200;

export interface SenasPrivadas {
  sena1: string | null;
  sena2: string | null;
}

export type ResultadoSenas = { ok: true } | { ok: false; motivo: string };

// Limpia lo que se escribió y lo COMPACTA: si solo se llenó la segunda casilla,
// pasa a ser la primera. Sin esto quedaría una fila con `sena1` en null y `sena2`
// con texto, y toda la UI tendría que andar preguntando cuál de las dos existe.
export function normalizarSenas(
  sena1: string | null | undefined,
  sena2: string | null | undefined,
): SenasPrivadas {
  const limpias = [sena1, sena2]
    .map((s) => (s ?? '').trim())
    .filter((s) => s.length > 0);
  return { sena1: limpias[0] ?? null, sena2: limpias[1] ?? null };
}

// Las señas que existen, en orden, listas para dibujar.
export function listaDeSenas(senas: SenasPrivadas | null | undefined): string[] {
  if (!senas) return [];
  return [senas.sena1, senas.sena2].filter((s): s is string => !!s && s.trim().length > 0);
}

export function validarSenas(
  sena1: string | null | undefined,
  sena2: string | null | undefined,
): ResultadoSenas {
  for (const s of [sena1, sena2]) {
    if ((s ?? '').trim().length > MAX_SENA) {
      return {
        ok: false,
        motivo: `Cada seña tiene que entrar en ${MAX_SENA} caracteres. Con una frase corta alcanza.`,
      };
    }
  }
  return { ok: true };
}
