import { mensajeDeErrorDb } from '../lib/dbErrors';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import AfichePoster from './AfichePoster';
import { armarAfiche, armarNombreArchivo } from '../lib/afiche';
import { capturarAfiche, entregarAfiche, fotoParaCaptura } from '../lib/aficheImage';
import { Pet } from '../services/pets';
import { Profile } from '../services/profile';

export interface AficheGeneratorProps {
  pet: Pet;
  profile: Profile;
  /** Decisión de la hoja de opciones (AficheOpciones); prendido por defecto. */
  incluirNumero?: boolean;
  onDone: () => void;
  onError: (mensaje: string) => void;
}

export default function AficheGenerator({
  pet,
  profile,
  incluirNumero = true,
  onDone,
  onError,
}: AficheGeneratorProps) {
  const posterRef = useRef<View>(null);
  const disparado = useRef(false);
  const content = useMemo(
    () => armarAfiche(pet, profile, { incluirNumero }),
    [pet, profile, incluirNumero],
  );
  const [foto, setFoto] = useState<string | null | undefined>(undefined); // undefined = resolviendo
  const [fotoLista, setFotoLista] = useState(false); // la imagen cargó o falló → lista para capturar

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
      onError(mensajeDeErrorDb(e));
    }
  }, [pet, onDone, onError]);

  // Dispara la captura cuando el afiche está listo. Sin foto: tras un margen para
  // que asiente el layout. Con foto: cuando la imagen carga o falla (fotoLista),
  // más una red de seguridad por si onLoad/onError nunca disparan.
  useEffect(() => {
    if (foto === undefined) return; // aún resolviendo la foto
    if (!content.foto) {
      const t = setTimeout(capturar, 400);
      return () => clearTimeout(t);
    }
    if (fotoLista) {
      capturar();
      return;
    }
    const t = setTimeout(capturar, 2500); // red de seguridad ante imagen colgada
    return () => clearTimeout(t);
  }, [foto, content.foto, fotoLista, capturar]);

  if (foto === undefined) return null;

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={posterRef} collapsable={false}>
        <AfichePoster
          content={content}
          foto={foto}
          onFotoLoad={content.foto ? () => setFotoLista(true) : undefined}
          onFotoError={content.foto ? () => setFotoLista(true) : undefined}
        />
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
