import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import AfichePoster from './AfichePoster';
import { armarAfiche, armarNombreArchivo } from '../lib/afiche';
import { capturarAfiche, entregarAfiche, fotoParaCaptura } from '../lib/aficheImage';
import { Pet } from '../services/pets';
import { Profile } from '../services/profile';

export interface AficheGeneratorProps {
  pet: Pet;
  profile: Profile;
  onDone: () => void;
  onError: (mensaje: string) => void;
}

export default function AficheGenerator({ pet, profile, onDone, onError }: AficheGeneratorProps) {
  const posterRef = useRef<View>(null);
  const disparado = useRef(false);
  const content = armarAfiche(pet, profile);
  const [foto, setFoto] = useState<string | null | undefined>(undefined); // undefined = resolviendo

  useEffect(() => {
    let vivo = true;
    fotoParaCaptura(content.foto)
      .then((f) => vivo && setFoto(f))
      .catch(() => vivo && setFoto(content.foto));
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const capturar = useCallback(async () => {
    if (disparado.current) return;
    disparado.current = true;
    try {
      const png = await capturarAfiche(posterRef.current);
      await entregarAfiche(png, armarNombreArchivo(pet));
      onDone();
    } catch (e: any) {
      onError(e?.message ?? 'No se pudo crear el afiche.');
    }
  }, [pet, onDone, onError]);

  // Si no hay foto, capturamos poco después de montar; si hay, esperamos su onLoad.
  useEffect(() => {
    if (foto === undefined) return; // aún resolviendo
    if (!content.foto) {
      const t = setTimeout(capturar, 400);
      return () => clearTimeout(t);
    }
  }, [foto, content.foto, capturar]);

  if (foto === undefined) return null;

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={posterRef} collapsable={false}>
        <AfichePoster content={content} foto={foto} onFotoLoad={content.foto ? capturar : undefined} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
    opacity: 0,
  },
});
