import React, { useState } from 'react';
import { FlatList, Modal, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { buscarComunas } from '../lib/comunas';
import { AppText, Input, Screen, Title } from '../ui';
import { colors, spacing } from '../theme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (nombre: string) => void;
  titulo?: string;
}

// Modal buscable para elegir una comuna de las 345. Reusado al publicar, en el
// feed de Comunidad y en el filtro de la Lista.
export default function ComunaPickerModal({ visible, onClose, onSelect, titulo = 'Elegí la comuna' }: Props) {
  const [q, setQ] = useState('');

  const elegir = (nombre: string) => {
    onSelect(nombre);
    setQ('');
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <Screen padded>
        <View style={styles.header}>
          <Title size={20}>{titulo}</Title>
          <TouchableOpacity onPress={onClose} accessibilityLabel="Cerrar">
            <Ionicons name="close" size={24} color={colors.ink} />
          </TouchableOpacity>
        </View>
        <Input
          placeholder="Buscar comuna…"
          value={q}
          onChangeText={setQ}
          icon="search"
          autoCapitalize="none"
        />
        <FlatList
          data={buscarComunas(q)}
          keyExtractor={(c) => c.nombre}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity activeOpacity={0.7} onPress={() => elegir(item.nombre)} style={styles.item}>
              <AppText size={15}>{item.nombre}</AppText>
              <AppText muted size={12}>
                {item.region}
              </AppText>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <AppText muted size={14} style={styles.vacio}>
              No encontramos esa comuna.
            </AppText>
          }
        />
      </Screen>
    </Modal>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    marginTop: spacing.sm,
  },
  item: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  vacio: {
    textAlign: 'center',
    marginTop: spacing.xl,
  },
});
