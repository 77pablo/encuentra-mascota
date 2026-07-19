// Identificador aleatorio de 128 bits en hexadecimal, para nombrar archivos en
// el bucket publico. Antes las fotos se llamaban `Date.now()`, que es
// adivinable: con el user_id (que viaja en cualquier reporte) y el minuto
// aproximado de publicacion quedaban pocos miles de intentos por foto.
//
// Usa `crypto.getRandomValues` cuando existe (navegador y React Native
// moderno). El respaldo con Math.random no es criptografico, pero incluso asi
// deja un espacio de busqueda inabordable para enumerar un bucket, que es lo
// que nos importa aca.
export function idAleatorio(): string {
  const bytes = new Uint8Array(16);
  const cripto = (globalThis as any).crypto;
  if (cripto?.getRandomValues) {
    cripto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
