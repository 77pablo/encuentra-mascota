// Normaliza texto para comparaciones insensibles a mayúsculas y tildes.
export function normalize(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
