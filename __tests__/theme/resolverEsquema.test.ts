import { resolverEsquema } from '../../src/theme/ThemeProvider';

describe('resolverEsquema', () => {
  it('"auto" sigue al sistema (y cae a light si el sistema no informa)', () => {
    expect(resolverEsquema('auto', 'dark')).toBe('dark');
    expect(resolverEsquema('auto', 'light')).toBe('light');
    expect(resolverEsquema('auto', null)).toBe('light');
    expect(resolverEsquema('auto', undefined)).toBe('light');
  });

  it('"claro" y "oscuro" fuerzan el esquema, ignorando el sistema', () => {
    expect(resolverEsquema('claro', 'dark')).toBe('light');
    expect(resolverEsquema('oscuro', 'light')).toBe('dark');
  });
});
