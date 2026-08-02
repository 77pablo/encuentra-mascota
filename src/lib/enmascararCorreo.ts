// Tu propio correo, en tu propio Perfil, tapado por defecto (spec 0.c): la
// pantalla se muestra en público más de lo que uno cree (mostrarle el reporte
// a un vecino, prestar el teléfono). Un toque lo revela.
export function enmascararCorreo(correo: string | null | undefined): string {
  const c = (correo ?? '').trim();
  const arroba = c.indexOf('@');
  if (arroba <= 0) return c;
  return `${c[0]}***${c.slice(arroba)}`;
}
