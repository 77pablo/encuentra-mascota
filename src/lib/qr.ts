import qrcode from 'qrcode-generator';

// Genera la matriz de módulos del QR (true = módulo oscuro). Puro JS, sin red.
export function qrMatrix(value: string): boolean[][] {
  const qr = qrcode(0, 'M'); // typeNumber 0 = tamaño automático; corrección 'M'
  qr.addData(value);
  qr.make();
  const count = qr.getModuleCount();
  const matrix: boolean[][] = [];
  for (let r = 0; r < count; r++) {
    const row: boolean[] = [];
    for (let c = 0; c < count; c++) {
      row.push(qr.isDark(r, c));
    }
    matrix.push(row);
  }
  return matrix;
}
