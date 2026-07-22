import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import TarjetaCompartir from './TarjetaCompartir';
import { compartirTarjeta } from '../lib/compartirTarjeta';
import { DatosTarjeta } from '../lib/tarjeta';

export interface TarjetaGeneradorProps {
  datos: DatosTarjeta;
  // Se dispara cuando ya se intentó compartir (compartida, descargada,
  // cancelada o con error): la pantalla que lo monta lo usa para desmontarse.
  onFin: () => void;
}

// Contenedor de "Compartir tarjeta" (equivalente a AficheGenerator para el
// afiche): dueño del ref, del montaje off-screen de TarjetaCompartir y de la
// captura + compartir. Antes esto estaba duplicado entero en PetDetailScreen
// y PublishScreen; ahora las pantallas (reporte, adopción, final feliz) solo
// arman el `DatosTarjeta` correspondiente y montan este componente.
export default function TarjetaGenerador({ datos, onFin }: TarjetaGeneradorProps) {
  const tarjetaRef = useRef<View>(null);

  const onListo = async () => {
    await compartirTarjeta(tarjetaRef.current, datos);
    onFin();
  };

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={tarjetaRef} collapsable={false}>
        <TarjetaCompartir datos={datos} onListo={onListo} />
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
