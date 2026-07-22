import {
  Carnet,
  estadoDosis,
  resumenRecordatorios,
  resumenRecordatoriosVarios,
} from './recordatorios';

const HOY = new Date('2026-07-22T12:00:00');
const DIA = 24 * 60 * 60 * 1000;
const enDias = (d: number) => new Date(HOY.getTime() + d * DIA).toISOString().slice(0, 10);

describe('estadoDosis', () => {
  it('sin fecha (null/undefined) es null', () => {
    expect(estadoDosis(null, HOY)).toBeNull();
    expect(estadoDosis(undefined, HOY)).toBeNull();
  });

  it('fecha inválida es null', () => {
    expect(estadoDosis('no-es-fecha', HOY)).toBeNull();
  });

  it('vencida ayer', () => {
    expect(estadoDosis(enDias(-1), HOY)).toBe('vencida');
  });

  it('vence hoy mismo: vence_pronto (0 días)', () => {
    expect(estadoDosis(enDias(0), HOY)).toBe('vence_pronto');
  });

  it('vence en 14 días: vence_pronto (borde inclusivo)', () => {
    expect(estadoDosis(enDias(14), HOY)).toBe('vence_pronto');
  });

  it('vence en 15 días: al_dia (justo fuera del borde)', () => {
    expect(estadoDosis(enDias(15), HOY)).toBe('al_dia');
  });
});

describe('resumenRecordatorios', () => {
  it('todo null: resumen null (nada pendiente)', () => {
    const carnet: Carnet = {};
    expect(resumenRecordatorios('Luna', carnet, HOY)).toBeNull();
  });

  it('todo al día: resumen null', () => {
    const carnet: Carnet = {
      vacunaProxima: enDias(30),
      antiparasitarioInternoProximo: enDias(60),
      antiparasitarioExternoProximo: enDias(90),
    };
    expect(resumenRecordatorios('Luna', carnet, HOY)).toBeNull();
  });

  it('vacuna vence pronto: texto de vacuna', () => {
    const carnet: Carnet = { vacunaProxima: enDias(5) };
    expect(resumenRecordatorios('Luna', carnet, HOY)).toBe('A Luna le toca la vacuna');
  });

  it('antiparasitario interno vencido: texto de antiparasitario', () => {
    const carnet: Carnet = { antiparasitarioInternoProximo: enDias(-2) };
    expect(resumenRecordatorios('Rocco', carnet, HOY)).toBe('A Rocco le toca el antiparasitario');
  });

  it('antiparasitario externo vence pronto: mismo texto de antiparasitario', () => {
    const carnet: Carnet = { antiparasitarioExternoProximo: enDias(3) };
    expect(resumenRecordatorios('Rocco', carnet, HOY)).toBe('A Rocco le toca el antiparasitario');
  });

  it('prioridad: vencida gana aunque haya otra cosa por vencer pronto', () => {
    const carnet: Carnet = {
      vacunaProxima: enDias(5), // vence_pronto
      antiparasitarioInternoProximo: enDias(-1), // vencida
    };
    expect(resumenRecordatorios('Luna', carnet, HOY)).toBe('A Luna le toca el antiparasitario');
  });
});

describe('resumenRecordatoriosVarios', () => {
  it('sin fichas: null', () => {
    expect(resumenRecordatoriosVarios([], HOY)).toBeNull();
  });

  it('ninguna ficha con algo pendiente: null', () => {
    const fichas = [
      { nombre: 'Luna', carnet: { vacunaProxima: enDias(30) } },
      { nombre: 'Rocco', carnet: {} },
    ];
    expect(resumenRecordatoriosVarios(fichas, HOY)).toBeNull();
  });

  it('elige la ficha con el estado más urgente entre varias', () => {
    const fichas = [
      { nombre: 'Luna', carnet: { vacunaProxima: enDias(5) } }, // vence_pronto
      { nombre: 'Rocco', carnet: { antiparasitarioInternoProximo: enDias(-3) } }, // vencida
    ];
    expect(resumenRecordatoriosVarios(fichas, HOY)).toBe('A Rocco le toca el antiparasitario');
  });
});
