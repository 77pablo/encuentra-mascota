// PALETAS. Mismas claves en ambas; el ThemeProvider elige según el esquema.
// La paleta clara es la identidad de siempre (pino + arena). La oscura es cálida
// (no negro puro): fondo casi-negro cálido, superficies grises cálidas, texto
// arena claro, y verdes/coral/dorado ajustados para contraste sobre oscuro.
export const lightColors = {
  brand: '#17654B', // pino cálido — acciones primarias, nav activo
  brandDark: '#0F4E39',
  sun: '#EFB13C', // dorado cálido — destacados
  lost: '#E0623D', // coral — estado "perdida"
  found: '#1E8A63', // verde — estado "encontrada"
  ink: '#23231D', // texto primario (casi negro cálido)
  muted: '#7E7B6F', // texto secundario (gris cálido)
  line: '#EFE8DA', // bordes/divisores (línea cálida)
  bg: '#FBF6EC', // fondo de la app (arena cálida)
  card: '#FFFFFF', // blanco de tarjetas
  sky: '#EAF1EC', // superficie con tinte verde suave
  white: '#FFFFFF', // texto sobre botones de color (fijo en ambos temas)
};

export const darkColors: typeof lightColors = {
  brand: '#2FA07A',
  brandDark: '#25795D',
  sun: '#F0B84A',
  lost: '#EE7350',
  found: '#3FB98C',
  ink: '#F2EEE3',
  muted: '#A29C8C',
  line: '#332F26',
  bg: '#16150F',
  card: '#242119',
  sky: '#1E2A24',
  white: '#FFFFFF',
};

export type Colors = typeof lightColors;

// ALIAS TEMPORAL (se quita en la Tarea 8 del plan de modo oscuro). Existe solo
// para que la app siga compilando mientras se convierten las pantallas al hook
// `useColors()`. Cuando se elimine, `tsc` marcará lo que falte convertir.
export const colors = lightColors;

export const radius = { sm: 12, md: 16, lg: 20, pill: 999 };

export const spacing = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export const font = {
  display: 'HankenGrotesk_800ExtraBold',
  displayBold: 'HankenGrotesk_700Bold',
  body: 'HankenGrotesk_400Regular',
  bodySemi: 'HankenGrotesk_600SemiBold',
  bodyBold: 'HankenGrotesk_700Bold',
};

export const shadow = {
  card: {
    shadowColor: '#1E3A2E',
    shadowOpacity: 0.12,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 10 },
    elevation: 4,
  },
};
