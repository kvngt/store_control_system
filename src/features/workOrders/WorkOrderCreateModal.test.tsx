/** @vitest-environment jsdom */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkOrderCreateModal from './WorkOrderCreateModal';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ToastProvider } from '../../context/ToastContext';
import { workOrdersService } from '../../services/workOrders.service';
import * as mediaService from '../../services/media.service';
import { customersService } from '../../services/customers.service';
import { vehiclesService } from '../../services/vehicles.service';
import { usersService } from '../../services/users.service';

vi.mock('../../services/workOrders.service');
vi.mock('../../services/media.service');
vi.mock('../../services/customers.service');
vi.mock('../../services/vehicles.service');
vi.mock('../../services/users.service');

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false } },
});

const CUSTOMER = {
  id: 'cli-1',
  sede_id: 'sede-1',
  nombre: 'Juan Perez',
  telefono: '5551234567',
  email: '',
  direccion: '',
  creado_el: '2026-01-01',
};

const VEHICLE = {
  id: 'veh-1',
  cliente_id: 'cli-1',
  sede_id: 'sede-1',
  marca: 'Toyota',
  modelo: 'Camry',
  anio: 2018,
  vin: '1HGCM82633A000000',
  placa: 'ABC1234',
  color: 'Rojo',
  creado_el: '2026-01-01',
};

const OPERATOR = {
  id: 'usr-1',
  sede_id: 'sede-1',
  nombre: 'Mecanico Bob',
  rol: 'mecanico' as const,
  reparto_heredado: false,
};

import { useWorkOrderForm } from './useWorkOrderForm';

const mockSubmit = vi.fn();

function TestWrapper() {
  const form = useWorkOrderForm(true); // isAdmin = true
  return (
    <WorkOrderCreateModal
      form={form}
      customers={[CUSTOMER] as any}
      vehiclesForCustomer={[VEHICLE] as any}
      operators={[OPERATOR] as any}
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
    vi.mocked(customersService.getCustomers).mockResolvedValue([CUSTOMER] as any);
    vi.mocked(vehiclesService.getVehicles).mockResolvedValue([VEHICLE] as any);
    vi.mocked(usersService.getOperators).mockResolvedValue([OPERATOR] as any);
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
    expect(await screen.findByText('Nueva Orden - Paso 1 de 4', { selector: '.modal-title' })).toBeInTheDocument();
    const customerSelect = screen.getByRole('combobox');
    await user.selectOptions(customerSelect, CUSTOMER.id);
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    // Paso 2: Vehículo
    expect(await screen.findByText('Nueva Orden - Paso 2 de 4', { selector: '.modal-title' })).toBeInTheDocument();
    const vehicleSelect = screen.getAllByRole('combobox')[0];
    await user.selectOptions(vehicleSelect, VEHICLE.id);
    const milesIn = document.getElementById('order-miles-in') as HTMLInputElement;
    await user.type(milesIn, '50000');
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    // Paso 3: Depósito
    expect(await screen.findByText('Nueva Orden - Paso 3 de 4', { selector: '.modal-title' })).toBeInTheDocument();
    const depositInput = document.getElementById('order-deposit') as HTMLInputElement;
    await user.type(depositInput, '100');
    const paymentMethodSelect = document.getElementById('payment-method') as HTMLSelectElement;
    await user.selectOptions(paymentMethodSelect, 'efectivo');
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));

    // Paso 4: Trabajos
    expect(await screen.findByText('Nueva Orden - Paso 4 de 4', { selector: '.modal-title' })).toBeInTheDocument();
    
    // Fill Labor using TaskEditor
    await user.click(document.getElementById('create-order-open') as HTMLElement);
    const laborDesc = document.getElementById('create-order-description') as HTMLInputElement;
    await user.type(laborDesc, 'Mantenimiento');
    const laborCost = document.getElementById('create-order-price') as HTMLInputElement;
    await user.type(laborCost, '500');
    const assignSelect = document.getElementById('create-order-technician') as HTMLSelectElement;
    await user.selectOptions(assignSelect, OPERATOR.id);
    await user.click(document.getElementById('create-order-submit') as HTMLElement);
    
    await user.click(screen.getByRole('button', { name: /^Crear$/i }));

    await waitFor(() => {
      expect(mockSubmit).toHaveBeenCalled();
    });
  });

  it('validates required fields before advancing', async () => {
    const user = userEvent.setup();
    renderModal();

    expect(await screen.findByText('Nueva Orden - Paso 1 de 4', { selector: '.modal-title' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Siguiente/ }));
    
    // Should show validation error and stay on Step 1
    expect(await screen.findByText(/Selecciona un cliente/)).toBeInTheDocument();
    expect(screen.getByText('Nueva Orden - Paso 1 de 4', { selector: '.modal-title' })).toBeInTheDocument();
  });
});
