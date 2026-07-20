// Insignias del perfil público: señales de confianza discretas derivadas de las
// estadísticas, NO logros de videojuego. Cada familia muestra solo su escalón más
// alto alcanzado. Un perfil nuevo puede no tener ninguna, y está bien.

export interface StatsPerfil {
  reencuentros: number;
  reportes: number;
  aportes: number;
}

export interface Insignia {
  clave: string; // una por familia: 'reencuentros' | 'aportes'
  icono: string; // nombre de ícono de Ionicons (línea)
  titulo: string;
  descripcion: string;
}

export function insigniasDe(stats: StatsPerfil): Insignia[] {
  const out: Insignia[] = [];

  // Publicar reportes por sí solo no da insignia (no es un logro): solo cuentan
  // los resultados (reencuentros) y la colaboración con otros (aportes).
  if (stats.reencuentros >= 5) {
    out.push({
      clave: 'reencuentros',
      icono: 'shield-checkmark-outline',
      titulo: 'Vecino de confianza',
      descripcion: 'Ayudó a varias mascotas a volver a casa.',
    });
  } else if (stats.reencuentros >= 1) {
    out.push({
      clave: 'reencuentros',
      icono: 'home-outline',
      titulo: 'Reencuentros logrados',
      descripcion: 'Logró que una mascota volviera a casa.',
    });
  }

  if (stats.aportes >= 20) {
    out.push({
      clave: 'aportes',
      icono: 'ribbon-outline',
      titulo: 'Colaborador constante',
      descripcion: 'Aporta seguido pistas y avistamientos.',
    });
  } else if (stats.aportes >= 5) {
    out.push({
      clave: 'aportes',
      icono: 'people-outline',
      titulo: 'Colabora con el barrio',
      descripcion: 'Deja pistas y avistamientos en reportes de otros.',
    });
  }

  return out;
}
