import React, { useEffect, useState } from 'react';
import { Image, StyleSheet } from 'react-native';
import { supabase } from '../lib/supabase';

// Baja la foto privada del aviso anónimo con una URL firmada de corta vida
// (D5, sobre el bucket `avisos-anonimos` de la 0062). Solo el dueño del pet
// pasa la policy de SELECT del bucket: para cualquier otro, `createSignedUrl`
// falla, y el componente simplemente no dibuja nada.
//
// DOS FORMAS DE FALLAR, LAS DOS SIN CRASH Y LAS DOS AVISADAS:
//   1. `createSignedUrl` puede fallar (sin permiso, path raro).
//   2. La URL firmada puede resolver bien y la IMAGEN igual no cargar: la
//      Edge Function `aviso-anonimo-foto` sube la foto DESPUÉS de registrar
//      el aviso, y esa subida puede fallar (documentado ahí) — en ese caso
//      `datos.foto` apunta a un objeto que nunca existió en el bucket.
// Ninguno de los dos casos es un bug: son el costo aceptado de "el aviso no
// se pierde aunque la foto no llegue". Por eso no hay ningún `.catch(() => {})`
// acá: un error mudo fue justo lo que escondió semanas que `send-push` nunca
// se había desplegado (ver `__tests__/lib/sinCatchMudos.test.ts`).
export default function FotoAvisoAnonimo({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [rota, setRota] = useState(false);

  useEffect(() => {
    let vivo = true;
    setUrl(null);
    setRota(false);
    supabase.storage
      .from('avisos-anonimos')
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!vivo) return;
        if (error) {
          console.warn('No se pudo firmar la foto del aviso anónimo:', error.message);
          return;
        }
        if (data?.signedUrl) setUrl(data.signedUrl);
      })
      .catch((e: any) => {
        if (!vivo) return;
        console.warn('No se pudo pedir la foto del aviso anónimo:', e?.message ?? e);
      });
    return () => {
      vivo = false;
    };
  }, [path]);

  if (!url || rota) return null;

  return (
    <Image
      source={{ uri: url }}
      style={styles.foto}
      resizeMode="cover"
      accessibilityLabel="Foto que mandó quien avisó"
      // La subida a Storage puede haber fallado aunque la URL firmó bien (ver
      // el comentario de arriba): si la imagen no carga, se oculta en vez de
      // dejar un ícono roto en la bandeja del dueño.
      onError={() => setRota(true)}
    />
  );
}

const styles = StyleSheet.create({
  foto: { width: '100%', height: 180, borderRadius: 8, marginTop: 8 },
});
