import { useMemo, useRef, useState } from 'react';
import { FileSignature } from 'lucide-react';
import PortalSection from '../PortalSection';
import type { Formatters, PortalStrings } from '../format';
import { answerQuote } from '../portal.api';
import type { PortalQuote, PortalQuoteLine } from '../portal.types';
import { ConfirmDialog } from './ConfirmDialog';

export interface QuoteSectionProps {
  quote: PortalQuote;
  token: string;
  s: PortalStrings;
  fmt: Formatters;
  onAnswered: (message?: string) => Promise<void>;
}

/**
 * El presupuesto que espera la respuesta del cliente. Nada viene marcado: autorizar
 * es una decisión explícita, línea por línea, con su nombre como constancia.
 */
export function QuoteSection({ quote, token, s, fmt, onAnswered }: QuoteSectionProps) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState(false);
  const [pendingIds, setPendingIds] = useState<string[] | null>(null);
  const [nameError, setNameError] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  const jobsMap = useMemo(() => new Map((quote.trabajos ?? []).map((t) => [t.id, t])), [quote.trabajos]);

  type DisplayGroup =
    | { kind: 'job'; job: { id: string; titulo: string; total: number }; lines: PortalQuoteLine[] }
    | { kind: 'line'; line: PortalQuoteLine };

  const groups = useMemo<DisplayGroup[]>(() => {
    const list: DisplayGroup[] = [];
    const seenJobs = new Set<string>();

    for (const line of quote.lineas) {
      if (line.trabajo_id && jobsMap.has(line.trabajo_id)) {
        if (!seenJobs.has(line.trabajo_id)) {
          seenJobs.add(line.trabajo_id);
          const job = jobsMap.get(line.trabajo_id)!;
          const jobLines = quote.lineas.filter((l) => l.trabajo_id === line.trabajo_id);
          list.push({ kind: 'job', job, lines: jobLines });
        }
      } else {
        list.push({ kind: 'line', line });
      }
    }
    return list;
  }, [quote.lineas, jobsMap]);

  const toggleLine = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleJob = (lines: PortalQuoteLine[]) =>
    setSelected((prev) => {
      const next = new Set(prev);
      const allChecked = lines.length > 0 && lines.every((l) => next.has(l.id));
      if (allChecked) {
        lines.forEach((l) => next.delete(l.id));
      } else {
        lines.forEach((l) => next.add(l.id));
      }
      return next;
    });

  const total = useMemo(() => {
    let sum = 0;
    for (const group of groups) {
      if (group.kind === 'job') {
        const isApproved = group.lines.length > 0 && group.lines.every((l) => selected.has(l.id));
        if (isApproved) {
          sum += Number(group.job.total);
        }
      } else {
        if (selected.has(group.line.id)) {
          sum += Number(group.line.monto);
        }
      }
    }
    return sum;
  }, [groups, selected]);

  // El cliente ve un trabajo agrupado como una sola fila: cuenta 1, con todas sus líneas
  // marcadas, igual que una línea suelta. (`selected` cuenta líneas, no filas.)
  const approvedItemCount = useMemo(
    () =>
      groups.filter((group) =>
        group.kind === 'job'
          ? group.lines.length > 0 && group.lines.every((l) => selected.has(l.id))
          : selected.has(group.line.id),
      ).length,
    [groups, selected],
  );

  const nameOk = name.trim().length >= 2;

  const requestConfirm = (approvedIds: string[]) => {
    if (!nameOk) {
      setNameError(true);
      nameRef.current?.focus();
      return;
    }
    setNameError(false);
    setPendingIds(approvedIds);
  };

  const submit = async (approvedIds: string[]) => {
    setSending(true);
    setMessage(null);
    try {
      const result = await answerQuote(token, {
        quoteId: quote.id,
        approvedIds,
        shownIds: quote.lineas.map((l) => l.id),
        name: name.trim(),
        comment: comment.trim(),
      });
      if (result.ok) {
        await onAnswered(s.answered);
        return;
      }
      setMessage({ ok: false, text: s.answerErrors[result.motivo] ?? s.answerErrors.solicitud_invalida });
      // El presupuesto ya no es el que el cliente tiene en pantalla: se vuelve a pedir.
      if (result.motivo !== 'nombre_requerido') await onAnswered();
    } catch {
      setMessage({ ok: false, text: s.answerErrors.red });
    } finally {
      setPendingIds(null);
      setSending(false);
    }
  };

  // Solo llega el presupuesto que espera respuesta: siempre abierto.
  const defaultOpen = true;

  return (
    <PortalSection
      id="presupuesto"
      icon={FileSignature}
      title={s.quoteTitle}
      defaultOpen={defaultOpen}
      className="portal-quote is-highlighted"
    >
      <p className="portal-muted">{s.quoteSentOn.replace('{fecha}', fmt.date(quote.enviado_en))}</p>
      <p>{s.quoteIntro}</p>

      <div className="portal-quote-select">
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set(quote.lineas.map((l) => l.id)))}>
          {s.selectAll}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setSelected(new Set())}>
          {s.selectNone}
        </button>
      </div>

      <ul className="portal-quote-lines">
        {groups.map((group) => {
          if (group.kind === 'job') {
            const isJobSelected = group.lines.length > 0 && group.lines.every((l) => selected.has(l.id));
            return (
              <li key={`job-${group.job.id}`}>
                <label className={'portal-quote-line' + (isJobSelected ? ' is-selected' : '')}>
                  <input
                    type="checkbox"
                    checked={isJobSelected}
                    onChange={() => toggleJob(group.lines)}
                  />
                  <span className="portal-quote-desc">
                    <strong>{group.job.titulo}</strong>
                  </span>
                  <span className="portal-quote-amount">{fmt.money(group.job.total)}</span>
                </label>
                <div className="portal-quote-sublines">
                  <span className="portal-quote-sublines-header">{s.quoteIncludes}:</span>
                  <ul className="portal-quote-sublist">
                    {group.lines.map((line) => (
                      <li key={line.id} className="portal-quote-subline">
                        <span>
                          {line.descripcion}
                          {line.cantidad > 1 && (
                            <span className="portal-muted">
                              {' · '}
                              {s.quantityTimes
                                .replace('{cantidad}', String(line.cantidad))
                                .replace('{precio}', fmt.money(line.precio_unitario))}
                            </span>
                          )}
                        </span>
                        <span className="portal-muted">{fmt.money(line.monto)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </li>
            );
          }

          const line = group.line;
          return (
            <li key={line.id}>
              <label className={'portal-quote-line' + (selected.has(line.id) ? ' is-selected' : '')}>
                <input type="checkbox" checked={selected.has(line.id)} onChange={() => toggleLine(line.id)} />
                <span className="portal-quote-desc">
                  {line.descripcion}
                  {line.cantidad > 1 && (
                    <span className="portal-muted">
                      {' · '}
                      {s.quantityTimes
                        .replace('{cantidad}', String(line.cantidad))
                        .replace('{precio}', fmt.money(line.precio_unitario))}
                    </span>
                  )}
                </span>
                <span className="portal-quote-amount">{fmt.money(line.monto)}</span>
              </label>
            </li>
          );
        })}
      </ul>

      <div className="portal-line is-balance">
        <span>{s.selectedTotal}</span>
        <span>{fmt.money(total)}</span>
      </div>

      <div className="portal-field">
        <label htmlFor="quote-name">{s.yourName}</label>
        <input
          ref={nameRef}
          id="quote-name"
          className="form-input"
          value={name}
          onChange={(e) => {
            const next = e.target.value;
            setName(next);
            if (nameError && next.trim().length >= 2) setNameError(false);
          }}
          autoComplete="name"
          maxLength={120}
          aria-invalid={nameError || undefined}
          aria-describedby={nameError ? 'quote-name-error' : undefined}
        />
        {nameError && (
          <p id="quote-name-error" className="portal-error" role="alert">
            {s.answerErrors.nombre_requerido}
          </p>
        )}
        <p className="portal-muted">{s.yourNameHint}</p>
      </div>
      <div className="portal-field">
        <label htmlFor="quote-comment">{s.comment}</label>
        <textarea id="quote-comment" className="form-input form-textarea" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} />
      </div>

      <div className="portal-actions">
        <button type="button" className="btn btn-primary" disabled={sending || selected.size === 0} onClick={() => requestConfirm([...selected])}>
          {s.authorize}
          {approvedItemCount > 0 && ` (${approvedItemCount})`}
        </button>
        <button type="button" className="btn btn-secondary" disabled={sending} onClick={() => requestConfirm([])}>
          {s.rejectAll}
        </button>
      </div>
      {message && (
        <p className={message.ok ? 'portal-success' : 'portal-error'} role="status">
          {message.text}
        </p>
      )}
      {pendingIds !== null && (
        <ConfirmDialog
          title={pendingIds.length === 0 ? s.confirmRejectTitle : s.confirmApproveTitle}
          message={
            pendingIds.length === 0
              ? s.confirmRejectAll
              : (approvedItemCount === 1 ? s.confirmApproveOne : s.confirmApproveMany)
                  .replace('{count}', String(approvedItemCount))
                  .replace('{total}', fmt.money(total))
          }
          confirmLabel={pendingIds.length === 0 ? s.confirmRejectBtn : s.confirmApproveBtn}
          cancelLabel={s.confirmBack}
          busy={sending}
          onConfirm={() => void submit(pendingIds)}
          onCancel={() => {
            if (!sending) setPendingIds(null);
          }}
        />
      )}
    </PortalSection>
  );
}
