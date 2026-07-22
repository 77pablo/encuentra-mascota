import React, { useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import TarjetaCompartir from './TarjetaCompartir';
import { compartirTarjeta } from '../lib/compartirTarjeta';
import { Pet } from '../services/pets';

export interface TarjetaGeneradorProps {
  pet: Pet;
  // Se dispara cuando ya se intentó compartir (compartida, descargada,
  // cancelada o con error): la pantalla que lo monta lo usa para desmontarse.
  onFin: () => void;
}

// Contenedor de "Compartir tarjeta" (equivalente a AficheGenerator para el
// afiche): dueño del ref, del montaje off-screen de TarjetaCompartir y de la
// captura + compartir. Antes esto estaba duplicado entero en PetDetailScreen
// y PublishScreen; ahora ambas pantallas solo montan este componente cuando
// quieren ofrecer la tarjeta.
export default function TarjetaGenerador({ pet, onFin }: TarjetaGeneradorProps) {
  const tarjetaRef = useRef<View>(null);

  const onListo = async () => {
    await compartirTarjeta(tarjetaRef.current, pet);
    onFin();
  };

  return (
    <View style={styles.offscreen} pointerEvents="none">
      <View ref={tarjetaRef} collapsable={false}>
        <TarjetaCompartir pet={pet} onListo={onListo} />
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
