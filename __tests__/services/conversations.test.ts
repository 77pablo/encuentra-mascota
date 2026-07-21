import { foldConversations } from '../../src/services/messages';

const me = 'me';
// más nuevo primero (como los devuelve listConversations)
const msgs = [
  { id: '4', pet_id: 'petA', from_user: 'me', to_user: 'otro1', texto: 'último a otro1', leido: false, creado_en: '2026-07-16T10:00:00Z' },
  { id: '3', pet_id: 'petA', from_user: 'otro1', to_user: 'me', texto: 'viejo de otro1', leido: true, creado_en: '2026-07-16T09:00:00Z' },
  { id: '2', pet_id: 'petB', from_user: 'otro2', to_user: 'me', texto: 'de otro2', leido: false, creado_en: '2026-07-16T08:00:00Z' },
] as any;

describe('foldConversations', () => {
  it('agrupa por (contexto, otro usuario) y conserva el más reciente', () => {
    const convs = foldConversations(msgs, me);
    expect(convs).toHaveLength(2);
    const a = convs.find((c) => c.ctx.tipo === 'pet' && c.ctx.id === 'petA')!;
    expect(a.otherUser).toBe('otro1');
    expect(a.lastTexto).toBe('último a otro1');
    const b = convs.find((c) => c.ctx.tipo === 'pet' && c.ctx.id === 'petB')!;
    expect(b.otherUser).toBe('otro2');
  });
  it('devuelve vacío sin mensajes', () => {
    expect(foldConversations([], me)).toEqual([]);
  });
});
