import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2 } from 'lucide-react';

interface ComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  /** Shown while suggestions are still being fetched. */
  loading?: boolean;
  /** Shown instead of the list when nothing matches what was typed. */
  emptyLabel?: string;
  disabled?: boolean;
  inputId?: string;
  /** Cap on rendered options: vPIC returns hundreds of models for some makes. */
  maxOptions?: number;
}

/**
 * Free-text input with a filtered suggestion list. Free text always wins — the
 * shop has to be able to type a model or brand the suggestion source has never
 * heard of (classics, imports, custom builds).
 */
export default function Combobox({
  value,
  onChange,
  options,
  placeholder,
  loading = false,
  emptyLabel,
  disabled = false,
  inputId,
  maxOptions = 60,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const wrapRef = useRef<HTMLDivElement>(null);
  const listId = useId();

  const matches = useMemo(() => {
    const needle = value.trim().toLowerCase();
    const pool = needle
      ? options.filter((o) => o.toLowerCase().includes(needle))
      : options;
    return pool.slice(0, maxOptions);
  }, [options, value, maxOptions]);

  // Close when the click lands anywhere else — the field lives inside a modal
  // where a blur handler alone would fight with the option's own mousedown.
  useEffect(() => {
    if (!open) return;
    const onDocDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    return () => document.removeEventListener('mousedown', onDocDown);
  }, [open]);

  const select = (option: string) => {
    onChange(option);
    setOpen(false);
    setHighlight(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        return;
      }
      const step = e.key === 'ArrowDown' ? 1 : -1;
      setHighlight((h) => {
        if (matches.length === 0) return -1;
        const next = h + step;
        if (next < 0) return matches.length - 1;
        if (next >= matches.length) return 0;
        return next;
      });
    } else if (e.key === 'Enter' && open && highlight >= 0 && matches[highlight]) {
      e.preventDefault();
      select(matches[highlight]);
    } else if (e.key === 'Escape' && open) {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className="combo" ref={wrapRef}>
      <input
        id={inputId}
        className="form-input combo-input"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
        disabled={disabled}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setHighlight(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <span className="combo-adornment">
        {loading ? <Loader2 size={16} className="spin" /> : <ChevronDown size={16} />}
      </span>

      {open && (options.length > 0 || loading || emptyLabel) && (
        <div className="combo-menu" id={listId} role="listbox">
          {matches.map((option, i) => (
            <button
              type="button"
              role="option"
              aria-selected={option === value}
              key={option}
              className={`combo-option${i === highlight ? ' is-active' : ''}`}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => select(option)}
            >
              {option}
            </button>
          ))}
          {matches.length === 0 && (
            <div className="combo-empty">{loading ? '…' : emptyLabel}</div>
          )}
        </div>
      )}
    </div>
  );
}
