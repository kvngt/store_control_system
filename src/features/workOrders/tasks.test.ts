import { describe, it, expect } from 'vitest';
import { suggestedTechnicianFor, suggestedTechnicianId, type Technician } from './tasks';

const MARIO: Technician = { id: 'u-mario', nombre_completo: 'Mario', rol: 'mecanico' };
const PAULA: Technician = { id: 'u-paula', nombre_completo: 'Paula', rol: 'pintor' };
const CARLOS: Technician = { id: 'u-carlos', nombre_completo: 'Carlos', rol: 'mecanico' };
const TECHS = [MARIO, PAULA, CARLOS];

// Pedido del taller del 06/10/2026: el trabajo extra va a quien lo reportó; si no, al único
// técnico de la orden; con varios y agregado por administración, a nadie hasta que se elija.
describe('suggestedTechnicianId', () => {
  it('quien reportó el hallazgo, aunque la orden tenga varios técnicos', () => {
    expect(suggestedTechnicianId([MARIO.id, PAULA.id], [MARIO, PAULA], PAULA.id)).toBe(PAULA.id);
  });

  it('sin quien reportó, el único técnico de la orden', () => {
    expect(suggestedTechnicianId([MARIO.id, MARIO.id], [MARIO, PAULA])).toBe(MARIO.id);
  });

  it('con varios técnicos y sin hallazgo, ninguno', () => {
    expect(suggestedTechnicianId([MARIO.id, PAULA.id], [MARIO, PAULA])).toBeNull();
  });

  it('no propone a quien ya no puede recibir la tarea', () => {
    expect(suggestedTechnicianId(['u-ido'], [MARIO, PAULA], 'u-ido')).toBeNull();
    expect(suggestedTechnicianId(['u-ido', MARIO.id], [MARIO, PAULA], 'u-ido')).toBe(MARIO.id);
  });
});

describe('suggestedTechnicianFor', () => {
  it('quien reportó el hallazgo, si es elegible', () => {
    const assignments = [
      { usuario_id: MARIO.id, tipo_tarea: 'mecanica' as const },
      { usuario_id: PAULA.id, tipo_tarea: 'pintura' as const },
    ];
    expect(suggestedTechnicianFor('mecanica', assignments, TECHS, PAULA.id)).toBe(PAULA.id);
  });

  it('si quien reportó no es elegible, pasa a la siguiente regla', () => {
    const assignments = [
      { usuario_id: MARIO.id, tipo_tarea: 'mecanica' as const },
    ];
    expect(suggestedTechnicianFor('mecanica', assignments, TECHS, 'u-inactivo')).toBe(MARIO.id);
  });

  it('el único técnico asignado a la orden de esa especialidad', () => {
    const assignments = [
      { usuario_id: MARIO.id, tipo_tarea: 'mecanica' as const },
      { usuario_id: PAULA.id, tipo_tarea: 'pintura' as const },
    ];
    expect(suggestedTechnicianFor('mecanica', assignments, TECHS)).toBe(MARIO.id);
    expect(suggestedTechnicianFor('pintura', assignments, TECHS)).toBe(PAULA.id);
  });

  it('si no hay técnico de esa especialidad pero hay un único técnico en la orden, lo propone', () => {
    const assignments = [
      { usuario_id: MARIO.id, tipo_tarea: 'mecanica' as const },
    ];
    expect(suggestedTechnicianFor('pintura', assignments, TECHS)).toBe(MARIO.id);
  });

  it('con varios técnicos de la misma especialidad sin hallazgo, devuelve null', () => {
    const assignments = [
      { usuario_id: MARIO.id, tipo_tarea: 'mecanica' as const },
      { usuario_id: CARLOS.id, tipo_tarea: 'mecanica' as const },
    ];
    expect(suggestedTechnicianFor('mecanica', assignments, TECHS)).toBeNull();
  });

  it('con varios técnicos en total y ninguno de la especialidad pedida, devuelve null', () => {
    const assignments = [
      { usuario_id: MARIO.id, tipo_tarea: 'mecanica' as const },
      { usuario_id: CARLOS.id, tipo_tarea: 'mecanica' as const },
    ];
    expect(suggestedTechnicianFor('pintura', assignments, TECHS)).toBeNull();
  });

  it('sin asignaciones devuelve null', () => {
    expect(suggestedTechnicianFor('mecanica', [], TECHS)).toBeNull();
  });
});

