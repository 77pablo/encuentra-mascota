import React, { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { mensajeDeErrorDb } from '../lib/dbErrors';
import { petSchema } from '../schemas/pet';
import { Pet, updatePet } from '../services/pets';
import { moderarTextoReporte } from '../lib/moderarTexto';
import { notify } from '../lib/notify';
import { AppText, Button, Card, Input, Screen, Title } from '../ui';
import { colors, radius, spacing } from '../theme';

const estadoOptions: { key: Pet['estado']; label: string; color: string }[] = [
  { key: 'perdida', label: 'Perdida', color: colors.lost },
  { key: 'encontrada', label: 'Encontrada', color: colors.found },
];

const especieOptions: { key: Pet['especie']; label: string }[] = [
  { key: 'perro', label: 'Perro' },
  { key: 'gato', label: 'Gato' },
  { key: 'otro', label: 'Otro' },
];

// Edita solo los campos de texto de un reporte (estado, especie, raza,
// nombre, descripción, recompensa). Fotos y ubicación no se editan en esta
// versión: para cambiarlas hay que cerrar el reporte y publicar uno nuevo.
export default function EditPetScreen({ route, navigation }: any) {
  const pet: Pet = route.params.pet;
  const [estado, setEstado] = useState<Pet['estado']>(pet.estado);
  const [especie, setEspecie] = useState<Pet['especie']>(pet.especie);
  const [raza, setRaza] = useState(pet.raza ?? '');
  const [nombre, setNombre] = useState(pet.nombre ?? '');
  const [descripcion, setDescripcion] = useState(pet.descripcion ?? '');
  const [recompensa, setRecompensa] = useState(pet.recompensa ?? '');
  const [saving, setSaving] = useState(false);

  const onSubmit = async () => {
    const parsed = petSchema.safeParse({
      estado,
      especie,
      raza,
      nombre,
      descripcion,
      recompensa,
      lat: pet.lat,
      lng: pet.lng,
    });
    if (!parsed.success) {
      notify('Falta algo', parsed.error.issues[0].message);
      return;
    }
    // Filtro de contenido: editar es el otro camino de escritura del reporte, así
    // que se revisa igual que al publicar (si no, sería el bypass obvio).
    const moderacion = moderarTextoReporte({ nombre, raza, descripcion, recompensa });
    if (!moderacion.ok) {
      notify('Revisá el texto', moderacion.motivo);
      return;
    }
    setSaving(true);
    try {
      await updatePet(pet.id, { estado, especie, raza, nombre, descripcion, recompensa });
      notify('Guardado', 'Tu reporte se actualizó.');
      navigation.goBack();
    } catch (e: any) {
      notify('Error', mensajeDeErrorDb(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen padded>
      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            ¿Qué pasó?
          </Title>
          <View style={styles.chipsRow}>
            {estadoOptions.map((o) => {
              const active = estado === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  activeOpacity={0.8}
                  onPress={() => setEstado(o.key)}
                  style={[
                    styles.chip,
                    active ? { backgroundColor: o.color, borderColor: o.color } : styles.chipInactive,
                  ]}
                >
                  <AppText weight="bold" size={14} color={active ? colors.white : colors.muted}>
                    {o.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>

        <Card style={styles.section}>
          <Title size={16} style={styles.sectionTitle}>
            Sobre la mascota
          </Title>
          <View style={styles.chipsRow}>
            {especieOptions.map((o) => {
              const active = especie === o.key;
              return (
                <TouchableOpacity
                  key={o.key}
                  activeOpacity={0.8}
                  onPress={() => setEspecie(o.key)}
                  style={[styles.chip, active ? styles.chipActiveBrand : styles.chipInactive]}
                >
                  <AppText weight="bold" size={14} color={active ? colors.white : colors.muted}>
                    {o.label}
                  </AppText>
                </TouchableOpacity>
              );
            })}
          </View>

          <Input placeholder="Raza (opcional)" value={raza} onChangeText={setRaza} />
          <Input placeholder="Nombre (opcional)" value={nombre} onChangeText={setNombre} />
          <Input
            placeholder="Señas: color, tamaño, collar…"
            value={descripcion}
            onChangeText={setDescripcion}
            multiline
          />
          <Input placeholder="Recompensa (opcional)" value={recompensa} onChangeText={setRecompensa} />
        </Card>

        <Button
          title="Guardar cambios"
          icon="save"
          onPress={onSubmit}
          disabled={saving}
          loading={saving}
          style={styles.submitButton}
        />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingVertical: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  section: {
    gap: spacing.sm,
  },
  sectionTitle: {
    marginBottom: spacing.xs,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  chipInactive: {
    backgroundColor: colors.card,
    borderColor: colors.line,
  },
  chipActiveBrand: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  submitButton: {
    alignSelf: 'stretch',
    marginTop: spacing.sm,
  },
});
