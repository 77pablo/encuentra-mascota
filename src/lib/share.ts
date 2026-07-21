import { Linking, Platform, Share } from 'react-native';
import { Pet } from '../services/pets';
import { petUrl } from './links';

// Arma el texto de un reporte listo para compartir por WhatsApp u otra app.
export function buildShareText(pet: Pet): string {
  const base = pet.estado === 'perdida' ? '🔴 PERDIDA' : '🟢 ENCONTRADA';
  // Si el reporte tiene comuna (Tanda 3), se antepone el lugar ("... en Maipú").
  // Los reportes viejos no la tienen: sin comuna el texto queda igual que antes.
  const comuna = pet.comuna?.trim();
  const estado = comuna ? `${base} en ${comuna}` : base;
  const nombre = pet.nombre ? ` "${pet.nombre}"` : '';
  const raza = pet.raza ? ` (${pet.raza})` : '';
  const recompensa = pet.recompensa ? `\n🎁 Recompensa: ${pet.recompensa}` : '';
  const foto = pet.fotos?.[0] ? `\n${pet.fotos[0]}` : '';
  const url = petUrl(pet.id);
  const link = url ? `\n👉 Ver ficha: ${url}` : '';
  return `${estado}: ${pet.especie}${nombre}${raza}\n${pet.descripcion}${recompensa}${foto}${link}\n\n📲 Compartido desde Encuentra tu Mascota`;
}

// Comparte un reporte: en web abre WhatsApp Web/deep link en una pestaña
// nueva; en nativo prefiere WhatsApp si está instalado y si no cae al panel
// de compartir del sistema operativo.
export async function shareReport(pet: Pet): Promise<void> {
  const text = buildShareText(pet);
  const waUrl = `https://wa.me/?text=${encodeURIComponent(text)}`;
  if (Platform.OS === 'web') {
    window.open(waUrl, '_blank');
    return;
  }
  const canWa = await Linking.canOpenURL(waUrl).catch(() => false);
  if (canWa) {
    await Linking.openURL(waUrl);
  } else {
    await Share.share({ message: text });
  }
}
