import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Archive, Calendar, Search } from 'lucide-react';
import { useLanguage } from '../../context/language.context';
import { getErrorMessage } from '../../lib/errors';
import { useIsMobile } from '../../lib/useMediaQuery';
import { queryKeys } from '../../lib/queryClient';
import { workOrdersService } from '../../services/workOrders.service';
import type { WorkOrder } from '../../types/database';
import { money } from '../../lib/money';

const PAGE = 25;

/**
 * Cuánto se espera antes de mandar la búsqueda.
 *
 * Es la única búsqueda de la app que va al servidor, y cada tecla cuesta dos peticiones:
 * la de las órdenes y la que resuelve los clientes por nombre. Escribir "Marta" serían
 * diez viajes, casi todos a un término que la persona ya está corrigiendo.
 */
const BUSQUEDA_MS = 300;

interface ArchivedOrdersProps {
  sedeId?: string;
  isAdmin: boolean;
  onOpen: (orderId: string) => void;
}

/**
 * Las órdenes entregadas hace más de 90 días.
 *
 * Solo lectura y paginada de verdad, con "cargar más": es la lista que crece para siempre,
 * y traérsela entera sería volver a crear el problema que el archivo resuelve. La búsqueda
 * va al servidor por lo mismo — filtrar en memoria solo buscaría dentro de la página
 * cargada.
 *
 * Un número de orden abre su detalle, desde donde un admin puede actuar como en cualquier
 * otra: el archivo no es un callejón sin salida.
 */
export default function ArchivedOrders({ sedeId, isAdmin, onOpen }: ArchivedOrdersProps) {
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const [search, setSearch] = useState('');
  const [termino, setTermino] = useState('');
  const [pages, setPages] = useState(1);

  useEffect(() => {
    const id = setTimeout(() => setTermino(search), BUSQUEDA_MS);
    return () => clearTimeout(id);
  }, [search]);

  const { data, isPending, error: loadError } = useQuery({
    queryKey: queryKeys.archivedWorkOrders(sedeId, termino, pages),
    queryFn: () => workOrdersService.getArchivedWorkOrders(sedeId, { search: termino, limit: PAGE * pages }),
  });

  // El error se guarda crudo y se traduce al pintar, como en el resto de las listas.
  const error = loadError ? getErrorMessage(loadError, language) : '';
  const orders = data || [];
  // Una página completa puede significar que hay más; una incompleta, que no.
  const puedeHaberMas = orders.length === PAGE * pages;
  const fecha = (v?: string | null) =>
    v ? new Date(v).toLocaleDateString(language === 'es' ? 'es' : 'en') : '—';

  const vehicleOf = (o: WorkOrder) =>
    [o.vehiculo?.anio, o.vehiculo?.marca, o.vehiculo?.modelo].filter(Boolean).join(' ') || '—';

  return (
    <div className="animate-fade-in">
      <div style={{ position: 'relative', marginBottom: 'var(--space-4)' }}>
        <Search
          size={16}
          style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-tertiary)' }}
        />
        <input
          className="form-input"
          style={{ paddingLeft: 36 }}
          placeholder={t('workOrders.archivedSearch')}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setPages(1);
          }}
          id="archived-search"
        />
      </div>

      {error && <div className="alert-error">{error}</div>}

      {isPending ? (
        <div className="loading-state"><div className="spinner" /></div>
      ) : orders.length === 0 && !error ? (
        <p className="orders-section-empty">
          <Archive size={16} style={{ display: 'inline', marginRight: 6, verticalAlign: 'middle' }} />
          {t('workOrders.archivedEmpty')}
        </p>
      ) : isMobile ? (
        <div className="workorder-card-list">
          {orders.map((o) => (
            <div key={o.id} className="workorder-card" onClick={() => onOpen(o.id)}>
              <div className="workorder-card-top">
                <span className="workorder-card-number">{o.numero_orden}</span>
                {isAdmin && o.montos && (
                  <span style={{ fontWeight: 600 }}>
                    {money(o.montos.total_general)}
                  </span>
                )}
              </div>
              <div className="workorder-card-meta">
                <span>{o.cliente?.nombre || '—'}</span>
                <span>{vehicleOf(o)}</span>
              </div>
              <div className="workorder-card-footer">
                <span>
                  <Calendar size={12} style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }} />
                  {fecha(o.fecha_finalizacion)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="table-container cards-on-mobile">
          <table className="table">
            <thead>
              <tr>
                <th>{t('workOrders.orderNumber')}</th>
                <th>{t('common.customer')}</th>
                <th>{t('common.vehicle')}</th>
                <th>{t('workOrders.deliveredOn')}</th>
                {isAdmin && <th>{t('common.total')}</th>}
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="row-clickable" onClick={() => onOpen(o.id)}>
                  <td data-label={t('workOrders.orderNumber')} style={{ color: 'var(--color-primary-light)', fontWeight: 600 }}>
                    {o.numero_orden}
                  </td>
                  <td data-label={t('common.customer')}>{o.cliente?.nombre || '—'}</td>
                  <td data-label={t('common.vehicle')}>{vehicleOf(o)}</td>
                  <td data-label={t('workOrders.deliveredOn')}>{fecha(o.fecha_finalizacion)}</td>
                  {isAdmin && (
                    <td data-label={t('common.total')} style={{ fontWeight: 600 }}>
                      {money(o.montos?.total_general)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {puedeHaberMas && (
        <button
          type="button"
          className="btn btn-secondary"
          style={{ marginTop: 'var(--space-4)' }}
          onClick={() => setPages((n) => n + 1)}
          id="archived-load-more"
        >
          {t('common.loadMore')}
        </button>
      )}
    </div>
  );
}
