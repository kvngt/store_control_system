import { useState } from 'react';
import {
  Calendar,
  Car,
  Check,
  ClipboardList,
  Fuel,
  Gauge,
  Info,
  Mail,
  MessageCircle,
  Package,
  Phone,
  Tag,
  Wrench,
} from 'lucide-react';
import { VehicleDiagram } from '../../components/VehicleDiagram';
import { telUrl, whatsAppUrl } from '../../lib/phone';
import { translateVehicleColor } from '../../lib/vehicleColor';
import PortalSection from '../PortalSection';
import { useFormatters, type PortalStrings } from '../format';
import type { PortalReport } from '../portal.types';
import { shopPhones } from '../shopPhones';
import type { PortalLanguage } from '../strings';
import { AccountSection } from './AccountSection';
import { ContactPhones } from './ContactPhones';
import { EmailPreference } from './EmailPreference';
import { InspectionSection } from './InspectionSection';
import { PortalMediaGrid } from './PortalMedia';
import { QuoteSection } from './QuoteSection';
import { ShopHeader } from './ShopHeader';
import { StatusSteps } from './StatusSteps';

export interface ReportProps {
  report: PortalReport;
  token: string;
  s: PortalStrings;
  language: PortalLanguage;
  onReload: () => Promise<void>;
}

export function Report({ report, token, s, language, onReload }: ReportProps) {
  const fmt = useFormatters(language);
  const { orden, vehiculo, taller } = report;
  const phones = shopPhones(taller);
  const reception = report.multimedia.filter((m) => m.origen === 'recepcion');
  const progress = report.multimedia.filter((m) => m.origen === 'avance');
  // Los avances que el taller decidió mostrar, cada uno con sus archivos. Los archivos
  // publicados cuyo avance no viene en la lista (los que un admin publicó suelto) se
  // agrupan al final, como siempre.
  const updates = report.avances ?? [];
  const observations = report.observaciones ?? [];
  const updateIds = new Set(updates.map((u) => u.id));
  const looseProgress = progress.filter((m) => !m.avance_id || !updateIds.has(m.avance_id));
  // Finalizada por el técnico, pero administración todavía no confirma que está lista: para el
  // cliente sigue en proceso, con su propio texto ("En revisión final").
  const reviewing = orden.estatus === 'finalizado' && orden.lista_para_entregar === false;
  const shownStatus = reviewing ? 'en_proceso' : orden.estatus;
  // En espera porque el técnico reportó algo y el taller todavía no manda el presupuesto: no hay nada
  // que autorizar, y decir "le enviamos un presupuesto" lo mandaba a buscar uno que no existe.
  const extraWorkReview = orden.estatus === 'espera_autorizacion' && !(report.presupuesto && report.presupuesto.lineas.length > 0);
  const vehicleTitle = [vehiculo.anio, vehiculo.marca, vehiculo.modelo].filter(Boolean).join(' ');
  // La confirmación de una respuesta vive aquí y no en la sección del presupuesto:
  // al responder, el presupuesto desaparece de la página.
  const [notice, setNotice] = useState<string | null>(null);

  return (
    <div className="portal-body">
      <ShopHeader shop={taller} />

      {notice && (
        <section className="portal-card portal-notice" role="status">
          <Check size={18} /> {notice}
        </section>
      )}

      <section className="portal-card portal-hero">
        <div className="portal-hero-top">
          <span className="portal-order-number">
            {s.order} {orden.numero}
          </span>
          {orden.retirada_sin_reparar ? (
            <span className="badge badge-retirada">{s.withdrawnStatus}</span>
          ) : reviewing ? (
            <span className="badge badge-en_proceso">{s.finalReview}</span>
          ) : extraWorkReview ? (
            <span className="badge badge-espera_autorizacion">{s.extraWorkReview}</span>
          ) : (
            <span className={`badge badge-${orden.estatus}`}>{s.status[orden.estatus]}</span>
          )}
        </div>
        <h1 className="portal-vehicle">
          <Car size={22} /> {vehicleTitle || s.vehicle}
        </h1>
        <p className="portal-vehicle-meta">
          {[translateVehicleColor(vehiculo.color, language), vehiculo.placa ? `${s.plate} ${vehiculo.placa}` : s.noPlate, vehiculo.vin_final ? `${s.vinEnding} ${vehiculo.vin_final}` : null]
            .filter(Boolean)
            .join(' · ')}
        </p>

        {/* Retirado sin reparar no recorre los pasos: se cerró sin hacer el trabajo. */}
        {orden.retirada_sin_reparar ? (
          <p className="portal-status-hint">{s.withdrawnHint}</p>
        ) : (
          <>
            <StatusSteps status={shownStatus} s={s} />
            <p className="portal-status-hint">
              {reviewing ? s.finalReviewHint : extraWorkReview ? s.extraWorkReviewHint : s.statusHint[orden.estatus]}
            </p>
          </>
        )}

        {orden.estatus !== 'entregado' && (
          <div className="portal-progress">
            <div className="portal-progress-label">
              <span>{s.progress}</span>
              <strong>{orden.porcentaje_avance}%</strong>
            </div>
            <div className="progress-bar">
              <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, orden.porcentaje_avance))}%` }} />
            </div>
          </div>
        )}

        {orden.fecha_estimada_entrega && !['finalizado', 'entregado'].includes(shownStatus) && (
          <p className="portal-eta">
            <Calendar size={14} /> {s.estimatedDelivery}: <strong>{fmt.date(orden.fecha_estimada_entrega)}</strong>
          </p>
        )}
      </section>

      {/* Por qué la orden no avanza: las piezas que se pidieron y no han llegado. */}
      {(report.esperando_repuestos ?? []).length > 0 && (
        <section className="portal-card portal-waiting-parts">
          <h2 className="portal-section-title">
            <Package size={18} /> {s.waitingPartsTitle}
          </h2>
          <p className="portal-muted">{s.waitingPartsHint}</p>
          <ul>
            {(report.esperando_repuestos ?? []).map((part, i) => (
              <li key={i}>{part.descripcion}</li>
            ))}
          </ul>
        </section>
      )}

      {/* Lo primero después del estado: es lo único que espera algo del cliente. */}
      {report.presupuesto && report.presupuesto.lineas.length > 0 && (
        <QuoteSection
          key={report.presupuesto.id}
          quote={report.presupuesto}
          token={token}
          s={s}
          fmt={fmt}
          onAnswered={async (message) => {
            if (message) setNotice(message);
            await onReload();
          }}
        />
      )}

      <PortalSection
        icon={Wrench}
        title={s.progressTitle}
        defaultOpen={true}
      >
        {updates.length === 0 && looseProgress.length === 0 ? (
          <p className="portal-muted">{s.noProgressMedia}</p>
        ) : (
          <div className="portal-updates">
            {updates.map((u) => {
              const files = progress.filter((m) => m.avance_id === u.id);
              return (
                <article key={u.id} className="portal-update">
                  <p className="portal-update-date">{fmt.dateTime(u.fecha)}</p>
                  <p className="portal-update-text">{u.mensaje || s.progressNoMessage}</p>
                  {files.length > 0 && <PortalMediaGrid media={files} s={s} fmt={fmt} />}
                </article>
              );
            })}
            {looseProgress.length > 0 && <PortalMediaGrid media={looseProgress} s={s} fmt={fmt} showDates />}
          </div>
        )}
      </PortalSection>

      {observations.length > 0 && (
        <PortalSection
          icon={Info}
          title={s.observationsTitle}
          defaultOpen={false}
        >
          <p className="portal-muted">{s.observationsHint}</p>
          <div className="portal-updates">
            {observations.map((o) => (
              <article key={o.id} className="portal-update">
                {o.fecha && <p className="portal-update-date">{fmt.date(o.fecha)}</p>}
                <p className="portal-update-text">{o.texto}</p>
              </article>
            ))}
          </div>
        </PortalSection>
      )}

      <PortalSection
        icon={ClipboardList}
        title={s.receptionTitle}
        summary={s.receptionPhotosCount.replace('{count}', String(reception.length))}
        defaultOpen={false}
      >
        <dl className="portal-facts">
          <div>
            <dt><Calendar size={14} /> {s.receivedOn}</dt>
            <dd>{fmt.date(orden.fecha_ingreso)}</dd>
          </div>
          <div>
            <dt><Gauge size={14} /> {s.mileage}</dt>
            <dd>{fmt.number(orden.millas_ingreso)}</dd>
          </div>
          <div>
            <dt><Fuel size={14} /> {s.fuel}</dt>
            <dd>{s.fuelLevels[orden.nivel_gasolina] ?? orden.nivel_gasolina}</dd>
          </div>
        </dl>
        {orden.notas_recepcion?.trim() && (
          <div className="portal-notes">
            <div className="portal-label">{s.receptionNotes}</div>
            <p>{orden.notas_recepcion}</p>
          </div>
        )}
        {(orden.marcas_danos?.length ?? 0) > 0 && (
          <div className="portal-damage" style={{ marginTop: 'var(--space-3)', marginBottom: 'var(--space-3)' }}>
            <div className="portal-label" style={{ marginBottom: 'var(--space-2)' }}>{s.damage.title}</div>
            <VehicleDiagram
              marks={orden.marcas_danos!}
              labels={{
                views: s.damage.views,
                types: s.damage.types,
                remove: s.damage.remove,
                empty: s.damage.empty,
              }}
              editable={false}
            />
          </div>
        )}
        {reception.length > 0 ? <PortalMediaGrid media={reception} s={s} fmt={fmt} /> : <p className="portal-muted">{s.noReceptionMedia}</p>}
        {orden.firma_url && (
          <div className="portal-signature">
            <div className="portal-label">{s.signature}</div>
            <img src={orden.firma_url} alt={s.signature} />
            {orden.firma_fecha && (
              <div className="portal-muted">
                {s.signedOn} {fmt.dateTime(orden.firma_fecha)}
              </div>
            )}
          </div>
        )}
      </PortalSection>

      {/* Inspección por puntos (20261010000035) */}
      {report.inspeccion && (
        <InspectionSection
          inspeccion={report.inspeccion}
          multimedia={report.multimedia}
          s={s}
          fmt={fmt}
        />
      )}

      {/* Próximo servicio recomendado (20261010000029) */}
      {report.proximo_servicio && (report.proximo_servicio.fecha || report.proximo_servicio.millas !== null) && (
        <PortalSection
          icon={Tag}
          title={s.nextServiceCard.title}
          defaultOpen={true}
          testId="next-service-card"
        >
          <div className="portal-service-grid" style={{ margin: 'var(--space-3) 0 0' }}>
            {report.proximo_servicio.fecha && (
              <div className="portal-service-item">
                <div className="portal-service-item-label">
                  <Calendar size={14} />
                  <span>{s.nextServiceCard.date}</span>
                </div>
                <div className="portal-service-item-value">{fmt.date(report.proximo_servicio.fecha)}</div>
              </div>
            )}
            {report.proximo_servicio.millas !== null && report.proximo_servicio.millas !== undefined && (
              <div className="portal-service-item">
                <div className="portal-service-item-label">
                  <Gauge size={14} />
                  <span>{s.nextServiceCard.miles}</span>
                </div>
                <div className="portal-service-item-value">{fmt.number(report.proximo_servicio.millas)} mi</div>
              </div>
            )}
            {report.proximo_servicio.nota && (
              <div className="portal-service-item" style={{ gridColumn: '1 / -1' }}>
                <div className="portal-service-item-label">
                  <Wrench size={14} />
                  <span>{s.nextServiceCard.note}</span>
                </div>
                <div className="portal-service-item-value">{report.proximo_servicio.nota}</div>
              </div>
            )}
          </div>
        </PortalSection>
      )}

      <AccountSection report={report} s={s} fmt={fmt} language={language} />

      <PortalSection
        icon={Phone}
        title={s.contactTitle}
        defaultOpen={true}
      >
        <p className="portal-contact-name">{taller.nombre}</p>
        {taller.direccion && <p className="portal-muted">{taller.direccion}</p>}
        {phones.length > 0 && (
          <ContactPhones
            phones={phones}
            s={s}
            whatsappMessage={s.whatsappMessage.replace('{numero}', orden.numero)}
          />
        )}
        <div className="portal-actions">
          {phones.length === 0 && telUrl(taller.telefono) && (
            <a className="btn btn-secondary" href={telUrl(taller.telefono)!}>
              <Phone size={16} /> {s.call}
            </a>
          )}
          {phones.length === 0 && taller.whatsapp && (
            <a
              className="btn btn-primary"
              href={whatsAppUrl(taller.whatsapp, s.whatsappMessage.replace('{numero}', orden.numero))}
              target="_blank"
              rel="noopener noreferrer"
            >
              <MessageCircle size={16} /> {s.whatsapp}
            </a>
          )}
          {taller.email && (
            <a className="btn btn-secondary" href={`mailto:${taller.email}?subject=${encodeURIComponent(`${s.order} ${orden.numero}`)}`}>
              <Mail size={16} /> {s.writeEmail}
            </a>
          )}
        </div>
      </PortalSection>

      {report.cliente.tiene_correo && <EmailPreference token={token} initial={report.cliente.acepta_correos} s={s} />}

      <footer className="portal-footer">
        <p>{s.privateLink}</p>
        {report.enlace.expira_en && <p>{s.expiresOn.replace('{fecha}', fmt.date(report.enlace.expira_en))}</p>}
        <p className="portal-footer-brand">Restorify</p>
      </footer>
    </div>
  );
}
