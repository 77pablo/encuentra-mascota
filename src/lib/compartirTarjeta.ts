import { Platform } from 'react-native';
import { Pet } from '../services/pets';
import { capturarAfiche } from './aficheImage';
import { notify } from './notify';

export type ResultadoCompartir = 'compartida' | 'descargada' | 'error';

// Convierte el data-uri PNG (lo que devuelve `capturarAfiche` en web) a un
// `File`, porque la Web Share API Level 2 exige `files`, no una URL.
function dataUriAFile(dataUri: string, nombre: string): File {
  const [meta, base64] = dataUri.split(',');
  const mime = /data:(.*);base64/.exec(meta)?.[1] ?? 'image/png';
  const binario = atob(base64);
  const bytes = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) bytes[i] = binario.charCodeAt(i);
  return new File([bytes], nombre, { type: mime });
}

function nombreArchivo(pet: Pick<Pet, 'id'>): string {
  return `mascota-${pet.id}.png`;
}

// Captura la tarjeta referenciada (misma rasterización que el afiche, ver
// aficheImage.ts) y la comparte. Wa.me no acepta imágenes, así que este es un
// camino aparte del `shareReport` de texto: en web intenta la Web Share API
// con el archivo (WhatsApp/Instagram lo reciben nativo); si el navegador no
// la soporta, descarga el PNG. En nativo usa expo-sharing.
export async function compartirTarjeta(ref: unknown, pet: Pet): Promise<ResultadoCompartir> {
  try {
    const png = await capturarAfiche(ref);
    const nombre = nombreArchivo(pet);

    if (Platform.OS === 'web') {
      const nav = typeof navigator !== 'undefined' ? (navigator as any) : null;
      if (nav?.share && nav?.canShare) {
        const file = dataUriAFile(png, nombre);
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file], title: 'Encuentra tu Mascota' });
          return 'compartida';
        }
      }
      const a = document.createElement('a');
      a.href = png;
      a.download = nombre;
      document.body.appendChild(a);
      a.click();
      a.remove();
      return 'descargada';
    }

    const Sharing = await import('expo-sharing');
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(png, { mimeType: 'image/png', dialogTitle: 'Compartir tarjeta' });
      return 'compartida';
    }
    return 'descargada';
  } catch (e: any) {
    notify('No se pudo compartir', 'Probá de nuevo en un momento.');
    return 'error';
  }
}
