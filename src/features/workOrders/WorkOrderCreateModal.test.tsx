/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkOrderCreateModal from './WorkOrderCreateModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../context/ToastContext';
import { getTranslation } from '../../i18n/translations';
import { customersService } from '../../services/customers.service';
import { vehiclesService } from '../../services/vehicles.service';
import { usersService } from '../../services/users.service';
import type { Customer, UserProfile, Vehicle } from '../../types/database';

vi.mock('../../services/workOrders.service');
vi.mock('../../services/media.service');
vi.mock('../../services/customers.service');
vi.mock('../../services/vehicles.service');
vi.mock('../../services/users.service');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const CUSTOMER: Customer = {
  id: 'cli-1',
  sede_id: 'sede-1',
  nombre: 'Juan Perez',
  telefono: '5551234567',
  email: '',
  direccion: '',
  notas_crm: null,
  creado_en: '2026-01-01',
};

const VEHICLE: Vehicle = {
  id: 'veh-1',
  cliente_id: 'cli-1',
  sede_id: 'sede-1',
  marca: 'Toyota',
  modelo: 'Camry',
  anio: 2018,
  vin: '1HGCM82633A000000',
  placa: 'ABC1234',
  color: 'Rojo',
  creado_en: '2026-01-01',
};

const OPERATOR: UserProfile = {
  id: 'usr-1',
  sede_id: 'sede-1',
  nombre_completo: 'Mecanico Bob',
  rol: 'mecanico',
  telefono: null,
  email: 'bob@taller.test',
  creado_en: '2026-01-01',
};

import { useWorkOrderForm } from './useWorkOrderForm';

const mockSubmit = vi.fn();

/** El paso abierto, según la lista de pasos del encabezado. */
const currentStep = () => document.querySelector('[aria-current="step"]')?.textContent ?? '';

function TestWrapper() {
  const form = useWorkOrderForm();
  return (
    <WorkOrderCreateModal
      form={form}
      customers={[CUSTOMER]}
      vehiclesForCustomer={[VEHICLE]}
      operators={[OPERATOR]}
      isAdmin={true}
      saving={false}
      error=""
      onSubmit={mockSubmit}
      onClose={vi.fn()}
    />
  );
}

import { LanguageProvider } from '../../context/LanguageContext';

describe('WorkOrderCreateModal - Assistant (Wizard)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSubmit.mockClear();
    queryClient.clear();
    vi.mocked(customersService.getCustomers).mockResolvedValue([CUSTOMER]);
    vi.mocked(vehiclesService.getVehicles).mockResolvedValue([VEHICLE]);
    vi.mocked(usersService.getOperators).mockResolvedValue([OPERATOR]);
  });

  const renderModal = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <LanguageProvider>
          <ToastProvider>
            <TestWrapper />
          </ToastProvider>
        </LanguageProvider>
      </QueryClientProvider>
    );
  };

  it('navigates through the 4 steps and submits', async () => {
    const user = userEvent.setup();
    renderModal();

    // Paso 1: Cliente
    await waitFor(() => expect(currentStep()).toMatch(/Cliente/));
    const customerSelect = screen.getByRole('combobox');
    await user.selectOptions(customerSelect, CUSTOMER.id);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    // Paso 2: Vehículo
    await waitFor(() => expect(currentStep()).toMatch(/Vehículo/));
    const vehicleSelect = screen.getAllByRole('combobox')[0];
    await user.selectOptions(vehicleSelect, VEHICLE.id);
    const milesIn = document.getElementById('order-miles-in') as HTMLInputElement;
    await user.type(milesIn, '50000');
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    // Paso 3: Trabajos (antes que el depósito desde el 06/10/2026)
    await waitFor(() => expect(currentStep()).toMatch(/Trabajos/));

    // Fill Labor using TaskEditor
    await user.click(document.getElementById('create-order-open') as HTMLElement);
    const laborDesc = document.getElementById('create-order-description') as HTMLInputElement;
    await user.type(laborDesc, 'Mantenimiento');
    const laborCost = document.getElementById('create-order-price') as HTMLInputElement;
    await user.type(laborCost, '500');
    const assignSelect = document.getElementById('create-order-technician') as HTMLSelectElement;
    await user.selectOptions(assignSelect, OPERATOR.id);
    await user.click(document.getElementById('create-order-submit') as HTMLElement);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    // Paso 4: Depósito, el último
    await waitFor(() => expect(currentStep()).toMatch(/Depósito/));
    const depositInput = document.getElementById('order-deposit') as HTMLInputElement;
    await user.type(depositInput, '100');
    const paymentMethodSelect = document.getElementById('payment-method') as HTMLSelectElement;
    await user.selectOptions(paymentMethodSelect, 'efectivo');

    await user.click(screen.getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });
  });

  it('validates required fields before advancing', async () => {
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => expect(currentStep()).toMatch(/Cliente/));
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    
    // Should show validation error and stay on Step 1
    expect(await screen.findByText(/Selecciona un cliente/)).toBeInTheDocument();
    expect(currentStep()).toMatch(/Cliente/);
  });

  it('la casilla de autorizar en recepcion no sale sin lineas y si sale con una', async () => {
    const user = userEvent.setup();
    renderModal();

    // Paso 1: Cliente
    await waitFor(() => expect(currentStep()).toMatch(/Cliente/));
    const customerSelect = screen.getByRole('combobox');
    await user.selectOptions(customerSelect, CUSTOMER.id);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    // Paso 2: Vehículo
    await waitFor(() => expect(currentStep()).toMatch(/Vehículo/));
    const vehicleSelect = screen.getAllByRole('combobox')[0];
    await user.selectOptions(vehicleSelect, VEHICLE.id);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    // Paso 3: Trabajos
    await waitFor(() => expect(currentStep()).toMatch(/Trabajos/));

    // Sin líneas: no debe existir el checkbox
    expect(document.getElementById('order-authorized-at-intake')).toBeNull();

    // Agregamos un trabajo
    await user.click(document.getElementById('create-order-open') as HTMLElement);
    const laborDesc = document.getElementById('create-order-description') as HTMLInputElement;
    await user.type(laborDesc, 'Alineacion');
    const laborCost = document.getElementById('create-order-price') as HTMLInputElement;
    await user.type(laborCost, '100');
    await user.click(document.getElementById('create-order-submit') as HTMLElement);

    // Con una línea: sí aparece y viene desmarcada
    const checkbox = document.getElementById('order-authorized-at-intake') as HTMLInputElement;
    expect(checkbox).not.toBeNull();
    expect(checkbox.checked).toBe(false);
  });

  it('no duplica los mensajes de error al validar un vehículo nuevo', async () => {
    const user = userEvent.setup();
    renderModal();

    await waitFor(() => expect(currentStep()).toMatch(/Cliente/));
    await user.selectOptions(screen.getByRole('combobox'), CUSTOMER.id);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(currentStep()).toMatch(/Vehículo/));
    await user.selectOptions(screen.getAllByRole('combobox')[0], '__new__');

    const vinInput = document.getElementById('vehicle-vin') as HTMLInputElement;
    await user.type(vinInput, '1HG');
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    const brandError = getTranslation('es', 'vehicles.brandRequired');
    const modelError = getTranslation('es', 'vehicles.modelRequired');
    const yearError = getTranslation('es', 'vehicles.yearRequired');
    const vinError = getTranslation('es', 'vehicles.vinLength');

    expect(await screen.findAllByText(brandError)).toHaveLength(1);
    expect(screen.getAllByText(modelError)).toHaveLength(1);
    expect(screen.getAllByText(yearError)).toHaveLength(1);
    expect(screen.getAllByText((text) => text.startsWith(vinError))).toHaveLength(1);
    expect(screen.queryAllByText(getTranslation('es', 'workOrders.validation.vehicleBrand'))).toHaveLength(0);
    expect(screen.queryAllByText(getTranslation('es', 'workOrders.validation.vehicleModel'))).toHaveLength(0);
    expect(screen.queryAllByText(getTranslation('es', 'workOrders.validation.vinLength'))).toHaveLength(0);
  });

  it('cancels the markAdded highlight timeout when unmounting', async () => {
    const user = userEvent.setup();
    const { unmount } = renderModal();

    await waitFor(() => expect(currentStep()).toMatch(/Cliente/));
    await user.selectOptions(screen.getByRole('combobox'), CUSTOMER.id);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(currentStep()).toMatch(/Vehículo/));
    await user.selectOptions(screen.getAllByRole('combobox')[0], VEHICLE.id);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    await waitFor(() => expect(currentStep()).toMatch(/Trabajos/));

    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');
    const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');
    try {
      await user.click(document.getElementById('create-order-open') as HTMLElement);
      await user.type(document.getElementById('create-order-description') as HTMLInputElement, 'Alineacion');
      await user.type(document.getElementById('create-order-price') as HTMLInputElement, '100');
      await user.click(document.getElementById('create-order-submit') as HTMLElement);

      const timerIndices = setTimeoutSpy.mock.calls
        .map((call, idx) => (call[1] === 2500 ? idx : -1))
        .filter((idx) => idx !== -1);
      expect(timerIndices).toHaveLength(1);
      const timerHandle = setTimeoutSpy.mock.results[timerIndices[0]]?.value;
      expect(timerHandle).toBeDefined();

      unmount();

      expect(clearTimeoutSpy).toHaveBeenCalledWith(timerHandle);
    } finally {
      setTimeoutSpy.mockRestore();
      clearTimeoutSpy.mockRestore();
    }
  });
});
