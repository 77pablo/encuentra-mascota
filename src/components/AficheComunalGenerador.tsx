import React, { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import AficheComunal from './AficheComunal';
import { capturarAfiche, entregarAfiche } from '../lib/aficheImage';
import { mensajeDeErrorDb } from '../lib/dbErrors';

export interface AficheComunalGeneradorProps {
  onDone: () => void;
  onError: (mensaje: string) => void;
}

// Render offscreen + captura, como AficheGenerator pero sin foto remota:
// alcanza el margen fijo para que asiente el layout antes de capturar.
export default function AficheComunalGenerador({ onDone, onError }: AficheComunalGeneradorProps) {
  const ref = useRef<View>(null);
  const disparado = useRef(false);

  useEffect(() => {
    const t = setTimeout(async () => {
      if (disparado.current) return;
      disparado.current = true;
      try {
        const png = await capturarAfiche(ref.current);
        await entregarAfiche(png, 'trae-la-app-a-tu-comuna.png');
        onDone();
      } catch (e: any) {
        onError(mensajeDeErrorDb(e));
      }
    }, 400);
    return () => clearTimeout(t);
  }, [onDone, onError]);

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={ref} collapsable={false}>
        <AficheComunal />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  offscreen: { position: 'absolute', left: -10000, top: 0, opacity: 0 },
});
