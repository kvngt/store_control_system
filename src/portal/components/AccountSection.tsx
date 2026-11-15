import { Check, Receipt } from 'lucide-react';
import PortalSection from '../PortalSection';
import { toDate, type Formatters, type PortalStrings } from '../format';
import type { PortalReport } from '../portal.types';
import type { PortalLanguage } from '../strings';

export interface AccountSectionProps {
  report: PortalReport;
  s: PortalStrings;
  fmt: Formatters;
  language: PortalLanguage;
}

export function AccountSection({ report, s, fmt, language }: AccountSectionProps) {
  const { cuenta } = report;
  const hasLines =
    cuenta.mano_obra.length > 0 || cuenta.repuestos.length > 0 || (cuenta.no_autorizados ?? []).length > 0;
  const hasMovements =
    Number(cuenta.total) !== 0 ||
    Number(cuenta.deposito) > 0 ||
    Math.abs(Number(cuenta.pagado ?? 0)) > 0.009 ||
    Math.abs(Number(cuenta.otros_pagos ?? 0)) > 0.009;

  let parkingNotice: string | null = null;
  if (cuenta.parqueo) {
    const p = cuenta.parqueo;
    if (p.estado === 'por_empezar' && p.inicio) {
      const dAnt = toDate(p.inicio);
      // `toDate` da el mediodía UTC: se resta en UTC para no depender de la zona del teléfono.
      dAnt.setUTCDate(dAnt.getUTCDate() - 1);
      parkingNotice = s.parkingNoticeReady
        .replace('{hasta}', fmt.date(dAnt.toISOString().slice(0, 10)))
        .replace('{inicio}', fmt.date(p.inicio))
        .replace('{tarifa}', fmt.money(p.tarifa_inicial));
    } else if (p.estado === 'esperando') {
      const policy = language === 'en' ? (p.politica_en || p.politica_es) : (p.politica_es || p.politica_en);
      parkingNotice = policy || s.parkingNoticeWaiting
        .replace('{dias}', String(p.dias_gracia))
        .replace('{tarifa}', fmt.money(p.tarifa_inicial));
    } else if (p.estado === 'acumulando' && p.inicio) {
      parkingNotice = s.parkingNoticeAccruingInsurance.replace('{inicio}', fmt.date(p.inicio));
    }
  }

  return (
    <PortalSection
      icon={Receipt}
      title={s.accountTitle}
      // Con la tarjeta cerrada, lo mismo que dice su última línea: el saldo, a favor o pagado.
      summary={
        Number(cuenta.saldo) < -0.009
          ? `${s.credit}: ${fmt.money(-Number(cuenta.saldo))}`
          : Number(cuenta.total) > 0 && Number(cuenta.saldo) <= 0.009
            ? s.paidInFull
            : `${s.balance}: ${fmt.money(cuenta.saldo)}`
      }
      defaultOpen={false}
    >
      {parkingNotice && (
        <div className="portal-parking-notice">
          <p>{parkingNotice}</p>
        </div>
      )}
      {!hasLines && !hasMovements ? (
        <p className="portal-muted">{s.noCharges}</p>
      ) : (
        <>
          {cuenta.mano_obra.length > 0 && (
            <div className="portal-lines">
              <div className="portal-label">{s.labor}</div>
              {cuenta.mano_obra.map((line, i) => (
                <div key={i} className="portal-line">
                  <span>{line.descripcion}</span>
                  <span>{fmt.money(line.monto)}</span>
                </div>
              ))}
            </div>
          )}
          {cuenta.repuestos.length > 0 && (
            <div className="portal-lines">
              <div className="portal-label">{s.parts}</div>
              {cuenta.repuestos.map((line, i) => (
                <div key={i} className="portal-line">
                  <span>
                    {line.descripcion}
                    {line.cantidad > 1 && (
                      <span className="portal-muted">
                        {' '}
                        · {s.quantityShort} {line.cantidad} × {fmt.money(line.precio_unitario)}
                      </span>
                    )}
                  </span>
                  <span>{fmt.money(line.subtotal)}</span>
                </div>
              ))}
            </div>
          )}
          {(cuenta.no_autorizados ?? []).length > 0 && (
            <div className="portal-lines portal-not-authorized">
              {/* En una retirada sin reparar, lo que no se cobra no es que no lo autorizara: no se hizo. */}
              <div className="portal-label">{report.orden.retirada_sin_reparar ? s.notPerformed : s.notAuthorized}</div>
              {(cuenta.no_autorizados ?? []).map((line, i) => (
                <div key={i} className="portal-line">
                  <span>{line.descripcion}</span>
                  <span>{fmt.money(line.monto)}</span>
                </div>
              ))}
            </div>
          )}
          <div className="portal-totals">
            {/* El descuento lo absorbe el taller: se muestra el subtotal y lo que se descontó. */}
            {Number(cuenta.descuento ?? 0) > 0 && (
              <>
                <div className="portal-line">
                  <span>{s.subtotal}</span>
                  <span>{fmt.money(cuenta.subtotal ?? Number(cuenta.total) + Number(cuenta.descuento))}</span>
                </div>
                <div className="portal-line">
                  <span>{s.discount}</span>
                  <span>−{fmt.money(cuenta.descuento ?? 0)}</span>
                </div>
              </>
            )}
            {cuenta.parqueo && Number(cuenta.parqueo.monto) > 0 && (
              <div className="portal-line">
                <span>
                  {s.parking}
                  <span className="portal-muted">
                    {/* Con tope, días × tarifa no daría el monto: se dice que hay tope. */}
                    {' '}· {cuenta.parqueo.tope_aplicado
                      ? `${cuenta.parqueo.dias} ${cuenta.parqueo.dias === 1 ? s.day : s.days} · ${s.parkingCapApplied}`
                      : cuenta.parqueo.detalle && cuenta.parqueo.detalle.length > 1
                        ? cuenta.parqueo.detalle.map((d) => `${d.dias} ${d.dias === 1 ? s.day : s.days} × ${fmt.money(d.tarifa)}`).join(' + ')
                        : `${cuenta.parqueo.dias} ${cuenta.parqueo.dias === 1 ? s.day : s.days} × ${fmt.money(cuenta.parqueo.tarifa_inicial)}`}
                  </span>
                </span>
                <span>{fmt.money(cuenta.parqueo.monto)}</span>
              </div>
            )}
            <div className="portal-line is-total">
              <span>{s.total}</span>
              <span>{fmt.money(cuenta.total)}</span>
            </div>
            {Number(cuenta.deposito) > 0 && (
              <div className="portal-line">
                <span>{s.deposit}</span>
                <span>{fmt.money(cuenta.deposito)}</span>
              </div>
            )}
            {/* Lo cobrado después del depósito, aparte: "Pagado" incluía el depósito y se leía
                como si hubiera pagado dos veces (05/10/2026). La base anterior no lo manda. */}
            {cuenta.otros_pagos === undefined ? (
              Number(cuenta.pagado) > 0 && (
                <div className="portal-line">
                  <span>{s.paid}</span>
                  <span>{fmt.money(cuenta.pagado)}</span>
                </div>
              )
            ) : Number(cuenta.otros_pagos) > 0.009 ? (
              <div className="portal-line">
                <span>{s.otherPayments}</span>
                <span>{fmt.money(cuenta.otros_pagos)}</span>
              </div>
            ) : Number(cuenta.otros_pagos) < -0.009 ? (
              <div className="portal-line">
                <span>{s.refunded}</span>
                <span>{fmt.money(-Number(cuenta.otros_pagos))}</span>
              </div>
            ) : null}
            {Number(cuenta.saldo) < -0.009 ? (
              <div className="portal-line is-balance is-credit">
                <span>{s.credit}</span>
                <span>{fmt.money(-Number(cuenta.saldo))}</span>
              </div>
            ) : Number(cuenta.total) > 0 && Number(cuenta.saldo) <= 0.009 ? (
              <div className="portal-line is-balance is-settled">
                <span>{s.paidInFull}</span>
                <Check size={16} />
              </div>
            ) : (
              <div className="portal-line is-balance">
                <span>{s.balance}</span>
                <span>{fmt.money(cuenta.saldo)}</span>
              </div>
            )}
          </div>
        </>
      )}
      {(report.presupuestos_respondidos ?? []).length > 0 && (
        <div className="portal-quote-history">
          <div className="portal-label">{s.historyTitle}</div>
          <ul>
            {(report.presupuestos_respondidos ?? []).map((q) => (
              <li key={q.numero}>
                <div>
                  {s.historyItem
                    .replace('{numero}', String(q.numero))
                    .replace('{via}', s.via[q.via] ?? q.via)
                    .replace('{fecha}', fmt.dateTime(q.respondido_en))}
                  {q.nombre && q.via !== 'firma_recepcion' && ` ${s.historyBy.replace('{nombre}', q.nombre)}`}
                </div>
                <div className="portal-muted">
                  {s.historyCounts
                    .replace('{autorizados}', String(q.autorizados))
                    .replace('{rechazados}', String(q.rechazados))
                    .replace('{total}', fmt.money(q.total_aprobado ?? 0))}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PortalSection>
  );
}
