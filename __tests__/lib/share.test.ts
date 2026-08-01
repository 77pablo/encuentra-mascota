import { buildShareText, buildCuadrillaInviteText } from '../../src/lib/share';
import { Pet } from '../../src/services/pets';

function pet(over: Partial<Pet>): Pet {
  return {
    id: 'pet-1',
    user_id: 'u',
    estado: 'perdida',
    especie: 'perro',
    raza: null,
    nombre: null,
    descripcion: 'Manchas negras, collar rojo',
    fotos: [],
    lat: -33.45,
    lng: -70.66,
    recompensa: null,
    activo: true,
    oculto: false,
    creado_en: '2026-07-01T00:00:00Z',
    ...over,
  };
}

describe('buildShareText — comuna', () => {
  it('incluye "en <comuna>" cuando el reporte perdido tiene comuna', () => {
    const texto = buildShareText(pet({ estado: 'perdida', comuna: 'Maipú' }));
    expect(texto).toContain('🔴 PERDIDA en Maipú:');
  });

  it('incluye "en <comuna>" cuando el reporte encontrado tiene comuna', () => {
    const texto = buildShareText(pet({ estado: 'encontrada', comuna: 'Ñuñoa' }));
    expect(texto).toContain('🟢 ENCONTRADA en Ñuñoa:');
  });

  it('recorta los espacios de la comuna', () => {
    const texto = buildShareText(pet({ estado: 'perdida', comuna: '  Providencia  ' }));
    expect(texto).toContain('🔴 PERDIDA en Providencia:');
  });

  // Reportes viejos (anteriores a la Tanda 3) o sin comuna: el texto queda
  // EXACTAMENTE como antes, sin el " en ...".
  it('omite el lugar cuando comuna es null (perdida) — igual que antes', () => {
    const texto = buildShareText(pet({ estado: 'perdida', comuna: null }));
    expect(texto).toContain('🔴 PERDIDA:');
    expect(texto).not.toContain(' en ');
  });

  it('omite el lugar cuando comuna es undefined (encontrada) — igual que antes', () => {
    const texto = buildShareText(pet({ estado: 'encontrada', comuna: undefined }));
    expect(texto).toContain('🟢 ENCONTRADA:');
    expect(texto).not.toContain(' en ');
  });

  it('omite el lugar cuando comuna es cadena vacía o solo espacios', () => {
    expect(buildShareText(pet({ estado: 'perdida', comuna: '' }))).toContain('🔴 PERDIDA:');
    expect(buildShareText(pet({ estado: 'perdida', comuna: '   ' }))).toContain('🔴 PERDIDA:');
  });
});

// ───────────────────────────────────────────────────────────────────────────
// INVITACIÓN A LA CUADRILLA (Tanda 10)
//
// Este texto es la función entera: si el mensaje de WhatsApp no dice qué se
// pide y qué cuesta, no se suma nadie y el tablero queda con una sola persona.
// ───────────────────────────────────────────────────────────────────────────
describe('buildCuadrillaInviteText', () => {
  const URL = 'https://encuentra-mascota.netlify.app/cuadrilla/tok-abc';

  it('dice a quién se busca, dónde, y lleva el link', () => {
    const t = buildCuadrillaInviteText(pet({ nombre: 'Rocco', comuna: 'Maipú' }), URL);
    expect(t).toContain('Rocco');
    expect(t).toContain('Maipú');
    expect(t).toContain(URL);
  });

  it('pide algo CONCRETO y acotado, no "ayuda" en abstracto', () => {
    // "¿Me ayudás a buscarlo?" no se puede contestar: no se sabe qué implica.
    // El mensaje tiene que anticipar que son tareas cortas y que se elige una.
    const t = buildCuadrillaInviteText(pet({ nombre: 'Rocco', comuna: 'Maipú' }), URL).toLowerCase();
    expect(t).toMatch(/cartel/);
    expect(t).toMatch(/cuadras/);
    expect(t).toMatch(/eleg[íi]s|la que puedas/);
  });

  it('sin nombre y sin comuna no escribe huecos ni "null"', () => {
    const t = buildCuadrillaInviteText(pet({ nombre: null, comuna: null }), URL);
    expect(t).not.toMatch(/null|undefined/);
    expect(t).not.toMatch(/ {2}|"" | en \./);
    expect(t).toContain('perro');
  });

  it('sin link (móvil sin EXPO_PUBLIC_WEB_URL) no deja un "null" pegado', () => {
    // `cuadrillaUrl` devuelve null fuera de web si no está configurada la URL.
    // Mandar "Sumate acá: null" por WhatsApp es peor que no mandar nada.
    const t = buildCuadrillaInviteText(pet({ nombre: 'Rocco' }), null);
    expect(t).not.toMatch(/null|undefined/);
    expect(t.trim().length).toBeGreaterThan(20);
  });

  it('NO promete avisos: la cuadrilla no manda notificaciones a nadie', () => {
    // No se toca la cola de avisos ni su Edge Function. Prometer en el mensaje
    // de invitación algo que la app no hace es la forma más rápida de quemar la
    // confianza de un vecino que sí quiso ayudar.
    const t = buildCuadrillaInviteText(pet({ nombre: 'Rocco', comuna: 'Maipú' }), URL).toLowerCase();
    for (const promesa of ['te aviso', 'te avisamos', 'te notific', 'recibirás', 'recibiras']) {
      expect(t).not.toContain(promesa);
    }
  });

  it('no gamifica ni festeja: del otro lado hay alguien angustiado', () => {
    const t = buildCuadrillaInviteText(pet({ nombre: 'Rocco', comuna: 'Maipú' }), URL);
    expect(t.toLowerCase()).not.toMatch(/punto|ranking|insignia|medalla|desafío|desafio|premio/);
    expect(t).not.toMatch(/🏆|🥇|🎉|🎯|🔥/);
  });
});
