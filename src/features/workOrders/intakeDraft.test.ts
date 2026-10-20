// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { emptyWorkOrderForm } from './workOrderForm.schema';
import { clearAllIntakeDrafts, clearIntakeDraft, loadIntakeDraft, saveIntakeDraft } from './intakeDraft';

beforeEach(() => localStorage.clear());

const conDatos = () => ({
  ...emptyWorkOrderForm(),
  milesIn: '48000',
  inspectionNotes: 'Golpe en la puerta',
  laborItems: [{ descripcion: 'Pintar puerta', costo: '120' }] as never,
});

describe('borrador del alta de una orden', () => {
  it('guarda y recupera lo capturado, con el paso donde se quedó', () => {
    saveIntakeDraft('u1', conDatos(), 3);

    const draft = loadIntakeDraft('u1')!;
    expect(draft.step).toBe(3);
    expect(draft.values.milesIn).toBe('48000');
    expect(draft.values.laborItems).toHaveLength(1);
  });

  it('un formulario vacío no deja borrador (y borra el que hubiera)', () => {
    saveIntakeDraft('u1', conDatos(), 2);
    saveIntakeDraft('u1', emptyWorkOrderForm(), 1);
    expect(loadIntakeDraft('u1')).toBeNull();
  });

  it('es de una persona: otra en el mismo teléfono no lo ve', () => {
    saveIntakeDraft('u1', conDatos(), 2);
    expect(loadIntakeDraft('u2')).toBeNull();
  });

  it('un campo que se agregó después de guardarlo se completa con el formulario vacío', () => {
    saveIntakeDraft('u1', conDatos(), 1);
    const raw = JSON.parse(localStorage.getItem('restorify_intake_draft:u1')!);
    delete raw.values.authorizedAtIntake;
    localStorage.setItem('restorify_intake_draft:u1', JSON.stringify(raw));

    expect(loadIntakeDraft('u1')!.values.authorizedAtIntake).toBe(false);
  });

  it('un borrador roto o de otra versión se ignora sin romper nada', () => {
    localStorage.setItem('restorify_intake_draft:u1', '{no es json');
    expect(loadIntakeDraft('u1')).toBeNull();
    localStorage.setItem('restorify_intake_draft:u1', JSON.stringify({ v: 99, values: conDatos() }));
    expect(loadIntakeDraft('u1')).toBeNull();
  });

  it('descartar borra el de esa persona; cerrar sesión borra todos', () => {
    saveIntakeDraft('u1', conDatos(), 1);
    saveIntakeDraft('u2', conDatos(), 1);

    clearIntakeDraft('u1');
    expect(loadIntakeDraft('u1')).toBeNull();
    expect(loadIntakeDraft('u2')).not.toBeNull();

    clearAllIntakeDrafts();
    expect(loadIntakeDraft('u2')).toBeNull();
  });
});
