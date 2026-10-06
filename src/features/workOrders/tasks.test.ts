import { describe, it, expect } from 'vitest';
import { suggestedTechnicianId, type Technician } from './tasks';

const MARIO: Technician = { id: 'u-mario', nombre_completo: 'Mario', rol: 'mecanico' };
const PAULA: Technician = { id: 'u-paula', nombre_completo: 'Paula', rol: 'pintor' };

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
