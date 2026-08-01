import { Linking, Platform, Share } from 'react-native';
import { Pet } from '../services/pets';
import { cuadrillaUrl, petUrl } from './links';
import { ETIQUETA_RECOMPENSA, tieneRecompensa } from './recompensa';

const especieLabel: Record<Pet['especie'], string> = {
  perro: 'perro',
  gato: 'gato',
  otro: 'mascota',
};

// Arma el texto de un reporte listo para compartir por WhatsApp u otra app.
export function buildShareText(pet: Pet): string {
  const base = pet.estado === 'perdida' ? '🔴 PERDIDA' : '🟢 ENCONTRADA';
  // Si el reporte tiene comuna (Tanda 3), se antepone el lugar ("... en Maipú").
  // Los reportes viejos no la tienen: sin comuna el texto queda igual que antes.
  const comuna = pet.comuna?.trim();
  const estado = comuna ? `${base} en ${comuna}` : base;
  const nombre = pet.nombre ? ` "${pet.nombre}"` : '';
  const raza = pet.raza ? ` (${pet.raza})` : '';
  // Sin la cifra: este texto termina reenviado en cadenas de WhatsApp que llegan
  // mucho más lejos que el barrio, y el monto es justo el anzuelo.
  const recompensa = tieneRecompensa(pet.recompensa) ? `\n🎁 ${ETIQUETA_RECOMPENSA}` : '';
  const foto = pet.fotos?.[0] ? `\n${pet.fotos[0]}` : '';
  const url = petUrl(pet.id);
  const link = url ? `\n👉 Ver ficha: ${url}` : '';
  return `${estado}: ${pet.especie}${nombre}${raza}\n${pet.descripcion}${recompensa}${foto}${link}\n\n📲 Compartido desde Encuentra tu Mascota`;
}

// Comparte un reporte: en web abre WhatsApp Web/deep link en una pestaña
// nueva; en nativo prefiere WhatsApp si está instalado y si no cae al panel
// de compartir del sistema operativo.
export async function shareReport(pet: Pet): Promise<void> {
  await compartirTexto(buildShareText(pet));
}

// El reparto a plataforma, que ya usaban los reportes y ahora también la
// invitación a la cuadrilla: en web abre WhatsApp Web/deep link en una pestaña
// nueva; en nativo prefiere WhatsApp si está instalado y si no cae al panel de
// compartir del sistema operativo.
async function compartirTexto(text: string): Promise<void> {
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

// ---------------------------------------------------------------------------
// INVITACIÓN A LA CUADRILLA (Tanda 10)
//
// Este texto es prácticamente la función entera: si el mensaje que llega por
// WhatsApp no dice QUÉ se pide y CUÁNTO cuesta, no se suma nadie. "¿Me ayudás a
// buscarlo?" no se puede contestar, porque no se sabe en qué se está metiendo
// uno. Por eso el mensaje anticipa que son tareas cortas y que se elige una.
//
// Lo que NO dice, a propósito: nada sobre recibir avisos. La cuadrilla no manda
// notificaciones a nadie (no se toca la cola de avisos ni su Edge Function), y
// prometérselo a un vecino que sí quiso ayudar es la forma más rápida de quemar
// su confianza.
// ---------------------------------------------------------------------------
export function buildCuadrillaInviteText(pet: Pet, url: string | null): string {
  const nombre = pet.nombre?.trim();
  const especie = especieLabel[pet.especie];
  const quien = nombre ? `${nombre} (${especie})` : `mi ${especie}`;
  const comuna = pet.comuna?.trim();
  const donde = comuna ? ` en ${comuna}` : '';
  // Sin URL (móvil sin EXPO_PUBLIC_WEB_URL configurada) el mensaje se manda
  // igual, sin el renglón del link: "Sumate acá: null" es peor que nada.
  const link = url ? `\n👉 Sumate acá: ${url}` : '';
  return (
    `Se perdió ${quien}${donde} y estoy organizando la búsqueda por el barrio.\n\n` +
    'Son tareas cortas y concretas: pegar unos carteles, recorrer unas cuadras, ' +
    'preguntar en los negocios. Elegís la que puedas y listo.' +
    link
  );
}

// Comparte la invitación por WhatsApp (o el panel del sistema en nativo).
export async function shareCuadrillaInvite(pet: Pet, token: string): Promise<void> {
  await compartirTexto(buildCuadrillaInviteText(pet, cuadrillaUrl(token)));
}
