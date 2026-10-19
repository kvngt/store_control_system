import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Building2,
  Calendar,
  Car,
  CheckCircle2,
  Clock,
  Gauge,
  Globe,
  MessageCircle,
  Phone,
  Wrench,
} from 'lucide-react';
import { applySedeBranding } from '../lib/branding';
import { formatPhone, telUrl, whatsAppUrl } from '../lib/phone';
import { translateVehicleColor } from '../lib/vehicleColor';
import { fetchService } from './portal.api';
import { computeServiceStatus } from './serviceStatus';
import {
  initialPortalLanguage,
  portalStrings,
  savePortalLanguage,
  savedPortalLanguage,
  type PortalLanguage,
} from './strings';
import type { ServicePortalData, ServiceResponse } from './portal.types';

interface ServicePageProps {
  token: string | null;
}

type LoadState =
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'loaded'; data: ServiceResponse };

function toDate(value: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
}

export default function ServicePage({ token }: ServicePageProps) {
  const [loadState, setLoadState] = useState<LoadState>({ kind: 'loading' });
  const [language, setLanguage] = useState<PortalLanguage>(() => {
    return savedPortalLanguage() ?? initialPortalLanguage();
  });

  const strings = portalStrings[language];

  useEffect(() => {
    if (!token) {
      setLoadState({ kind: 'loaded', data: { estado: 'no_existe' } });
      return;
    }

    let active = true;
    const ctrl = new AbortController();

    setLoadState({ kind: 'loading' });
    fetchService(token, ctrl.signal)
      .then((res) => {
        if (!active) return;
        setLoadState({ kind: 'loaded', data: res });

        if (res.estado === 'ok') {
          // Si el cliente no había elegido un idioma antes, se toma el idioma del cliente
          if (!savedPortalLanguage() && res.idioma) {
            setLanguage(res.idioma === 'en' ? 'en' : 'es');
          }
          if (res.taller.color || res.taller.logo_url) {
            applySedeBranding(res.taller.color, 'light');
          }
        }
      })
      .catch((err) => {
        if (!active || err?.name === 'AbortError') return;
        setLoadState({ kind: 'error' });
      });

    return () => {
      active = false;
      ctrl.abort();
    };
  }, [token]);

  const toggleLanguage = () => {
    const next: PortalLanguage = language === 'es' ? 'en' : 'es';
    setLanguage(next);
    savePortalLanguage(next);
  };

  const formatDate = (dateStr: string | null | undefined): string => {
    if (!dateStr) return '—';
    const locale = language === 'es' ? 'es-US' : 'en-US';
    return new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(toDate(dateStr));
  };

  // Fecha de hoy en formato local AAAA-MM-DD
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  return (
    <main className="portal">
      <div className="portal-topbar">
        <button
          type="button"
          className="portal-language"
          onClick={toggleLanguage}
          aria-label={strings.language}
        >
          <Globe size={16} aria-hidden="true" />
          <span>{strings.language}</span>
        </button>
      </div>

      {loadState.kind === 'loading' && (
        <div className="portal-center">
          <div className="spinner" />
          <p>{strings.service.loading}</p>
        </div>
      )}

      {loadState.kind === 'error' && (
        <div className="portal-center">
          <p>{strings.loadError}</p>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => window.location.reload()}
          >
            {strings.retry}
          </button>
        </div>
      )}

      {loadState.kind === 'loaded' && loadState.data.estado === 'no_existe' && (
        <div className="portal-body">
          <div className="portal-card portal-unavailable">
            <h1>{strings.service.notFoundTitle}</h1>
            <p>{strings.service.notFoundBody}</p>
          </div>
        </div>
      )}

      {loadState.kind === 'loaded' && loadState.data.estado === 'ok' && (
        <ServiceContent
          data={loadState.data}
          todayStr={todayStr}
          language={language}
          formatDate={formatDate}
        />
      )}
    </main>
  );
}

interface ServiceContentProps {
  data: ServicePortalData;
  todayStr: string;
  language: PortalLanguage;
  formatDate: (d: string | null | undefined) => string;
}

/** La nota del servicio en el idioma de la página; sin traducción guardada, como se escribió. */
function servicioNota(data: ServicePortalData, language: PortalLanguage): string | null {
  const nota = data.servicio.nota;
  if (!nota || language !== 'en') return nota;
  return data.traducciones?.[nota.trim()] ?? nota;
}

function ServiceContent({ data, todayStr, language, formatDate }: ServiceContentProps) {
  const strings = portalStrings[language];
  const { taller, vehiculo } = data;
  // La nota se escribió a mano en español: en inglés sale su traducción, si ya existe.
  const nota = servicioNota(data, language);
  const servicio = { ...data.servicio, nota };
  const locale = language === 'es' ? 'es-US' : 'en-US';

  const traffic = computeServiceStatus(servicio.fecha, todayStr);

  const vehicleName = [vehiculo.anio, vehiculo.marca, vehiculo.modelo]
    .filter(Boolean)
    .join(' ')
    .trim() || strings.service.vehicle;

  const serviceText =
    servicio.nota ||
    (servicio.millas ? `${servicio.millas.toLocaleString(locale)} mi` : '') ||
    (servicio.fecha ? formatDate(servicio.fecha) : '');

  // Teléfono para WhatsApp (priorizar whatsapp: true, o primer teléfono)
  const phones = taller.telefonos || [];
  const whatsappPhone =
    phones.find((p) => p.whatsapp)?.numero || (phones.length > 0 ? phones[0].numero : null);

  const whatsappMessage = strings.service.whatsappMessage
    .replace('{vehiculo}', vehicleName)
    .replace('{servicio}', serviceText || strings.service.noteLabel);

  const whatsappHref = whatsAppUrl(whatsappPhone, whatsappMessage);

  return (
    <div className="portal-body">
      {/* Encabezado del taller */}
      <div className="portal-shop">
        {taller.logo_url ? (
          <img src={taller.logo_url} alt={taller.nombre} className="portal-shop-logo" />
        ) : (
          <Building2 size={32} style={{ color: 'var(--color-primary)' }} />
        )}
        <div className="portal-shop-name">{taller.nombre}</div>
      </div>

      {/* Tarjeta del próximo servicio */}
      <div className="portal-card is-highlighted">
        <h1 style={{ fontSize: 'var(--font-size-xl)', margin: '0 0 var(--space-1)', fontWeight: 700 }}>
          {strings.service.title}
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', margin: '0 0 var(--space-4)', fontSize: 'var(--font-size-sm)' }}>
          {strings.service.subtitle}
        </p>

        {/* Vehículo (Año Marca Modelo, Color; NUNCA nombre del cliente ni placa ni VIN) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            padding: 'var(--space-2) var(--space-3)',
            backgroundColor: 'var(--color-bg-secondary)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
            fontSize: 'var(--font-size-md)',
            fontWeight: 600,
          }}
        >
          <Car size={18} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
          <span>
            {vehicleName}
            {vehiculo.color ? ` (${translateVehicleColor(vehiculo.color, language)})` : ''}
          </span>
        </div>

        {/* Semáforo */}
        {traffic.estado === 'al_dia' && (
          <div className="portal-traffic-badge is-al_dia" role="status">
            <CheckCircle2 size={16} />
            <span>
              {strings.service.statusAlDia} ·{' '}
              {strings.service.daysRemaining.replace('{days}', String(traffic.diasRestantes))}
            </span>
          </div>
        )}

        {traffic.estado === 'pronto' && (
          <div className="portal-traffic-badge is-pronto" role="status">
            <Clock size={16} />
            <span>
              {strings.service.statusPronto} ·{' '}
              {traffic.diasRestantes === 0
                ? strings.service.today
                : strings.service.daysRemaining.replace('{days}', String(traffic.diasRestantes))}
            </span>
          </div>
        )}

        {traffic.estado === 'vencido' && (
          <div className="portal-traffic-badge is-vencido" role="status">
            <AlertCircle size={16} />
            <span>
              {strings.service.statusVencido} ·{' '}
              {strings.service.daysOverdue.replace('{days}', String(Math.abs(traffic.diasRestantes!)))}
            </span>
          </div>
        )}

        {traffic.estado === 'solo_millas' && servicio.millas !== null && servicio.millas !== undefined && (
          <div className="portal-traffic-badge is-solo_millas" role="status">
            <Gauge size={16} />
            <span>{strings.service.atMiles.replace('{miles}', servicio.millas.toLocaleString(locale))}</span>
          </div>
        )}

        {/* Grilla con detalles del servicio */}
        <div className="portal-service-grid">
          {servicio.fecha && (
            <div className="portal-service-item">
              <div className="portal-service-item-label">
                <Calendar size={14} />
                <span>{strings.service.dateLabel}</span>
              </div>
              <div className="portal-service-item-value">{formatDate(servicio.fecha)}</div>
            </div>
          )}

          {servicio.millas !== null && servicio.millas !== undefined && (
            <div className="portal-service-item">
              <div className="portal-service-item-label">
                <Gauge size={14} />
                <span>{strings.service.milesLabel}</span>
              </div>
              <div className="portal-service-item-value">{servicio.millas.toLocaleString(locale)} mi</div>
            </div>
          )}

          {servicio.nota && (
            <div className="portal-service-item" style={{ gridColumn: '1 / -1' }}>
              <div className="portal-service-item-label">
                <Wrench size={14} />
                <span>{strings.service.noteLabel}</span>
              </div>
              <div className="portal-service-item-value">{servicio.nota}</div>
            </div>
          )}
        </div>

        {/* Acciones principales: Agendar por WhatsApp y Llamar */}
        <div className="portal-service-actions">
          {whatsappPhone && (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="btn btn-primary btn-lg"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 'var(--space-2)',
                backgroundColor: '#25D366',
                borderColor: '#25D366',
                color: '#FFFFFF',
                textDecoration: 'none',
              }}
              id="btn-whatsapp-schedule"
            >
              <MessageCircle size={20} />
              <span>{strings.service.whatsappSchedule}</span>
            </a>
          )}

          {phones.map((phone, idx) => {
            const href = telUrl(phone.numero);
            if (!href) return null;
            return (
              <a
                key={idx}
                href={href}
                className="btn btn-secondary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 'var(--space-2)',
                  textDecoration: 'none',
                }}
              >
                <Phone size={16} style={{ flexShrink: 0 }} />
                <span>
                  {phone.label
                    ? `${strings.service.call} (${phone.label}: ${formatPhone(phone.numero)})`
                    : strings.service.callPhone.replace('{phone}', formatPhone(phone.numero))}
                </span>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
