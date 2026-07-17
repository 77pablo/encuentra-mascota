// Tiempo relativo en español a partir de una fecha ISO. Recibe `now` opcional para tests.
export function timeAgo(iso: string, now: number = Date.now()): string {
  const diffMs = now - new Date(iso).getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'recién';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
  const w = Math.floor(d / 7);
  if (w < 5) return `hace ${w} ${w === 1 ? 'semana' : 'semanas'}`;
  const mo = Math.floor(d / 30);
  return `hace ${mo} ${mo === 1 ? 'mes' : 'meses'}`;
}
