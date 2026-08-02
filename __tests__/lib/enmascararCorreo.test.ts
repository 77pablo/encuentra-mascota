import { enmascararCorreo } from '../../src/lib/enmascararCorreo';

it('deja la primera letra y el dominio', () => {
  expect(enmascararCorreo('pablo@gmail.com')).toBe('p***@gmail.com');
});
it('no revienta con vacío, null o algo que no es un correo', () => {
  expect(enmascararCorreo(null)).toBe('');
  expect(enmascararCorreo('')).toBe('');
  expect(enmascararCorreo('sin-arroba')).toBe('sin-arroba');
});
