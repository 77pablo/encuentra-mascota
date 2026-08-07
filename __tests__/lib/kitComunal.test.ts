import { mensajesKit, urlSitio } from '../../src/lib/kitComunal';

describe('kit comunal', () => {
  it('urlSitio usa EXPO_PUBLIC_WEB_URL o el respaldo NUESTRO', () => {
    expect(urlSitio()).toMatch(/^https:\/\//);
    expect(urlSitio()).not.toContain('encuentratumascota.app'); // dominio ajeno, ya nos mordió
  });

  it('tres mensajes, cada uno con la URL y sin pedir plata ni cuenta', () => {
    const msgs = mensajesKit('https://ejemplo.cl');
    expect(msgs.map((m) => m.id).sort()).toEqual(['facebook', 'vecinos', 'veterinaria']);
    for (const m of msgs) {
      expect(m.texto).toContain('https://ejemplo.cl');
      expect(m.texto.toLowerCase()).toContain('gratis');
      expect(m.texto).not.toMatch(/\$|precio|pago/i);
    }
  });

  it('el mensaje de veterinaria menciona el widget (la pieza institucional)', () => {
    const vet = mensajesKit('https://ejemplo.cl').find((m) => m.id === 'veterinaria')!;
    expect(vet.texto).toContain('/widget');
  });
});
