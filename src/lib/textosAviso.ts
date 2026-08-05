// Textos de aviso compartidos entre la bandeja in-app y el push/correo.
//
// Deuda tanda 13 (D2 · Step 2): `avisosBandeja.ts` y `notifyTargets.ts` traían
// cada uno su propia cadena a mano para el mismo evento ("Entró una denuncia"
// vs "Entró una denuncia nueva"), y coincidían por casualidad. Una sola
// constante en un módulo aparte hace que coincidan porque es imposible que no
// coincidan.

export const TITULO_DENUNCIA_NUEVA = 'Entró una denuncia nueva';
