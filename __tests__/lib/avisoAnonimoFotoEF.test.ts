import { readFileSync } from 'fs';
import { join } from 'path';

// GUARDRAIL ESTATICO de `aviso-anonimo-foto/index.ts` (F2/F16, revisión
// adversarial final de la tanda 13). Mismo criterio que
// __tests__/lib/avisosBloqueoEdge.test.ts: `index.ts` usa `Deno.serve` y
// especificadores `jsr:`, así que no se puede importar desde jest.
const codigo = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'functions', 'aviso-anonimo-foto', 'index.ts'),
  'utf8',
);

describe('F2: las tres respuestas 200 son EXACTAMENTE { ok: true }', () => {
  // El código tiene DOS `return` con `status: 200` (uno para el descarte
  // enmascarado de la RPC, otro compartido por el camino feliz Y la subida
  // fallida — antes de este fix, ese último devolvía `foto: true`/`foto:
  // false` según el resultado del `upload`; ahora es el mismo `{ ok: true }`
  // sin condicional), que entre los dos cubren los TRES casos del hallazgo.
  it('ninguna respuesta 200 lleva el campo `foto` (ni ningún otro que varíe)', () => {
    const respuestas200 = codigo.match(/JSON\.stringify\(\{[^}]*\}\)[^;]*status: 200/g) ?? [];
    expect(respuestas200.length).toBe(2);
    for (const r of respuestas200) {
      expect(r).toContain('ok: true');
      expect(r).not.toContain('foto');
    }
  });

  it('las dos respuestas 200 son literalmente el mismo JSON.stringify', () => {
    const cuerpos = [...codigo.matchAll(/JSON\.stringify\((\{[^}]*\})\)[^;]*status: 200/g)].map((m) => m[1]);
    expect(cuerpos.length).toBe(2);
    expect(new Set(cuerpos).size).toBe(1);
  });

  it('la respuesta del camino feliz/subida-fallida ya NO depende de si `upload` tuvo error', () => {
    const i = codigo.indexOf('.upload(path, bytes');
    const bloque = codigo.slice(i, codigo.indexOf('status: 200', i) + 20);
    expect(bloque).not.toMatch(/foto:\s*errSubida/);
  });
});

describe('F16: el tope de tamaño se chequea ANTES de parsear', () => {
  it('Content-Length se chequea ANTES de req.json()', () => {
    const iContentLength = codigo.indexOf('MAX_CONTENT_LENGTH');
    const iReqJson = codigo.indexOf('await req.json()');
    expect(iContentLength).toBeGreaterThan(0);
    expect(iReqJson).toBeGreaterThan(iContentLength);
  });

  it('el largo del base64 se chequea ANTES de atob()', () => {
    const iBase64Check = codigo.indexOf('body.foto_base64.length > MAX_BASE64_LEN');
    const iAtob = codigo.indexOf('atob(body.foto_base64)');
    expect(iBase64Check).toBeGreaterThan(0);
    expect(iAtob).toBeGreaterThan(iBase64Check);
  });

  it('los dos topes rechazan con el mismo formato de error de la EF (413, mismo mensaje)', () => {
    const rechazos = codigo.match(/error: 'La foto pesa más de 2 MB'[^}]*\}\), \{ status: 413/g) ?? [];
    expect(rechazos.length).toBeGreaterThanOrEqual(3); // Content-Length, base64.length, bytes.length
  });
});
