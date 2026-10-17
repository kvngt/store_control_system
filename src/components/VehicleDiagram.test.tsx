/** @vitest-environment jsdom */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { VehicleDiagram, type VehicleDiagramLabels } from './VehicleDiagram';
import type { DamageMark } from '../lib/vehicleDiagram';

describe('VehicleDiagram', () => {
  const labels: VehicleDiagramLabels = {
    views: {
      izquierda: 'Lado izquierdo',
      derecha: 'Lado derecho',
      frontal: 'Frente',
      trasera: 'Atrás',
      superior: 'Arriba',
    },
    types: {
      golpe: 'Golpe',
      rayon: 'Rayón',
      pintura: 'Pintura',
      roto: 'Roto',
      otro: 'Otro',
    },
    remove: 'Quitar',
    empty: 'Sin daños marcados',
  };

  it('agrega en el punto tocado con el tipo activo', () => {
    const onAdd = vi.fn();
    render(
      <VehicleDiagram
        marks={[]}
        labels={labels}
        editable={true}
        activeType="golpe"
        onAdd={onAdd}
      />
    );

    const svgFrontal = screen.getByRole('img', { name: 'Frente' });

    vi.spyOn(svgFrontal, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 50,
      width: 200,
      height: 100,
      right: 300,
      bottom: 150,
      x: 100,
      y: 50,
      toJSON: () => {},
    });

    fireEvent.click(svgFrontal, { clientX: 150, clientY: 75 });

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(onAdd).toHaveBeenCalledWith({
      vista: 'frontal',
      x: 0.25,
      y: 0.25,
      tipo: 'golpe',
    });
  });

  it('quita al tocar una marca en el dibujo', () => {
    const onRemove = vi.fn();
    const marks: DamageMark[] = [
      { vista: 'frontal', x: 0.5, y: 0.5, tipo: 'golpe' },
    ];

    render(
      <VehicleDiagram
        marks={marks}
        labels={labels}
        editable={true}
        activeType="golpe"
        onRemove={onRemove}
      />
    );

    const markBtn = screen.getByRole('button', { name: /Quitar Golpe/i });
    fireEvent.click(markBtn);

    expect(onRemove).toHaveBeenCalledTimes(1);
    expect(onRemove).toHaveBeenCalledWith(0);
  });

  it('en modo de solo lectura no agrega marcas ni permite quitarlas', () => {
    const onAdd = vi.fn();
    const onRemove = vi.fn();
    const marks: DamageMark[] = [
      { vista: 'frontal', x: 0.5, y: 0.5, tipo: 'golpe' },
    ];

    render(
      <VehicleDiagram
        marks={marks}
        labels={labels}
        editable={false}
        activeType="golpe"
        onAdd={onAdd}
        onRemove={onRemove}
      />
    );

    const svgFrontal = screen.getByRole('img', { name: 'Frente' });
    vi.spyOn(svgFrontal, 'getBoundingClientRect').mockReturnValue({
      left: 0,
      top: 0,
      width: 100,
      height: 100,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => {},
    });

    fireEvent.click(svgFrontal, { clientX: 50, clientY: 50 });
    expect(onAdd).not.toHaveBeenCalled();

    expect(screen.queryByRole('button', { name: /Quitar/i })).toBeNull();
  });

  it('muestra la lista accesible con las marcas o el mensaje vacío', () => {
    const onRemove = vi.fn();
    const { rerender } = render(
      <VehicleDiagram
        marks={[]}
        labels={labels}
        editable={true}
      />
    );

    expect(screen.getByText('Sin daños marcados')).toBeDefined();

    const marks: DamageMark[] = [
      { vista: 'izquierda', x: 0.2, y: 0.3, tipo: 'golpe' },
      { vista: 'trasera', x: 0.7, y: 0.8, tipo: 'rayon' },
    ];

    rerender(
      <VehicleDiagram
        marks={marks}
        labels={labels}
        editable={true}
        onRemove={onRemove}
      />
    );

    expect(screen.getByText('Lado izquierdo: Golpe')).toBeDefined();
    expect(screen.getByText('Atrás: Rayón')).toBeDefined();

    const removeBtns = screen.getAllByRole('button', { name: /Quitar: (Lado izquierdo|Atrás)/i });
    expect(removeBtns.length).toBe(2);

    fireEvent.click(removeBtns[1]);
    expect(onRemove).toHaveBeenCalledWith(1);
  });
});
