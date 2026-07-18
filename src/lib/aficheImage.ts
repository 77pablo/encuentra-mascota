import { Platform } from 'react-native';
import { captureRef } from 'react-native-view-shot';

// En web, capturar un canvas con una imagen de otro origen lo "ensucia" y falla
// la exportación. Bajamos la foto a data-uri (mismo origen) antes de renderizar.
// En nativo, view-shot captura la imagen remota sin problema.
export async function fotoParaCaptura(uri: string | null): Promise<string | null> {
  if (!uri) return null;
  if (Platform.OS !== 'web') return uri;
  try {
    const res = await fetch(uri);
    if (!res.ok) return uri; // 403/404: no ensuciar el afiche con el cuerpo del error, usar la uri remota
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return uri; // si falla, seguimos con la uri remota
  }
}

// Rasteriza el afiche referenciado a PNG. Web → data-uri; nativo → archivo temporal.
export async function capturarAfiche(ref: unknown): Promise<string> {
  return captureRef(ref as never, {
    format: 'png',
    quality: 1,
    result: Platform.OS === 'web' ? 'data-uri' : 'tmpfile',
  });
}

// Entrega el PNG: en web dispara una descarga; en nativo abre la hoja de compartir.
export async function entregarAfiche(pngUri: string, nombreArchivo: string): Promise<void> {
  if (Platform.OS === 'web') {
    const a = document.createElement('a');
    a.href = pngUri;
    a.download = nombreArchivo;
    document.body.appendChild(a);
    a.click();
    a.remove();
    return;
  }
  const Sharing = await import('expo-sharing');
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(pngUri, { mimeType: 'image/png', dialogTitle: 'Compartir afiche' });
  }
}
