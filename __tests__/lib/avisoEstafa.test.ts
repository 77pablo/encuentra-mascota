// AvisoEstafa.tsx importa Ionicons de '@expo/vector-icons' (regla del proyecto:
// iconos de linea, nunca emojis). Ese paquete carga expo-font -> expo-asset, y
// expo-asset no esta instalado en este entorno (bug preexistente del install,
// no relacionado con este componente: ningun otro archivo del proyecto que usa
// Ionicons tiene tests hoy). Se mockea aqui, localmente, solo para poder
// importar el modulo y testear los textos sin necesitar ese paquete roto.
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

import { TEXTO_AVISO_ESTAFA } from '../../src/ui/AvisoEstafa';

describe('textos del aviso antiestafa', () => {
  it('cubre las dos variantes', () => {
    expect(Object.keys(TEXTO_AVISO_ESTAFA).sort()).toEqual(['chat', 'recompensa']);
  });

  it('el aviso del chat advierte de no transferir por adelantado', () => {
    const texto = TEXTO_AVISO_ESTAFA.chat.toLowerCase();
    expect(texto).toContain('nunca transfieras');
    expect(texto).toContain('en persona');
  });

  it('el aviso de recompensa deja claro que la app no media en el pago', () => {
    const texto = TEXTO_AVISO_ESTAFA.recompensa.toLowerCase();
    expect(texto).toContain('no participamos');
    expect(texto).toContain('nunca transfieras');
  });

  it('ningun aviso queda vacio ni es un placeholder', () => {
    for (const texto of Object.values(TEXTO_AVISO_ESTAFA)) {
      expect(texto.trim().length).toBeGreaterThan(40);
      expect(texto).not.toMatch(/TODO|TBD|lorem/i);
    }
  });
});
