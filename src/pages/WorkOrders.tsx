import { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import SignatureCanvas from 'react-signature-canvas';
import { useLanguage } from '../context/LanguageContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useUnsavedChanges } from '../context/UnsavedChangesContext';
import { supabaseService } from '../services/supabaseService';
import { getErrorMessage } from '../lib/errors';
import { trimmedSignatureDataUrl } from '../lib/signature';
import type { WorkOrder, Customer, Vehicle, UserProfile, OrderStatus } from '../types/database';
import {
  Plus,
  Search,
  Eye,
  Car,
  ChevronLeft,
  Calendar,
  Fuel,
  DollarSign,
  User,
  Wrench,
  Paintbrush,
  Camera,
  X,
  CheckCircle2,
  Trash2,
  ChevronRight,
  ChevronDown,
  Pencil,
  Check,
  FileDown,
  MessageSquarePlus,
  PenLine,
  ImagePlus,
} from 'lucide-react';

interface PhotoZone {
  key: string;
  label: string;
  file: File;
  preview: string;
}

const ZONES: { key: string; label: string }[] = [
  { key: 'front', label: 'Frontal' },
  { key: 'rear', label: 'Trasera' },
  { key: 'left', label: 'Izquierda' },
  { key: 'right', label: 'Derecha' },
  { key: 'interior', label: 'Interior' },
  { key: 'fuel', label: 'Tablero' },
];

interface LaborRow { descripcion: string; costo: string }
// `costo_unitario` is what the shop paid for the part; `precio_venta_unitario`
// is what the customer is charged. The first one is what lands in Finanzas as
// an expense when the order is delivered, so leaving it blank silently
// overstates the shop's profit.
interface PartRow { descripcion: string; cantidad: string; costo_unitario: string; precio_venta_unitario: string }

export default function WorkOrders() {
  const { t, language } = useLanguage();
  const { user, currentSede } = useAuth();
  const { showToast } = useToast();
  const { setGuard } = useUnsavedChanges();
  const [searchParams, setSearchParams] = useSearchParams();
  const isAdmin = user?.rol === 'admin';
  const sedeId = isAdmin ? currentSede?.id : user?.sede_id;

  const [orders, setOrders] = useState<WorkOrder[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [operators, setOperators] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [showOtherOrders, setShowOtherOrders] = useState(false);
  const [viewOrder, setViewOrder] = useState<WorkOrder | null>(null);
  const [viewLoading, setViewLoading] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [newLaborDraft, setNewLaborDraft] = useState({ descripcion: '', costo: '' });
  const [newPartDraft, setNewPartDraft] = useState({ descripcion: '', cantidad: '1', costo_unitario: '', precio_venta_unitario: '' });
  const [addingOperatorId, setAddingOperatorId] = useState('');
  const [detailBusy, setDetailBusy] = useState(false);
  const [editingLaborId, setEditingLaborId] = useState<string | null>(null);
  const [editLaborDraft, setEditLaborDraft] = useState({ descripcion: '', costo: '' });
  const [editingPartId, setEditingPartId] = useState<string | null>(null);
  const [editPartDraft, setEditPartDraft] = useState({ descripcion: '', cantidad: '', costo_unitario: '', precio_venta_unitario: '' });
  const [progressDraft, setProgressDraft] = useState<string>('0');
  const [newProgressNote, setNewProgressNote] = useState('');
  const [newProgressPhotos, setNewProgressPhotos] = useState<File[]>([]);
  const progressFileInputRef = useRef<HTMLInputElement>(null);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // Create modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState('');
  const [selectedVehicle, setSelectedVehicle] = useState('');
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [vehicleMode, setVehicleMode] = useState<'existing' | 'new'>('existing');
  const [newCustomer, setNewCustomer] = useState({ nombre: '', telefono: '', email: '', direccion: '' });
  const [newVehicle, setNewVehicle] = useState({
    marca: '', modelo: '', anio: String(new Date().getFullYear()), vin: '', placa: '', color: '',
  });
  const [workType, setWorkType] = useState<'mecanica' | 'pintura' | 'combinado'>('mecanica');
  const [fuelLevel, setFuelLevel] = useState('1/2');
  const [milesIn, setMilesIn] = useState('');
  const [milesError, setMilesError] = useState('');
  const [deposit, setDeposit] = useState('0');
  const [estimatedDate, setEstimatedDate] = useState('');
  const [inspectionNotes, setInspectionNotes] = useState('');
  const [photos, setPhotos] = useState<Record<string, PhotoZone>>({});
  const [selectedOperators, setSelectedOperators] = useState<string[]>([]);
  const [laborItems, setLaborItems] = useState<LaborRow[]>([]);
  const [parts, setParts] = useState<PartRow[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeZone, setActiveZone] = useState<string | null>(null);
  const extraInputRef = useRef<HTMLInputElement>(null);
  const sigPadRef = useRef<SignatureCanvas>(null);
  const sigWrapRef = useRef<HTMLDivElement>(null);
  const [sigWidth, setSigWidth] = useState(560);
  const [savingSignature, setSavingSignature] = useState(false);

  const extraPhotos = Object.values(photos).filter((ph) => !ZONES.some((z) => z.key === ph.key));
  const zonesCovered = ZONES.filter((z) => photos[z.key]).length;

  const statusLabels: Record<string, string> = {
    recepcion: t('workOrders.intake'),
    en_proceso: t('workOrders.inProgress'),
    espera_repuestos: t('workOrders.waitingParts'),
    finalizado: t('workOrders.completed'),
    entregado: t('workOrders.delivered'),
  };

  const loadOrders = useCallback(() => {
    setLoading(true);
    setError('');
    supabaseService
      .getWorkOrders(sedeId)
      .then(setOrders)
      .catch((err) => setError(getErrorMessage(err, language)))
      .finally(() => setLoading(false));
  }, [sedeId, language]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    supabaseService.getCustomers(sedeId).then(setCustomers).catch(() => {});
    supabaseService.getVehicles(sedeId).then(setVehicles).catch(() => {});
    supabaseService.getOperators(sedeId).then(setOperators).catch(() => {});
  }, [sedeId]);

  const filtered = orders.filter((o) => {
    const matchSearch =
      o.numero_orden.toLowerCase().includes(search.toLowerCase()) ||
      (o.cliente?.nombre || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = filterStatus === 'all' || o.estatus === filterStatus;
    return matchSearch && matchStatus;
  });

  // A mechanic/painter opens this screen to work, not to browse: their own
  // orders come first, and the rest of the sede's board is a second section
  // they can expand when they need it. Admins keep the single combined list.
  const isMine = (order: WorkOrder) => (order.asignaciones || []).some((a) => a.usuario_id === user?.id);
  const myOrders = filtered.filter(isMine);
  const otherOrders = filtered.filter((o) => !isMine(o));

  const vehiclesForCustomer = vehicles.filter((v) => v.cliente_id === selectedCustomer);

  const handleSelectCustomer = (value: string) => {
    if (value === '__new__') {
      setCustomerMode('new');
      setVehicleMode('new');
      setSelectedCustomer('');
      setSelectedVehicle('');
    } else {
      setSelectedCustomer(value);
      setSelectedVehicle('');
    }
  };

  const handleSelectVehicle = (value: string) => {
    if (value === '__new__') {
      setVehicleMode('new');
      setSelectedVehicle('');
    } else {
      setSelectedVehicle(value);
    }
  };

  // An odometer never runs backwards, so the field only accepts digits: a typed
  // or pasted minus sign is dropped rather than silently rounded to 0 later.
  // `min={0}` alone wouldn't do it — the browser still lets "-5" be typed and
  // only complains at submit time. The DB carries the same rule as a CHECK
  // constraint, so a direct API call can't get around the form either.
  const handleMilesChange = (raw: string) => {
    const isNegative = raw.trim().startsWith('-');
    // millas_ingreso is an INTEGER column, so decimals are truncated rather
    // than having their point stripped (which would turn 12.5 into 125).
    const cleaned = raw.replace(/[^0-9.]/g, '').split('.')[0];
    setMilesError(isNegative ? t('workOrders.milesNegative') : '');
    setMilesIn(cleaned);
  };

  const handleZoneClick = (zoneKey: string) => {
    setActiveZone(zoneKey);
    fileInputRef.current?.click();
  };

  // Photos beyond the six fixed zones: damage close-ups, paperwork, anything
  // the six-tile grid can't anticipate. They're appended with generated keys
  // so the fixed zones keep their meaning.
  const handleExtraFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      setPhotos((prev) => {
        const next = { ...prev };
        let n = Object.keys(prev).filter((k) => k.startsWith('extra-')).length;
        files.forEach((file) => {
          n += 1;
          const key = `extra-${Date.now()}-${n}`;
          next[key] = { key, label: `Extra ${n}`, file, preview: URL.createObjectURL(file) };
        });
        return next;
      });
    }
    e.target.value = '';
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && activeZone) {
      const preview = URL.createObjectURL(file);
      const label = ZONES.find((z) => z.key === activeZone)?.label || activeZone;
      setPhotos((prev) => ({ ...prev, [activeZone]: { key: activeZone, label, file, preview } }));
    }
    e.target.value = '';
  };

  const resetForm = () => {
    setSelectedCustomer('');
    setSelectedVehicle('');
    setCustomerMode('existing');
    setVehicleMode('existing');
    setNewCustomer({ nombre: '', telefono: '', email: '', direccion: '' });
    setNewVehicle({ marca: '', modelo: '', anio: String(new Date().getFullYear()), vin: '', placa: '', color: '' });
    setWorkType('mecanica');
    setFuelLevel('1/2');
    setMilesIn('');
    setMilesError('');
    setDeposit('0');
    setEstimatedDate('');
    setInspectionNotes('');
    setPhotos({});
    setSelectedOperators([]);
    setLaborItems([]);
    setParts([]);
  };

  // Is there anything typed in the create-order form worth protecting?
  const isCreateFormDirty = () =>
    !!selectedCustomer ||
    !!selectedVehicle ||
    newCustomer.nombre.trim() !== '' ||
    newCustomer.telefono.trim() !== '' ||
    newVehicle.marca.trim() !== '' ||
    newVehicle.modelo.trim() !== '' ||
    newVehicle.vin.trim() !== '' ||
    milesIn.trim() !== '' ||
    (deposit.trim() !== '' && deposit !== '0') ||
    estimatedDate.trim() !== '' ||
    inspectionNotes.trim() !== '' ||
    Object.keys(photos).length > 0 ||
    selectedOperators.length > 0 ||
    laborItems.length > 0 ||
    parts.length > 0;

  const handleCloseCreateModal = () => {
    if (isCreateFormDirty() && !confirm(t('workOrders.confirmDiscard'))) {
      return;
    }
    setShowCreateModal(false);
    resetForm();
  };

  // Register a navigation guard for as long as the create-order modal has
  // unsaved data, so the sidebar/global search can't silently navigate away
  // and lose it.
  useEffect(() => {
    if (showCreateModal) {
      setGuard(() => !isCreateFormDirty() || confirm(t('workOrders.confirmDiscard')));
    } else {
      setGuard(null);
    }
    return () => setGuard(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCreateModal, selectedCustomer, selectedVehicle, newCustomer, newVehicle, milesIn, deposit, estimatedDate, inspectionNotes, photos, selectedOperators, laborItems, parts]);

  const removePhoto = (zoneKey: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPhotos((prev) => {
      const next = { ...prev };
      delete next[zoneKey];
      return next;
    });
  };

  const toggleOperator = (id: string) => {
    setSelectedOperators((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (customerMode === 'existing' && !selectedCustomer) return;
    if (customerMode === 'new' && (!newCustomer.nombre.trim() || !newCustomer.telefono.trim())) {
      setError(t('customers.newCustomer') + ': ' + t('common.name') + ' / ' + t('common.phone'));
      return;
    }
    if (vehicleMode === 'existing' && !selectedVehicle) return;
    if (vehicleMode === 'new' && (!newVehicle.marca.trim() || !newVehicle.modelo.trim() || !newVehicle.vin.trim())) {
      setError(t('vehicles.newVehicle') + ': ' + t('vehicles.brand') + ' / ' + t('vehicles.model') + ' / ' + t('vehicles.vin'));
      return;
    }

    setSaving(true);
    setError('');
    try {
      const targetSedeId = sedeId || currentSede?.id || '';

      let customerId = selectedCustomer;
      if (customerMode === 'new') {
        const created = await supabaseService.createCustomer({
          nombre: newCustomer.nombre,
          telefono: newCustomer.telefono,
          email: newCustomer.email,
          direccion: newCustomer.direccion,
          notas_crm: '',
          sede_id: targetSedeId,
        });
        customerId = created.id;
        // Switch to "existing" immediately: if a later step in this same
        // submission fails and the user retries, we must not create this
        // customer a second time.
        setCustomerMode('existing');
        setSelectedCustomer(created.id);
      }

      let vehicleId = selectedVehicle;
      if (vehicleMode === 'new') {
        const createdVehicle = await supabaseService.createVehicle({
          cliente_id: customerId,
          marca: newVehicle.marca,
          modelo: newVehicle.modelo,
          anio: parseInt(newVehicle.anio, 10) || new Date().getFullYear(),
          vin: newVehicle.vin,
          placa: newVehicle.placa,
          color: newVehicle.color,
        });
        vehicleId = createdVehicle.id;
        setVehicleMode('existing');
        setSelectedVehicle(createdVehicle.id);
      }

      // Admins pick who works the order; a mechanic/painter creating one is
      // always assigned to themselves (they can't assign colleagues — those
      // join the order themselves from the order detail).
      const asignaciones = isAdmin
        ? selectedOperators.map((id) => {
            const op = operators.find((o) => o.id === id);
            return { usuario_id: id, tipo_tarea: (op?.rol === 'pintor' ? 'pintura' : 'mecanica') as 'mecanica' | 'pintura' };
          })
        : [{ usuario_id: user.id, tipo_tarea: (user.rol === 'pintor' ? 'pintura' : 'mecanica') as 'mecanica' | 'pintura' }];

      const order = await supabaseService.createWorkOrder({
        sede_id: targetSedeId,
        cliente_id: customerId,
        vehiculo_id: vehicleId,
        tipo_trabajo: workType,
        millas_ingreso: Math.max(0, parseInt(milesIn, 10) || 0),
        nivel_gasolina: fuelLevel,
        deposito_inicial: parseFloat(deposit) || 0,
        inspeccion_360_notas: inspectionNotes,
        fecha_estimada_entrega: estimatedDate || new Date(Date.now() + 5 * 86400000).toISOString().split('T')[0],
        labor_items: laborItems
          .filter((l) => l.descripcion.trim())
          .map((l) => ({ descripcion: l.descripcion, costo: parseFloat(l.costo) || 0 })),
        repuestos: parts
          .filter((p) => p.descripcion.trim())
          .map((p) => ({
            descripcion: p.descripcion,
            cantidad: parseInt(p.cantidad, 10) || 1,
            costo_unitario: parseFloat(p.costo_unitario) || 0,
            precio_venta_unitario: parseFloat(p.precio_venta_unitario) || 0,
          })),
        asignaciones,
        creado_por: user.id,
      });

      const photoFiles = Object.values(photos).map((p) => ({ zone: p.key, file: p.file }));
      if (photoFiles.length) {
        await supabaseService.uploadOrderPhotos(order.id, photoFiles);
      }

      setShowCreateModal(false);
      resetForm();
      loadOrders();
      if (customerMode === 'new' || vehicleMode === 'new') {
        supabaseService.getCustomers(sedeId).then(setCustomers).catch(() => {});
        supabaseService.getVehicles(sedeId).then(setVehicles).catch(() => {});
      }
      openDetail(order.id);
      showToast('success', `${t('workOrders.orderCreatedSuccess')} (${order.numero_orden})`);
    } catch (err) {
      const message = getErrorMessage(err, language);
      setError(message);
      showToast('error', t('workOrders.orderCreatedError'), message);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteOrder = async (order: WorkOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`${t('workOrders.confirmDelete')} ${order.numero_orden}?`)) return;
    try {
      await supabaseService.deleteWorkOrder(order.id);
      loadOrders();
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

  const openDetail = async (orderId: string) => {
    setViewLoading(true);
    setError('');
    try {
      const detail = await supabaseService.getWorkOrderDetail(orderId);
      setViewOrder(detail);
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setViewLoading(false);
    }
  };

  // Deep link from the global header search: /work-orders?open=<id>
  useEffect(() => {
    const openId = searchParams.get('open');
    if (openId) {
      openDetail(openId);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Keep the manual progress input in sync with whichever order is open.
  useEffect(() => {
    if (viewOrder) {
      setProgressDraft(String(viewOrder.porcentaje_avance));
    }
  }, [viewOrder?.id, viewOrder?.porcentaje_avance]);

  // A technician may only touch an order they are actually assigned to.
  // Admins can always edit. Joining an order is the way in.
  const isAssignedToMe = (viewOrder?.asignaciones || []).some((a) => a.usuario_id === user?.id);
  const canEditOrder = isAdmin || isAssignedToMe;
  const canEditProgress = canEditOrder && viewOrder?.estatus === 'en_proceso';
  const orderIsComplete = viewOrder?.estatus === 'finalizado' || viewOrder?.estatus === 'entregado';

  const handleStatusChange = async (status: OrderStatus) => {
    if (!viewOrder) return;
    if (status === 'entregado' && viewOrder.estatus !== 'entregado' && !confirm(t('workOrders.confirmDeliver'))) {
      return;
    }
    try {
      await supabaseService.updateWorkOrderStatus(viewOrder.id, status);
      openDetail(viewOrder.id);
      loadOrders();
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

  const handleProgressChange = async (value: number) => {
    if (!viewOrder || !canEditProgress) return;
    const clamped = Math.min(100, Math.max(0, value));
    setProgressDraft(String(clamped));
    try {
      await supabaseService.updateWorkOrderProgress(viewOrder.id, clamped);
      setViewOrder({ ...viewOrder, porcentaje_avance: clamped });
      loadOrders();
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

  const handleAddLabor = async () => {
    if (!viewOrder || !newLaborDraft.descripcion.trim()) return;
    setDetailBusy(true);
    try {
      await supabaseService.addLaborItem(viewOrder.id, {
        descripcion: newLaborDraft.descripcion,
        costo: parseFloat(newLaborDraft.costo) || 0,
      });
      setNewLaborDraft({ descripcion: '', costo: '' });
      await openDetail(viewOrder.id);
      loadOrders();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setDetailBusy(false);
    }
  };

  const handleRemoveLabor = async (id: string, descripcion: string) => {
    if (!viewOrder) return;
    if (!confirm(`${t('common.delete')}: ${descripcion}?`)) return;
    try {
      await supabaseService.removeLaborItem(id);
      await openDetail(viewOrder.id);
      loadOrders();
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

  const startEditLabor = (item: { id: string; descripcion: string; costo: number }) => {
    setEditingLaborId(item.id);
    setEditLaborDraft({ descripcion: item.descripcion, costo: String(item.costo) });
  };

  const handleSaveLaborEdit = async () => {
    if (!viewOrder || !editingLaborId || !editLaborDraft.descripcion.trim()) return;
    setDetailBusy(true);
    try {
      await supabaseService.updateLaborItem(editingLaborId, {
        descripcion: editLaborDraft.descripcion,
        costo: parseFloat(editLaborDraft.costo) || 0,
      });
      setEditingLaborId(null);
      await openDetail(viewOrder.id);
      loadOrders();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setDetailBusy(false);
    }
  };

  const handleAddPart = async () => {
    if (!viewOrder || !newPartDraft.descripcion.trim()) return;
    setDetailBusy(true);
    try {
      await supabaseService.addPart(viewOrder.id, {
        descripcion: newPartDraft.descripcion,
        cantidad: parseInt(newPartDraft.cantidad, 10) || 1,
        costo_unitario: parseFloat(newPartDraft.costo_unitario) || 0,
        precio_venta_unitario: parseFloat(newPartDraft.precio_venta_unitario) || 0,
      });
      setNewPartDraft({ descripcion: '', cantidad: '1', costo_unitario: '', precio_venta_unitario: '' });
      await openDetail(viewOrder.id);
      loadOrders();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setDetailBusy(false);
    }
  };

  const handleRemovePart = async (id: string, descripcion: string) => {
    if (!viewOrder) return;
    if (!confirm(`${t('common.delete')}: ${descripcion}?`)) return;
    try {
      await supabaseService.removePart(id);
      await openDetail(viewOrder.id);
      loadOrders();
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

  const startEditPart = (part: { id: string; descripcion: string; cantidad: number; costo_unitario: number; precio_venta_unitario: number }) => {
    setEditingPartId(part.id);
    setEditPartDraft({
      descripcion: part.descripcion,
      cantidad: String(part.cantidad),
      costo_unitario: String(part.costo_unitario ?? 0),
      precio_venta_unitario: String(part.precio_venta_unitario),
    });
  };

  const handleSavePartEdit = async () => {
    if (!viewOrder || !editingPartId || !editPartDraft.descripcion.trim()) return;
    setDetailBusy(true);
    try {
      await supabaseService.updatePart(editingPartId, {
        descripcion: editPartDraft.descripcion,
        cantidad: parseInt(editPartDraft.cantidad, 10) || 1,
        costo_unitario: parseFloat(editPartDraft.costo_unitario) || 0,
        precio_venta_unitario: parseFloat(editPartDraft.precio_venta_unitario) || 0,
      });
      setEditingPartId(null);
      await openDetail(viewOrder.id);
      loadOrders();
    } catch (err) {
      setError(getErrorMessage(err, language));
    } finally {
      setDetailBusy(false);
    }
  };

  const handleAddOperatorToOrder = async () => {
    if (!viewOrder || !addingOperatorId) return;
    const op = operators.find((o) => o.id === addingOperatorId);
    if (!op) return;
    try {
      await supabaseService.addAssignment(viewOrder.id, op.id, op.rol === 'pintor' ? 'pintura' : 'mecanica');
      setAddingOperatorId('');
      await openDetail(viewOrder.id);
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

  // A technician adds themselves to an order they didn't create.
  const handleJoinOrder = async () => {
    if (!viewOrder || !user) return;
    setDetailBusy(true);
    try {
      await supabaseService.addAssignment(
        viewOrder.id,
        user.id,
        user.rol === 'pintor' ? 'pintura' : 'mecanica'
      );
      await openDetail(viewOrder.id);
      showToast('success', t('workOrders.joinedOrder'));
    } catch (err) {
      showToast('error', t('workOrders.joinError'), getErrorMessage(err, language));
    } finally {
      setDetailBusy(false);
    }
  };

  const handleRemoveAssignment = async (id: string, nombre: string) => {
    if (!viewOrder) return;
    if (!confirm(`${t('common.delete')}: ${nombre}?`)) return;
    try {
      await supabaseService.removeAssignment(id);
      await openDetail(viewOrder.id);
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

  const handleAddProgressPhotos = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) {
      setNewProgressPhotos((prev) => [...prev, ...files]);
    }
    e.target.value = '';
  };

  const removeProgressPhotoDraft = (index: number) => {
    setNewProgressPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const handleAddProgressUpdate = async () => {
    if (!viewOrder || !user || !newProgressNote.trim()) return;
    setDetailBusy(true);
    try {
      await supabaseService.addProgressUpdate(viewOrder.id, user.id, newProgressNote, newProgressPhotos);
      setNewProgressNote('');
      setNewProgressPhotos([]);
      await openDetail(viewOrder.id);
      showToast('success', t('workOrders.progressAdded'));
    } catch (err) {
      showToast('error', t('workOrders.progressAddError'), getErrorMessage(err, language));
    } finally {
      setDetailBusy(false);
    }
  };

  const handleRemoveProgressUpdate = async (id: string) => {
    if (!viewOrder) return;
    if (!confirm(t('common.delete') + '?')) return;
    try {
      await supabaseService.removeProgressUpdate(id);
      await openDetail(viewOrder.id);
    } catch (err) {
      setError(getErrorMessage(err, language));
    }
  };

  const handleGeneratePdf = async () => {
    if (!viewOrder) return;
    setGeneratingPdf(true);
    try {
      const { generateWorkOrderPdf } = await import('../lib/workOrderPdf');
      await generateWorkOrderPdf(viewOrder, currentSede);
    } catch (err) {
      showToast('error', t('workOrders.pdfError'), getErrorMessage(err, language));
    } finally {
      setGeneratingPdf(false);
    }
  };

  // signature_pad draws in canvas pixels, so the canvas needs a real width in
  // its width attribute — a CSS-stretched canvas would offset every stroke.
  useEffect(() => {
    const el = sigWrapRef.current;
    if (!el) return;
    const update = () => setSigWidth(el.clientWidth || 560);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [viewOrder?.id, viewOrder?.firma_cliente_url]);

  const handleSaveSignature = async () => {
    const pad = sigPadRef.current;
    if (!viewOrder || !pad) return;
    if (pad.isEmpty()) {
      showToast('error', t('workOrders.signatureEmpty'));
      return;
    }
    setSavingSignature(true);
    try {
      const dataUrl = trimmedSignatureDataUrl(pad.getCanvas());
      const { url, fecha } = await supabaseService.uploadSignature(viewOrder.id, dataUrl);
      setViewOrder((prev) => (prev ? { ...prev, firma_cliente_url: url, firma_fecha: fecha } : prev));
      showToast('success', t('workOrders.signatureSaved'));
    } catch (err) {
      showToast('error', t('workOrders.signatureError'), getErrorMessage(err, language));
    } finally {
      setSavingSignature(false);
    }
  };

  const handleClearStoredSignature = async () => {
    if (!viewOrder) return;
    setSavingSignature(true);
    try {
      await supabaseService.clearSignature(viewOrder.id);
      setViewOrder((prev) => (prev ? { ...prev, firma_cliente_url: null, firma_fecha: null } : prev));
    } catch (err) {
      showToast('error', t('workOrders.signatureError'), getErrorMessage(err, language));
    } finally {
      setSavingSignature(false);
    }
  };

  // Order Detail View
  if (viewOrder) {
    const customer = viewOrder.cliente;
    const vehicle = viewOrder.vehiculo;
    const assignments = viewOrder.asignaciones || [];
    const laborList = viewOrder.labor_items || [];
    const partsList = viewOrder.repuestos || [];
    const totalLabor = laborList.reduce((sum, l) => sum + l.costo, 0);
    const totalParts = partsList.reduce((sum, p) => sum + p.subtotal, 0);
    // What the shop paid, as opposed to what it charges. This is the figure
    // that gets booked as an expense in Finanzas when the order is delivered.
    const totalPartsCost = partsList.reduce((sum, p) => sum + p.cantidad * (p.costo_unitario ?? 0), 0);
    const photoUrls = (viewOrder.inspeccion_360_fotos || []).filter(Boolean) as string[];

    return (
      <div className="animate-fade-in">
        <button className="btn btn-ghost" onClick={() => setViewOrder(null)} style={{ marginBottom: 'var(--space-4)' }}>
          <ChevronLeft size={18} /> {t('common.back')}
        </button>

        {error && <div className="alert-error">{error}</div>}
        {viewLoading && <div className="loading-state"><div className="spinner" /></div>}
        {!canEditOrder && (
          <div className="alert-info">{t('workOrders.readOnlyNotice')}</div>
        )}

        {/* Order Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 'var(--space-6)', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
          <div>
            <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
              {viewOrder.numero_orden}
              <span className={`badge badge-${viewOrder.estatus}`}>{statusLabels[viewOrder.estatus]}</span>
              <span className={`badge badge-${viewOrder.tipo_trabajo}`}>{viewOrder.tipo_trabajo}</span>
              {user?.rol === 'admin' && (
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleGeneratePdf}
                  disabled={generatingPdf}
                  title={t('workOrders.generatePdf')}
                >
                  <FileDown size={14} /> {generatingPdf ? t('common.loading') : t('workOrders.generatePdf')}
                </button>
              )}
            </h1>
            <p className="page-subtitle">{customer?.nombre} — {vehicle?.anio} {vehicle?.marca} {vehicle?.modelo}</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', flexWrap: 'wrap', width: '100%', maxWidth: 460 }}>
            <select
              className="form-input form-select"
              value={viewOrder.estatus}
              onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
              disabled={!canEditOrder}
              style={{ flex: '1 1 160px' }}
            >
              {Object.keys(statusLabels).map((s) => (
                <option key={s} value={s}>{statusLabels[s]}</option>
              ))}
            </select>
            <div style={{ textAlign: 'right', flex: '1 1 180px' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                {t('workOrders.progress')}
                {!canEditProgress && (
                  <span style={{ marginLeft: 6, color: 'var(--color-text-tertiary)' }}>({t('workOrders.progressLocked')})</span>
                )}
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={viewOrder.porcentaje_avance}
                onChange={(e) => handleProgressChange(parseInt(e.target.value, 10))}
                disabled={!canEditProgress}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
                <input
                  className="form-input"
                  type="number"
                  min={0}
                  max={100}
                  value={progressDraft}
                  disabled={!canEditProgress}
                  style={{ width: 70, textAlign: 'right', padding: 'var(--space-1) var(--space-2)', color: orderIsComplete ? 'var(--color-success)' : undefined, fontWeight: orderIsComplete ? 700 : undefined }}
                  onChange={(e) => setProgressDraft(e.target.value)}
                  onBlur={() => handleProgressChange(parseInt(progressDraft, 10) || 0)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.currentTarget.blur(); } }}
                />
                <span style={{ fontSize: 'var(--font-size-lg)', fontWeight: 700, color: orderIsComplete ? 'var(--color-success)' : 'var(--color-primary-light)' }}>%</span>
              </div>
            </div>
          </div>
        </div>

        <div className="responsive-grid-2">
          {/* Vehicle Info */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              <Car size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.vehicleServiceRepair')}
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-3)' }}>
              {[
                [t('vehicles.brand'), `${vehicle?.marca} ${vehicle?.modelo}`],
                [t('vehicles.year'), vehicle?.anio],
                [t('vehicles.vin'), vehicle?.vin],
                [t('vehicles.plate'), vehicle?.placa],
                [t('vehicles.color'), vehicle?.color],
                [t('workOrders.milesIn'), viewOrder.millas_ingreso.toLocaleString()],
              ].map(([label, value], i) => (
                <div key={i} style={{ padding: 'var(--space-2) 0' }}>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginBottom: 2 }}>{label}</div>
                  <div style={{ fontWeight: 500 }}>{value}</div>
                </div>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-4)', marginTop: 'var(--space-4)', padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)' }}>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <Fuel size={16} style={{ color: 'var(--color-warning)' }} />
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('workOrders.fuelLevel')}</div>
                  <div style={{ fontWeight: 600 }}>{viewOrder.nivel_gasolina}</div>
                </div>
              </div>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                <DollarSign size={16} style={{ color: 'var(--color-success)' }} />
                <div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>{t('workOrders.deposit')}</div>
                  <div style={{ fontWeight: 600 }}>${viewOrder.deposito_inicial.toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>

          {/* Inspection 360 */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              <Camera size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.inspection360')}
            </h3>
            <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-4)', lineHeight: 1.6 }}>
              {viewOrder.inspeccion_360_notas}
            </p>

            {photoUrls.length > 0 ? (
              <div className="photo-gallery-grid">
                {photoUrls.map((url, i) => (
                  <button
                    key={i}
                    type="button"
                    className="photo-gallery-thumb"
                    onClick={() => setLightboxUrl(url)}
                  >
                    <img src={url} alt={`foto-${i}`} loading="lazy" />
                  </button>
                ))}
              </div>
            ) : (
              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                {t('common.noResults')}
              </p>
            )}
          </div>

          {/* Customer signature */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-3)' }}>
              <PenLine size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.customerSignature')}
            </h3>

            {viewOrder.firma_cliente_url ? (
              <div>
                <img
                  src={viewOrder.firma_cliente_url}
                  alt={t('workOrders.customerSignature')}
                  className="signature-preview"
                />
                <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)' }}>
                  {customer?.nombre}
                  {viewOrder.firma_fecha &&
                    ` — ${t('workOrders.signedOn')} ${new Date(viewOrder.firma_fecha).toLocaleDateString(
                      language === 'es' ? 'es' : 'en'
                    )}`}
                </p>
                {canEditOrder && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm"
                    onClick={handleClearStoredSignature}
                    disabled={savingSignature}
                    style={{ marginTop: 'var(--space-2)' }}
                  >
                    <Pencil size={14} /> {t('workOrders.resign')}
                  </button>
                )}
              </div>
            ) : canEditOrder ? (
              <>
                <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-3)' }}>
                  {t('workOrders.signatureHint')}
                </p>
                <div className="signature-wrap" ref={sigWrapRef}>
                  <SignatureCanvas
                    ref={sigPadRef}
                    penColor="#111827"
                    canvasProps={{ width: sigWidth, height: 170, className: 'signature-canvas' }}
                  />
                </div>
                <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => sigPadRef.current?.clear()}
                    disabled={savingSignature}
                  >
                    <X size={14} /> {t('workOrders.clearSignature')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary btn-sm"
                    onClick={handleSaveSignature}
                    disabled={savingSignature}
                  >
                    <Check size={14} /> {savingSignature ? t('common.loading') : t('workOrders.saveSignature')}
                  </button>
                </div>
              </>
            ) : (
              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>
                {t('workOrders.noSignature')}
              </p>
            )}
          </div>

          {/* Labor */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              <Wrench size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.laborDescription')}
            </h3>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.description')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.total')}</th>
                    <th style={{ width: 64 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {laborList.map((item) =>
                    editingLaborId === item.id ? (
                      <tr key={item.id}>
                        <td>
                          <input
                            className="form-input"
                            value={editLaborDraft.descripcion}
                            onChange={(e) => setEditLaborDraft({ ...editLaborDraft, descripcion: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input"
                            type="number"
                            style={{ textAlign: 'right' }}
                            value={editLaborDraft.costo}
                            onChange={(e) => setEditLaborDraft({ ...editLaborDraft, costo: e.target.value })}
                          />
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={handleSaveLaborEdit} disabled={detailBusy}>
                              <Check size={14} style={{ color: 'var(--color-success)' }} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingLaborId(null)}>
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={item.id}>
                        <td>{item.descripcion}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>${item.costo.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => startEditLabor(item)} disabled={!canEditOrder}>
                              <Pencil size={14} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => handleRemoveLabor(item.id, item.descripcion)} disabled={!canEditOrder}>
                              <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                  <tr>
                    <td style={{ fontWeight: 700 }}>Total Labor</td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                      ${totalLabor.toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
              <input
                className="form-input"
                placeholder={t('common.description')}
                value={newLaborDraft.descripcion}
                onChange={(e) => setNewLaborDraft({ ...newLaborDraft, descripcion: e.target.value })}
              />
              <input
                className="form-input"
                type="number"
                placeholder="$"
                style={{ maxWidth: 100 }}
                value={newLaborDraft.costo}
                onChange={(e) => setNewLaborDraft({ ...newLaborDraft, costo: e.target.value })}
              />
              <button type="button" className="btn btn-secondary" onClick={handleAddLabor} disabled={!canEditOrder || detailBusy || !newLaborDraft.descripcion.trim()}>
                <Plus size={16} />
              </button>
            </div>
          </div>

          {/* Parts */}
          <div className="card">
            <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
              <Paintbrush size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
              {t('workOrders.partsDescription')}
            </h3>
            <div className="table-container" style={{ border: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>{t('common.description')}</th>
                    <th>{t('common.quantity')}</th>
                    <th style={{ textAlign: 'right' }}>{t('workOrders.unitCost')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.price')}</th>
                    <th style={{ textAlign: 'right' }}>{t('common.subtotal')}</th>
                    <th style={{ width: 64 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {partsList.map((part) =>
                    editingPartId === part.id ? (
                      <tr key={part.id}>
                        <td>
                          <input
                            className="form-input"
                            value={editPartDraft.descripcion}
                            onChange={(e) => setEditPartDraft({ ...editPartDraft, descripcion: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input"
                            type="number"
                            style={{ width: 70 }}
                            value={editPartDraft.cantidad}
                            onChange={(e) => setEditPartDraft({ ...editPartDraft, cantidad: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input"
                            type="number"
                            style={{ width: 90, textAlign: 'right' }}
                            value={editPartDraft.costo_unitario}
                            onChange={(e) => setEditPartDraft({ ...editPartDraft, costo_unitario: e.target.value })}
                          />
                        </td>
                        <td>
                          <input
                            className="form-input"
                            type="number"
                            min={0}
                            style={{ width: 90, textAlign: 'right' }}
                            value={editPartDraft.precio_venta_unitario}
                            onChange={(e) => setEditPartDraft({ ...editPartDraft, precio_venta_unitario: e.target.value })}
                          />
                        </td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>
                          ${((parseFloat(editPartDraft.cantidad) || 0) * (parseFloat(editPartDraft.precio_venta_unitario) || 0)).toFixed(2)}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={handleSavePartEdit} disabled={detailBusy}>
                              <Check size={14} style={{ color: 'var(--color-success)' }} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setEditingPartId(null)}>
                              <X size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      <tr key={part.id}>
                        <td>{part.descripcion}</td>
                        <td>{part.cantidad}</td>
                        <td style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                          ${(part.costo_unitario ?? 0).toFixed(2)}
                        </td>
                        <td style={{ textAlign: 'right' }}>${part.precio_venta_unitario.toFixed(2)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 600 }}>${part.subtotal.toFixed(2)}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 2 }}>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => startEditPart(part)} disabled={!canEditOrder}>
                              <Pencil size={14} />
                            </button>
                            <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => handleRemovePart(part.id, part.descripcion)} disabled={!canEditOrder}>
                              <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  )}
                  <tr>
                    <td colSpan={2} style={{ fontWeight: 700 }}>Total {t('workOrders.parts')}</td>
                    <td style={{ textAlign: 'right', color: 'var(--color-text-tertiary)' }}>
                      ${totalPartsCost.toFixed(2)}
                    </td>
                    <td></td>
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                      ${totalParts.toFixed(2)}
                    </td>
                    <td></td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
              <input
                className="form-input"
                placeholder={t('common.description')}
                style={{ flex: '2 1 140px' }}
                value={newPartDraft.descripcion}
                onChange={(e) => setNewPartDraft({ ...newPartDraft, descripcion: e.target.value })}
              />
              <input
                className="form-input"
                type="number"
                placeholder={t('common.quantity')}
                style={{ flex: '1 1 70px' }}
                value={newPartDraft.cantidad}
                onChange={(e) => setNewPartDraft({ ...newPartDraft, cantidad: e.target.value })}
              />
              <input
                className="form-input"
                type="number"
                min={0}
                placeholder={t('workOrders.unitCost')}
                title={t('workOrders.unitCostHint')}
                style={{ flex: '1 1 90px' }}
                value={newPartDraft.costo_unitario}
                onChange={(e) => setNewPartDraft({ ...newPartDraft, costo_unitario: e.target.value })}
              />
              <input
                className="form-input"
                type="number"
                min={0}
                placeholder={t('common.price')}
                style={{ flex: '1 1 90px' }}
                value={newPartDraft.precio_venta_unitario}
                onChange={(e) => setNewPartDraft({ ...newPartDraft, precio_venta_unitario: e.target.value })}
              />
              <button type="button" className="btn btn-secondary" onClick={handleAddPart} disabled={!canEditOrder || detailBusy || !newPartDraft.descripcion.trim()}>
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        {/* Totals Summary */}
        <div className="card" style={{ marginTop: 'var(--space-4)' }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-8)', flexWrap: 'wrap' }}>
            {[
              [t('workOrders.parts'), totalParts],
              [t('workOrders.labor'), totalLabor],
              [t('common.subtotal'), totalParts + totalLabor],
              [t('workOrders.deposit'), -viewOrder.deposito_inicial],
            ].map(([label, value], i) => (
              <div key={i} style={{ textAlign: 'right' }}>
                <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{label as string}</div>
                <div style={{ fontSize: 'var(--font-size-lg)', fontWeight: 600 }}>
                  {(value as number) < 0 ? '-' : ''}${Math.abs(value as number).toFixed(2)}
                </div>
              </div>
            ))}
            <div style={{ textAlign: 'right', borderLeft: '2px solid var(--color-primary)', paddingLeft: 'var(--space-4)' }}>
              <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>{t('common.total')}</div>
              <div style={{ fontSize: 'var(--font-size-2xl)', fontWeight: 700, color: 'var(--color-primary-light)' }}>
                ${(totalParts + totalLabor - viewOrder.deposito_inicial).toFixed(2)}
              </div>
            </div>
          </div>
        </div>

        {/* Assigned Technicians */}
        <div className="card" style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
            <User size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.assignedTechnician')}
          </h3>
          <div style={{ display: 'flex', gap: 'var(--space-4)', flexWrap: 'wrap' }}>
            {assignments.length === 0 && (
              <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('common.noResults')}</p>
            )}
            {assignments.map((a) => (
              <div
                key={a.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-3) var(--space-4)',
                  background: 'var(--color-bg-tertiary)',
                  borderRadius: 'var(--radius-lg)',
                  border: '1px solid var(--color-surface-border)',
                }}
              >
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: a.tipo_tarea === 'mecanica'
                    ? 'var(--color-info-bg)' : 'rgba(236, 72, 153, 0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: a.tipo_tarea === 'mecanica' ? 'var(--color-info)' : '#F472B6',
                }}>
                  {a.tipo_tarea === 'mecanica' ? <Wrench size={16} /> : <Paintbrush size={16} />}
                </div>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 'var(--font-size-sm)' }}>{a.usuario?.nombre_completo}</div>
                  <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                    {a.tipo_tarea === 'mecanica' ? t('workOrders.mechanical') : t('workOrders.painting')} · {a.estatus_tarea}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    className="btn btn-ghost btn-sm btn-icon"
                    onClick={() => handleRemoveAssignment(a.id, a.usuario?.nombre_completo || '')}
                    style={{ marginLeft: 'var(--space-2)' }}
                    title={t('common.delete')}
                  >
                    <X size={14} style={{ color: 'var(--color-danger)' }} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {isAdmin ? (
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-4)' }}>
              <select
                className="form-input form-select"
                style={{ maxWidth: 280 }}
                value={addingOperatorId}
                onChange={(e) => setAddingOperatorId(e.target.value)}
              >
                <option value="">-- {t('workOrders.assignedTechnician')} --</option>
                {operators
                  .filter((op) => !assignments.some((a) => a.usuario_id === op.id))
                  .map((op) => (
                    <option key={op.id} value={op.id}>{op.nombre_completo} ({op.rol})</option>
                  ))}
              </select>
              <button type="button" className="btn btn-secondary" onClick={handleAddOperatorToOrder} disabled={!addingOperatorId}>
                <Plus size={16} /> {t('common.add')}
              </button>
            </div>
          ) : (
            !assignments.some((a) => a.usuario_id === user?.id) && (
              <div style={{ marginTop: 'var(--space-4)' }}>
                <button type="button" className="btn btn-primary" onClick={handleJoinOrder} disabled={detailBusy}>
                  <Plus size={16} /> {t('workOrders.joinOrder')}
                </button>
              </div>
            )
          )}
        </div>

        {/* Progress log — mechanics/painters document what they did, with photos */}
        <div className="card" style={{ marginTop: 'var(--space-4)' }}>
          <h3 className="card-title" style={{ marginBottom: 'var(--space-4)' }}>
            <MessageSquarePlus size={18} style={{ display: 'inline', marginRight: 8, verticalAlign: 'middle' }} />
            {t('workOrders.progressLog')}
          </h3>

          {/* New entry form */}
          <div style={{ padding: 'var(--space-4)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-lg)', marginBottom: 'var(--space-4)' }}>
            <textarea
              className="form-input form-textarea"
              placeholder={t('workOrders.progressPlaceholder')}
              value={newProgressNote}
              onChange={(e) => setNewProgressNote(e.target.value)}
              rows={2}
            />
            <input
              type="file"
              ref={progressFileInputRef}
              accept="image/*"
              capture="environment"
              multiple
              style={{ display: 'none' }}
              onChange={handleAddProgressPhotos}
            />
            {newProgressPhotos.length > 0 && (
              <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap', marginTop: 'var(--space-3)' }}>
                {newProgressPhotos.map((file, i) => (
                  <div key={i} style={{ position: 'relative', width: 72, height: 72, borderRadius: 'var(--radius-md)', overflow: 'hidden', border: '1px solid var(--color-surface-border)' }}>
                    <img src={URL.createObjectURL(file)} alt={file.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    <button type="button" className="photo-zone-remove" onClick={() => removeProgressPhotoDraft(i)}>
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-3)', flexWrap: 'wrap' }}>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => progressFileInputRef.current?.click()}>
                <Camera size={16} /> {t('workOrders.addPhotos')}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={handleAddProgressUpdate}
                disabled={!canEditOrder || detailBusy || !newProgressNote.trim()}
              >
                <Plus size={16} /> {detailBusy ? t('common.loading') : t('workOrders.addProgress')}
              </button>
            </div>
          </div>

          {/* Timeline */}
          {(viewOrder.avances || []).length === 0 ? (
            <p style={{ color: 'var(--color-text-tertiary)', fontSize: 'var(--font-size-sm)' }}>{t('common.noResults')}</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              {(viewOrder.avances || []).map((avance) => (
                <div
                  key={avance.id}
                  style={{
                    padding: 'var(--space-4)',
                    borderLeft: '3px solid var(--color-primary)',
                    background: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 'var(--space-2)' }}>
                    <div style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)' }}>
                      {avance.usuario?.nombre_completo || '—'} · {new Date(avance.creado_en).toLocaleString(language === 'es' ? 'es' : 'en')}
                    </div>
                    {(user?.rol === 'admin' || user?.id === avance.usuario_id) && (
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => handleRemoveProgressUpdate(avance.id)}>
                        <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                      </button>
                    )}
                  </div>
                  <p style={{ marginTop: 'var(--space-2)', fontSize: 'var(--font-size-sm)', lineHeight: 1.6 }}>{avance.descripcion}</p>
                  {avance.fotos && avance.fotos.length > 0 && (
                    <div className="photo-gallery-grid" style={{ marginTop: 'var(--space-3)' }}>
                      {avance.fotos.map((url, i) => (
                        <button key={i} type="button" className="photo-gallery-thumb" onClick={() => setLightboxUrl(url)}>
                          <img src={url} alt={`avance-${i}`} loading="lazy" />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {lightboxUrl && (
          <div className="lightbox-overlay" onClick={() => setLightboxUrl(null)}>
            <button className="lightbox-close" onClick={() => setLightboxUrl(null)} aria-label={t('common.close')}>
              <X size={20} />
            </button>
            <img src={lightboxUrl} alt="Foto de inspección" onClick={(e) => e.stopPropagation()} />
          </div>
        )}
      </div>
    );
  }

  // One list of orders, drawn as a table on desktop and as cards on mobile.
  // Extracted so the technician view can render it twice — once for the
  // orders assigned to them, once for the rest of the sede's board.
  const renderOrderList = (list: WorkOrder[]) => (
    <>
      {/* Desktop table */}
      <div className="table-container animate-fade-in desktop-only">
        <table className="table">
          <thead>
            <tr>
              <th>{t('workOrders.orderNumber')}</th>
              <th>{t('common.name')}</th>
              <th>{t('vehicles.title')}</th>
              <th>{t('common.type')}</th>
              <th>{t('common.status')}</th>
              <th>{t('workOrders.progress')}</th>
              <th>{t('workOrders.estimatedDelivery')}</th>
              <th>{t('common.total')}</th>
              <th>{t('common.actions')}</th>
            </tr>
          </thead>
          <tbody>
            {list.map((order) => (
              <tr key={order.id}>
                <td style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>{order.numero_orden}</td>
                <td>{order.cliente?.nombre}</td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                    <Car size={14} style={{ color: 'var(--color-text-tertiary)' }} />
                    {order.vehiculo?.anio} {order.vehiculo?.marca} {order.vehiculo?.modelo}
                  </div>
                </td>
                <td><span className={`badge badge-${order.tipo_trabajo}`}>{order.tipo_trabajo}</span></td>
                <td><span className={`badge badge-${order.estatus}`}>{statusLabels[order.estatus]}</span></td>
                <td>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', minWidth: 100 }}>
                    <div className="progress-bar" style={{ flex: 1, height: '6px' }}>
                      <div className={`progress-fill ${order.porcentaje_avance === 100 ? 'success' : ''}`} style={{ width: `${order.porcentaje_avance}%` }}></div>
                    </div>
                    <span style={{ fontSize: 'var(--font-size-xs)', minWidth: 28 }}>{order.porcentaje_avance}%</span>
                  </div>
                </td>
                <td style={{ fontSize: 'var(--font-size-sm)' }}>
                  <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle', color: 'var(--color-text-tertiary)' }} />
                  {order.fecha_estimada_entrega}
                </td>
                <td style={{ fontWeight: 600 }}>${order.total_general.toLocaleString()}</td>
                <td>
                  <div className="table-actions">
                    <button className="btn btn-ghost btn-sm btn-icon" onClick={() => openDetail(order.id)}>
                      <Eye size={16} />
                    </button>
                    {user?.rol === 'admin' && (
                      <button className="btn btn-ghost btn-sm btn-icon" title={t('common.delete')} style={{ color: 'var(--color-danger)' }} onClick={(e) => handleDeleteOrder(order, e)}>
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile card list — easier to tap through on a phone than a table */}
      <div className="workorder-card-list mobile-only animate-fade-in">
        {list.map((order) => (
          <div key={order.id} className="workorder-card" onClick={() => openDetail(order.id)}>
            <div className="workorder-card-top">
              <span className="workorder-card-number">{order.numero_orden}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)' }}>
                {user?.rol === 'admin' && (
                  <button className="btn btn-ghost btn-sm btn-icon" title={t('common.delete')} style={{ color: 'var(--color-danger)' }} onClick={(e) => handleDeleteOrder(order, e)}>
                    <Trash2 size={16} />
                  </button>
                )}
                <ChevronRight size={18} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              </div>
            </div>
            <div className="workorder-card-meta">
              {order.cliente?.nombre}
            </div>
            <div className="workorder-card-meta" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <Car size={14} style={{ color: 'var(--color-text-tertiary)', flexShrink: 0 }} />
              {order.vehiculo?.anio} {order.vehiculo?.marca} {order.vehiculo?.modelo}
            </div>
            <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
              <span className={`badge badge-${order.tipo_trabajo}`}>{order.tipo_trabajo}</span>
              <span className={`badge badge-${order.estatus}`}>{statusLabels[order.estatus]}</span>
            </div>
            <div className="workorder-card-progress">
              <div className="progress-bar" style={{ flex: 1, height: '6px' }}>
                <div className={`progress-fill ${order.porcentaje_avance === 100 ? 'success' : ''}`} style={{ width: `${order.porcentaje_avance}%` }}></div>
              </div>
              <span style={{ fontSize: 'var(--font-size-xs)', minWidth: 28 }}>{order.porcentaje_avance}%</span>
            </div>
            <div className="workorder-card-footer">
              <span>
                <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                {order.fecha_estimada_entrega}
              </span>
              <span style={{ fontWeight: 700, color: 'var(--color-text-primary)' }}>${order.total_general.toLocaleString()}</span>
            </div>
          </div>
        ))}
        {list.length === 0 && (
          <p style={{ textAlign: 'center', color: 'var(--color-text-tertiary)', padding: 'var(--space-6) 0' }}>
            {t('common.noResults')}
          </p>
        )}
      </div>
    </>
  );

  // List view
  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">{t('workOrders.title')}</h1>
          <p className="page-subtitle">{filtered.length} {t('common.results')}</p>
        </div>
        <button className="btn btn-primary" id="new-order-btn" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} /> {t('workOrders.newOrder')}
        </button>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-4)', flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: 1, maxWidth: 320 }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }} />
          <input className="form-input" placeholder={t('common.search')} value={search} onChange={(e) => setSearch(e.target.value)} style={{ paddingLeft: 36 }} />
        </div>
        <div style={{ display: 'flex', gap: 'var(--space-1)', overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 2 }}>
          {['all', 'recepcion', 'en_proceso', 'espera_repuestos', 'finalizado', 'entregado'].map((status) => (
            <button
              key={status}
              className={`tab ${filterStatus === status ? 'active' : ''}`}
              onClick={() => setFilterStatus(status)}
              style={{ borderBottom: 'none', padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-md)', fontSize: 'var(--font-size-sm)', flexShrink: 0 }}
            >
              {status === 'all' ? t('common.all') : statusLabels[status]}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : isAdmin ? (
        renderOrderList(filtered)
      ) : (
        <>
          {/* A technician lands on their own work first. */}
          <section className="orders-section">
            <h2 className="orders-section-title">
              <Wrench size={18} />
              {t('workOrders.myOrders')}
              <span className="orders-section-count">{myOrders.length}</span>
            </h2>
            {myOrders.length === 0 ? (
              <p className="orders-section-empty">{t('workOrders.myOrdersEmpty')}</p>
            ) : (
              renderOrderList(myOrders)
            )}
          </section>

          {/* The rest of the board stays one click away, never in the way. */}
          <section className="orders-section">
            <button
              type="button"
              className="orders-section-toggle"
              onClick={() => setShowOtherOrders((v) => !v)}
              aria-expanded={showOtherOrders}
            >
              {showOtherOrders ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
              <span className="orders-section-title">
                {t('workOrders.otherOrders')}
                <span className="orders-section-count">{otherOrders.length}</span>
              </span>
            </button>
            {showOtherOrders && (
              <>
                <p className="orders-section-hint">{t('workOrders.otherOrdersHint')}</p>
                {otherOrders.length === 0 ? (
                  <p className="orders-section-empty">{t('common.noResults')}</p>
                ) : (
                  renderOrderList(otherOrders)
                )}
              </>
            )}
          </section>
        </>
      )}

      {/* CREATE WORK ORDER MODAL */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={handleCloseCreateModal}>
          <div className="modal" style={{ maxWidth: '720px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">{t('workOrders.newOrder')}</h3>
              <button className="modal-close" onClick={handleCloseCreateModal}>
                <X size={20} />
              </button>
            </div>
            <form onSubmit={handleCreateOrder} style={{ display: 'contents' }}>
              <div className="modal-body">
                {error && <div className="alert-error">{error}</div>}
                <input type="file" ref={fileInputRef} accept="image/*" capture="environment" style={{ display: 'none' }} onChange={handleFileChange} />
                {/* No `capture` here: extras are often picked from the gallery. */}
                <input type="file" ref={extraInputRef} accept="image/*" multiple style={{ display: 'none' }} onChange={handleExtraFilesChange} />

                {/* Customer & Vehicle Select */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('customers.customerProfile')}</label>
                    {customerMode === 'existing' ? (
                      <select
                        className="form-input form-select"
                        value={selectedCustomer}
                        onChange={(e) => handleSelectCustomer(e.target.value)}
                        required
                      >
                        <option value="">-- Seleccionar Cliente --</option>
                        <option value="__new__">+ {t('customers.newCustomer')}</option>
                        {customers.map((c) => (
                          <option key={c.id} value={c.id}>{c.nombre}</option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-surface-border)' }}>
                        <div className="form-row">
                          <input
                            className="form-input"
                            placeholder={t('common.name')}
                            value={newCustomer.nombre}
                            onChange={(e) => setNewCustomer({ ...newCustomer, nombre: e.target.value })}
                            required
                          />
                          <input
                            className="form-input"
                            placeholder={t('common.phone')}
                            value={newCustomer.telefono}
                            onChange={(e) => setNewCustomer({ ...newCustomer, telefono: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-row" style={{ marginTop: 'var(--space-2)' }}>
                          <input
                            className="form-input"
                            type="email"
                            placeholder={t('common.email')}
                            value={newCustomer.email}
                            onChange={(e) => setNewCustomer({ ...newCustomer, email: e.target.value })}
                          />
                          <input
                            className="form-input"
                            placeholder={t('common.address')}
                            value={newCustomer.direccion}
                            onChange={(e) => setNewCustomer({ ...newCustomer, direccion: e.target.value })}
                          />
                        </div>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          style={{ marginTop: 'var(--space-2)' }}
                          onClick={() => { setCustomerMode('existing'); setVehicleMode('existing'); }}
                        >
                          <ChevronLeft size={14} /> {t('common.back')}
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('vehicles.title')}</label>
                    {vehicleMode === 'existing' ? (
                      <select
                        className="form-input form-select"
                        value={selectedVehicle}
                        onChange={(e) => handleSelectVehicle(e.target.value)}
                        required
                        disabled={!selectedCustomer}
                      >
                        <option value="">-- Seleccionar Vehículo --</option>
                        <option value="__new__">+ {t('vehicles.newVehicle')}</option>
                        {vehiclesForCustomer.map((v) => (
                          <option key={v.id} value={v.id}>{v.marca} {v.modelo} ({v.placa})</option>
                        ))}
                      </select>
                    ) : (
                      <div style={{ padding: 'var(--space-3)', background: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px dashed var(--color-surface-border)' }}>
                        <div className="form-row">
                          <input
                            className="form-input"
                            placeholder={t('vehicles.brand')}
                            value={newVehicle.marca}
                            onChange={(e) => setNewVehicle({ ...newVehicle, marca: e.target.value })}
                            required
                          />
                          <input
                            className="form-input"
                            placeholder={t('vehicles.model')}
                            value={newVehicle.modelo}
                            onChange={(e) => setNewVehicle({ ...newVehicle, modelo: e.target.value })}
                            required
                          />
                        </div>
                        <div className="form-row" style={{ marginTop: 'var(--space-2)' }}>
                          <input
                            className="form-input"
                            type="number"
                            placeholder={t('vehicles.year')}
                            value={newVehicle.anio}
                            onChange={(e) => setNewVehicle({ ...newVehicle, anio: e.target.value })}
                          />
                          <input
                            className="form-input"
                            placeholder={t('vehicles.color')}
                            value={newVehicle.color}
                            onChange={(e) => setNewVehicle({ ...newVehicle, color: e.target.value })}
                          />
                        </div>
                        <div className="form-row" style={{ marginTop: 'var(--space-2)' }}>
                          <input
                            className="form-input"
                            placeholder={t('vehicles.vin')}
                            maxLength={17}
                            value={newVehicle.vin}
                            onChange={(e) => setNewVehicle({ ...newVehicle, vin: e.target.value })}
                            required
                          />
                          <input
                            className="form-input"
                            placeholder={t('vehicles.plate')}
                            value={newVehicle.placa}
                            onChange={(e) => setNewVehicle({ ...newVehicle, placa: e.target.value })}
                          />
                        </div>
                        {customerMode === 'existing' && (
                          <button
                            type="button"
                            className="btn btn-ghost btn-sm"
                            style={{ marginTop: 'var(--space-2)' }}
                            onClick={() => setVehicleMode('existing')}
                          >
                            <ChevronLeft size={14} /> {t('common.back')}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Work Type & Fuel */}
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('common.type')}</label>
                    <select className="form-input form-select" value={workType} onChange={(e) => setWorkType(e.target.value as typeof workType)}>
                      <option value="mecanica">{t('workOrders.mechanical')}</option>
                      <option value="pintura">{t('workOrders.painting')}</option>
                      <option value="combinado">{t('workOrders.combined')}</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('workOrders.fuelLevel')}</label>
                    <select className="form-input form-select" value={fuelLevel} onChange={(e) => setFuelLevel(e.target.value)}>
                      <option value="E (Vacio)">E (Vacío / Empty)</option>
                      <option value="1/4">1/4</option>
                      <option value="1/2">1/2</option>
                      <option value="3/4">3/4</option>
                      <option value="F (Lleno)">F (Lleno / Full)</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">{t('workOrders.milesIn')}</label>
                    <input
                      className="form-input"
                      id="order-miles-in"
                      type="number"
                      min={0}
                      step={1}
                      inputMode="numeric"
                      value={milesIn}
                      onChange={(e) => handleMilesChange(e.target.value)}
                    />
                    {milesError && (
                      <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-danger)' }}>
                        {milesError}
                      </span>
                    )}
                  </div>
                  <div className="form-group">
                    <label className="form-label">{t('workOrders.deposit')} ($)</label>
                    <input className="form-input" type="number" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">{t('workOrders.estimatedDelivery')}</label>
                  <input className="form-input" type="date" value={estimatedDate} onChange={(e) => setEstimatedDate(e.target.value)} />
                </div>

                {/* Operators — only admins choose who works the order. A
                    technician creating one is auto-assigned to themselves. */}
                {isAdmin ? (
                <div className="form-group">
                  <label className="form-label">{t('workOrders.assignedTechnician')}</label>
                  <div style={{ display: 'flex', gap: 'var(--space-2)', flexWrap: 'wrap' }}>
                    {operators.map((op) => (
                      <label
                        key={op.id}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '6px',
                          padding: '6px 12px', borderRadius: 'var(--radius-full)',
                          background: selectedOperators.includes(op.id) ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                          color: selectedOperators.includes(op.id) ? 'var(--color-text-inverse)' : 'var(--color-text-secondary)',
                          fontSize: 'var(--font-size-sm)', cursor: 'pointer',
                        }}
                      >
                        <input type="checkbox" checked={selectedOperators.includes(op.id)} onChange={() => toggleOperator(op.id)} style={{ display: 'none' }} />
                        {op.nombre_completo} ({op.rol})
                      </label>
                    ))}
                  </div>
                </div>
                ) : (
                  <div className="form-group">
                    <label className="form-label">{t('workOrders.assignedTechnician')}</label>
                    <p style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                      {t('workOrders.autoAssigned')}
                    </p>
                  </div>
                )}

                {/* 360 Photos upload */}
                <div className="form-group" style={{ marginTop: 'var(--space-2)' }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>{t('workOrders.inspection360')}</span>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: zonesCovered === ZONES.length ? 'var(--color-success)' : 'var(--color-text-tertiary)', fontWeight: 600 }}>
                      {zonesCovered}/{ZONES.length}
                      {extraPhotos.length > 0 && ` +${extraPhotos.length}`}
                    </span>
                  </label>
                  <div className="photo-zone-grid">
                    {ZONES.map(({ key, label }) => {
                      const photo = photos[key];
                      return (
                        <div
                          key={key}
                          onClick={() => handleZoneClick(key)}
                          className={`photo-zone ${photo ? 'filled' : ''}`}
                        >
                          {photo && (
                            <>
                              <img
                                src={photo.preview}
                                alt={label}
                                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                              />
                              <button
                                type="button"
                                className="photo-zone-remove"
                                onClick={(e) => removePhoto(key, e)}
                                aria-label={`${t('common.delete')} ${label}`}
                              >
                                <X size={14} />
                              </button>
                            </>
                          )}
                          {!photo ? (
                            <>
                              <Camera size={24} className="photo-zone-icon" />
                              <span className="photo-zone-label">{label}</span>
                            </>
                          ) : (
                            <span className="photo-zone-caption">
                              <CheckCircle2 size={12} /> {label}
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {extraPhotos.map((photo) => (
                      <div key={photo.key} className="photo-zone filled">
                        <img
                          src={photo.preview}
                          alt={photo.label}
                          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <button
                          type="button"
                          className="photo-zone-remove"
                          onClick={(e) => removePhoto(photo.key, e)}
                          aria-label={`${t('common.delete')} ${photo.label}`}
                        >
                          <X size={14} />
                        </button>
                        <span className="photo-zone-caption">
                          <CheckCircle2 size={12} /> {photo.label}
                        </span>
                      </div>
                    ))}

                    <div
                      className="photo-zone photo-zone-add"
                      onClick={() => extraInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') extraInputRef.current?.click();
                      }}
                    >
                      <ImagePlus size={24} className="photo-zone-icon" />
                      <span className="photo-zone-label">{t('workOrders.addExtraPhoto')}</span>
                    </div>
                  </div>
                  <p style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-tertiary)', marginTop: 'var(--space-2)' }}>
                    {t('workOrders.tapToCapture')}
                  </p>
                </div>

                <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
                  <label className="form-label">Notas de la Inspección 360°</label>
                  <textarea
                    className="form-input form-textarea"
                    placeholder="Detalles sobre rayones, abolladuras previas o estado general del auto..."
                    value={inspectionNotes}
                    onChange={(e) => setInspectionNotes(e.target.value)}
                    rows={2}
                  />
                </div>

                {/* Labor Items */}
                <div className="form-group" style={{ marginTop: 'var(--space-3)' }}>
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t('workOrders.laborDescription')}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLaborItems((p) => [...p, { descripcion: '', costo: '' }])}>
                      <Plus size={14} /> {t('common.add')}
                    </button>
                  </label>
                  {laborItems.map((item, i) => (
                    <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                      <input
                        className="form-input"
                        placeholder={t('common.description')}
                        value={item.descripcion}
                        onChange={(e) => setLaborItems((p) => p.map((it, idx) => (idx === i ? { ...it, descripcion: e.target.value } : it)))}
                      />
                      <input
                        className="form-input"
                        type="number"
                        placeholder="$"
                        style={{ maxWidth: 110 }}
                        value={item.costo}
                        onChange={(e) => setLaborItems((p) => p.map((it, idx) => (idx === i ? { ...it, costo: e.target.value } : it)))}
                      />
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setLaborItems((p) => p.filter((_, idx) => idx !== i))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Parts */}
                <div className="form-group">
                  <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{t('workOrders.partsDescription')}</span>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setParts((p) => [...p, { descripcion: '', cantidad: '1', costo_unitario: '', precio_venta_unitario: '' }])}>
                      <Plus size={14} /> {t('common.add')}
                    </button>
                  </label>
                  {parts.map((part, i) => (
                    <div key={i} style={{ display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
                      <input
                        className="form-input"
                        placeholder={t('common.description')}
                        value={part.descripcion}
                        onChange={(e) => setParts((p) => p.map((it, idx) => (idx === i ? { ...it, descripcion: e.target.value } : it)))}
                      />
                      <input
                        className="form-input"
                        type="number"
                        placeholder={t('common.quantity')}
                        style={{ maxWidth: 80 }}
                        value={part.cantidad}
                        onChange={(e) => setParts((p) => p.map((it, idx) => (idx === i ? { ...it, cantidad: e.target.value } : it)))}
                      />
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        placeholder={t('workOrders.unitCost')}
                        title={t('workOrders.unitCostHint')}
                        style={{ maxWidth: 100 }}
                        value={part.costo_unitario}
                        onChange={(e) => setParts((p) => p.map((it, idx) => (idx === i ? { ...it, costo_unitario: e.target.value } : it)))}
                      />
                      <input
                        className="form-input"
                        type="number"
                        min={0}
                        placeholder={t('common.price')}
                        style={{ maxWidth: 100 }}
                        value={part.precio_venta_unitario}
                        onChange={(e) => setParts((p) => p.map((it, idx) => (idx === i ? { ...it, precio_venta_unitario: e.target.value } : it)))}
                      />
                      <button type="button" className="btn btn-ghost btn-sm btn-icon" onClick={() => setParts((p) => p.filter((_, idx) => idx !== i))}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={handleCloseCreateModal}>
                  {t('common.cancel')}
                </button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? t('common.loading') : t('common.create')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
