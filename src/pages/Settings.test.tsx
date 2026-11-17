// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders, authValue, ADMIN_USER, SEDE_CENTRO, SEDE_NORTE } from '../test/renderWithProviders';

const mocks = vi.hoisted(() => ({
  auth: { current: null as ReturnType<typeof import('../test/renderWithProviders').authValue> | null },
  getSedes: vi.fn(),
  getUsers: vi.fn(),
  updateSede: vi.fn(),
}));

vi.mock('../context/auth.context', () => ({ useAuth: () => mocks.auth.current }));

vi.mock('../services/sedes.service', () => ({
  sedesService: {
    getSedes: mocks.getSedes,
    updateSede: mocks.updateSede,
    uploadSedeLogo: vi.fn(),
    createSede: vi.fn(),
    getDeleteImpact: vi.fn(),
    deleteSede: vi.fn(),
    deleteSedeCascade: vi.fn(),
  },
}));
vi.mock('../services/users.service', () => ({
  usersService: {
    getUsers: mocks.getUsers,
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    createUser: vi.fn(),
    deleteUser: vi.fn(),
  },
}));

vi.mock('../features/notifications/PushSettingsCard', () => ({ default: () => null }));
vi.mock('../features/settings/EmailOutboxCard', () => ({ default: () => null }));
vi.mock('../features/settings/ProblemReportCard', () => ({ default: () => null }));
vi.mock('../features/parking/ParkingSettingsCard', () => ({ default: () => null }));
vi.mock('../features/catalog/JobCatalogCard', () => ({ default: () => null }));
vi.mock('../features/inspection/InspectionTemplatesCard', () => ({ default: () => null }));

const { default: Settings } = await import('./Settings');

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.current = authValue(ADMIN_USER);
  mocks.getSedes.mockResolvedValue([SEDE_CENTRO]);
  mocks.getUsers.mockResolvedValue([ADMIN_USER]);
});

describe('Settings', () => {
  it('avisa con error y marca aria-invalid al guardar un taller sin nombre', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Settings />);

    const nameInput = await screen.findByDisplayValue(SEDE_CENTRO.nombre);
    const sedeCard = nameInput.closest('.card') as HTMLElement;

    await user.clear(nameInput);
    await user.click(within(sedeCard).getAllByRole('button', { name: 'Guardar' })[0]);

    expect(mocks.updateSede).not.toHaveBeenCalled();
    expect(nameInput).toHaveAttribute('aria-invalid', 'true');
    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument();
  });

  it('guardar una sede no pisa los borradores sin guardar de otra sede y su grilla no desborda en 390 px', async () => {
    const updatedNorte = { ...SEDE_NORTE, nombre: 'Taller Norte Renovado' };
    mocks.getSedes.mockResolvedValueOnce([SEDE_CENTRO, SEDE_NORTE]).mockResolvedValueOnce([SEDE_CENTRO, updatedNorte]);
    mocks.updateSede.mockResolvedValue(updatedNorte);
    const user = userEvent.setup();

    renderWithProviders(<Settings />);

    const centroNameInput = await screen.findByDisplayValue(SEDE_CENTRO.nombre);
    const grid = centroNameInput.closest('[style*="grid-template-columns"]') as HTMLElement;
    expect(grid.style.gridTemplateColumns).toContain('min(320px, 100%)');

    const norteNameInput = screen.getByDisplayValue(SEDE_NORTE.nombre);
    const norteCard = norteNameInput.closest('div[style*="padding"]') as HTMLElement;

    // Deja un cambio sin guardar en Taller Centro
    await user.clear(centroNameInput);
    await user.type(centroNameInput, 'Taller Centro Borrador');

    // Cambia y guarda Taller Norte (refresca las sedes desde el servidor)
    await user.clear(norteNameInput);
    await user.type(norteNameInput, 'Taller Norte Renovado');
    await user.click(within(norteCard).getByRole('button', { name: 'Guardar' }));

    expect(await screen.findByText('Sede actualizada')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Taller Centro Borrador')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Taller Norte Renovado')).toBeInTheDocument();
  });

  it('handleSaveOperations avisa con toast de error al validar capacidad inválida sin recuadro .alert-error', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Settings />);

    const nameInput = await screen.findByDisplayValue(SEDE_CENTRO.nombre);
    const sedeCard = nameInput.closest('.card');
    if (!(sedeCard instanceof HTMLElement)) throw new Error('Expected .card container');

    const capacityInput = document.getElementById(`sede-capacity-${SEDE_CENTRO.id}`);
    if (!(capacityInput instanceof HTMLInputElement)) throw new Error('Expected capacity input');

    await user.clear(capacityInput);
    await user.type(capacityInput, '0');
    await user.click(within(sedeCard).getByRole('button', { name: 'Actualizar' }));

    expect(mocks.updateSede).not.toHaveBeenCalled();
    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('La capacidad debe ser un número mayor que cero.')).toBeInTheDocument();
    expect(container.querySelector('.alert-error')).toBeNull();
  });

  it('handleSaveOperations avisa con toast de error si updateSede falla sin recuadro .alert-error', async () => {
    mocks.updateSede.mockRejectedValueOnce(new Error('Fallo de red'));
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Settings />);

    const nameInput = await screen.findByDisplayValue(SEDE_CENTRO.nombre);
    const sedeCard = nameInput.closest('.card');
    if (!(sedeCard instanceof HTMLElement)) throw new Error('Expected .card container');

    const capacityInput = document.getElementById(`sede-capacity-${SEDE_CENTRO.id}`);
    if (!(capacityInput instanceof HTMLInputElement)) throw new Error('Expected capacity input');

    await user.clear(capacityInput);
    await user.type(capacityInput, '12');
    await user.click(within(sedeCard).getByRole('button', { name: 'Actualizar' }));

    const alert = await screen.findByRole('alert');
    expect(within(alert).getByText('No se pudo guardar la sede')).toBeInTheDocument();
    expect(within(alert).getByText('Fallo de red')).toBeInTheDocument();
    expect(container.querySelector('.alert-error')).toBeNull();
  });

  it('muestra el recuadro .alert-error solo cuando falla la carga inicial de sedes', async () => {
    mocks.getSedes.mockRejectedValueOnce(new Error('Sin conexión'));
    const { container } = renderWithProviders(<Settings />);

    const errorEl = await screen.findByText('Sin conexión');
    expect(errorEl.closest('.alert-error')).not.toBeNull();
    expect(container.querySelector('.alert-error')).not.toBeNull();
  });
});
