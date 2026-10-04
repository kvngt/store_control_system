import { useRef, type KeyboardEvent, type ReactNode } from 'react';

export interface TabItem {
  id: string;
  label: string;
  /** Un número al lado del nombre (cuántas líneas, cuántos archivos…). Se omite en 0. */
  count?: number;
  /** Un punto que pide atención (hay algo sin autorizar, un hallazgo pendiente…). */
  attention?: boolean;
  /** Texto para lectores de pantalla cuando hay `attention`. */
  attentionLabel?: string;
}

interface TabsProps {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  /** Prefijo de los id del DOM, para enlazar cada pestaña con su panel. */
  idPrefix: string;
  ariaLabel: string;
}

/**
 * Pestañas accesibles (`role="tablist"`): flechas, Inicio y Fin mueven el foco y eligen.
 *
 * Usan las clases `.tabs` / `.tab` que ya existían en `components.css` sin componente que las
 * usara. La primera pantalla que las usa es el detalle de la orden en escritorio, que apilaba
 * hasta doce tarjetas (pedido del taller, 03/10/2026).
 */
export default function Tabs({ tabs, active, onChange, idPrefix, ariaLabel }: TabsProps) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const focus = (index: number) => {
    const tab = tabs[(index + tabs.length) % tabs.length];
    onChange(tab.id);
    refs.current[tab.id]?.focus();
  };

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (e.key === 'ArrowRight') focus(index + 1);
    else if (e.key === 'ArrowLeft') focus(index - 1);
    else if (e.key === 'Home') focus(0);
    else if (e.key === 'End') focus(tabs.length - 1);
    else return;
    e.preventDefault();
  };

  return (
    <div role="tablist" aria-label={ariaLabel} className="tabs tabs-bar">
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              refs.current[tab.id] = el;
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls={`${idPrefix}-panel-${tab.id}`}
            tabIndex={selected ? 0 : -1}
            className={'tab' + (selected ? ' active' : '')}
            onClick={() => onChange(tab.id)}
            onKeyDown={(e) => onKeyDown(e, index)}
          >
            {tab.label}
            {!!tab.count && <span className="tab-count">{tab.count}</span>}
            {tab.attention && (
              <span className="tab-attention" role="img" aria-label={tab.attentionLabel ?? ''} />
            )}
          </button>
        );
      })}
    </div>
  );
}

interface TabPanelProps {
  id: string;
  idPrefix: string;
  active: boolean;
  children: ReactNode;
}

/**
 * El contenido de una pestaña. Se esconde con `hidden` en vez de desmontarse: lo que se estaba
 * escribiendo o firmando en otra pestaña sigue ahí al volver (igual que `MobileSection`).
 */
export function TabPanel({ id, idPrefix, active, children }: TabPanelProps) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${id}`} aria-labelledby={`${idPrefix}-tab-${id}`} hidden={!active}>
      {children}
    </div>
  );
}
