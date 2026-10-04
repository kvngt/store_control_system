// Tareas de mano de obra con técnico (comisión por tarea, 20261010000006).
//
// Las reglas de pantalla que comparten el editor de tareas, la tabla de mano de obra y, en la
// fase F4, el alta de la orden. Ninguna toca dinero: quién cobra cuánto lo calcula la base
// (`comisiones_estimadas`).

import type { LaborItem, Specialty, UserProfile, WorkType } from '../../types/database';

/** Quien puede recibir una tarea: un mecánico o pintor de la sede de la orden. */
export type Technician = Pick<UserProfile, 'id' | 'nombre_completo' | 'rol'>;

/** Una tarea lista para guardar, en una orden que ya existe o en el borrador del alta. */
export interface TaskDraft {
  descripcion: string;
  costo: number;
  especialidad: Specialty;
  /** Nulo = sin técnico: nadie cobra su comisión hasta que se le asigne uno. */
  asignado_a: string | null;
}

/** El tipo con el que nace una tarea según el tipo de la orden (un "combinado" empieza en mecánica). */
export function specialtyForWorkType(workType: WorkType | undefined): Specialty {
  return workType === 'pintura' ? 'pintura' : 'mecanica';
}

/**
 * Si la tarea no es del oficio de esa persona: pintura a un mecánico o mecánica a un pintor. No
 * es un error (el taller a veces lo hace a propósito), pero se pregunta antes de asignarla,
 * porque la comisión de la tarea va a esa persona.
 */
export function isTradeMismatch(especialidad: Specialty, technician: Technician | null | undefined): boolean {
  if (!technician) return false;
  return (especialidad === 'pintura' && technician.rol === 'mecanico')
    || (especialidad === 'mecanica' && technician.rol === 'pintor');
}

/**
 * El técnico que viene elegido al agregar una tarea: el de la primera tarea que tenga uno, si
 * sigue en la lista de quienes pueden recibirla. Casi siempre una orden la trabaja una persona.
 */
export function defaultTechnicianId(items: Pick<LaborItem, 'asignado_a'>[], technicians: Technician[]): string | null {
  const first = items.find((l) => l.asignado_a && technicians.some((tech) => tech.id === l.asignado_a));
  return first?.asignado_a ?? null;
}

/**
 * Una tarea sin técnico que no es del reparto heredado: nadie cobra su comisión. `undefined` en
 * `reparto_heredado` es una línea leída antes de la columna, y esa se queda con el reparto.
 */
export function isUnassignedTask(item: Pick<LaborItem, 'asignado_a' | 'reparto_heredado'>): boolean {
  return !item.asignado_a && item.reparto_heredado === false;
}
