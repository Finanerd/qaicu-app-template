// Overlay and picker components for Qaicu apps — the same Radix primitives
// Qaicu's own UI (shadcn) is built on, styled in src/components.css with the
// host's theme variables. Import from './ui' like everything else:
//
//   import { Dialog, ConfirmDialog, Select, Combobox, Menu, Popover } from './ui';
//
// Every component renders into a portal, so it works inside cards and tables
// without overflow clipping, and traps focus / closes on Escape like the host.
import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import * as SelectPrimitive from '@radix-ui/react-select';
import * as PopoverPrimitive from '@radix-ui/react-popover';

// ---------------------------------------------------------------------------
// Icons (inline, no icon library)
// ---------------------------------------------------------------------------

function Chevron({ direction = 'down' }: { direction?: 'down' | 'up' | 'right' }) {
  const rotate = direction === 'up' ? 180 : direction === 'right' ? -90 : 0;
  return (
    <svg className="ck-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" style={{ transform: `rotate(${rotate}deg)` }}>
      <path d="M4 6l4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CheckIcon() {
  return (
    <svg className="ck-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg className="ck-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
export function PlusIcon() {
  return (
    <svg className="ck-icon" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
      <path d="M8 3v10M3 8h10" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Dialog — a modal for creating and editing things.
// ---------------------------------------------------------------------------

/**
 * Controlled modal. Put the form inside; render the footer with the actions.
 *
 *   <Dialog open={open} onOpenChange={setOpen} title="New deal" description="…">
 *     <DealForm … />
 *   </Dialog>
 */
export function Dialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}) {
  // Radix leaves `pointer-events:none` on <body> if StrictMode skips its
  // cleanup; clear it once no modal layer is open (same guard as the host).
  useEffect(() => {
    if (open) return;
    const t = window.setTimeout(() => {
      const still = document.querySelector("[role='dialog'][data-state='open']");
      if (!still && document.body.style.pointerEvents === 'none') document.body.style.pointerEvents = '';
    }, 300);
    return () => window.clearTimeout(t);
  }, [open]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ck-overlay" />
        <DialogPrimitive.Content className={`ck-dialog ck-dialog-${size}`}>
          <div className="ck-dialog-head">
            <div>
              <DialogPrimitive.Title className="ck-dialog-title">{title}</DialogPrimitive.Title>
              {description ? <DialogPrimitive.Description className="ck-dialog-desc">{description}</DialogPrimitive.Description> : null}
            </div>
            <DialogPrimitive.Close className="ck-iconbtn" aria-label="Sulje">
              <CloseIcon />
            </DialogPrimitive.Close>
          </div>
          <div className="ck-dialog-body">{children}</div>
          {footer ? <div className="ck-dialog-foot">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** Yes/no confirmation for destructive actions. Resolves via onConfirm. */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <button type="button" className="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={destructive ? 'danger' : undefined}
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
                onOpenChange(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Menu — a button that opens a list of actions (e.g. one "Create" button).
// ---------------------------------------------------------------------------

export interface MenuItem {
  label: React.ReactNode;
  onSelect: () => void;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  destructive?: boolean;
  disabled?: boolean;
}

/**
 *   <Menu label="New" items={[{ label: 'Deal', onSelect: … }, { label: 'Activity', onSelect: … }]} />
 */
export function Menu({
  label,
  items,
  variant = 'primary',
  align = 'end',
  icon,
}: {
  label: React.ReactNode;
  items: Array<MenuItem | 'separator'>;
  variant?: 'primary' | 'secondary' | 'ghost';
  align?: 'start' | 'end';
  icon?: React.ReactNode;
}) {
  return (
    <DropdownPrimitive.Root modal={false}>
      <DropdownPrimitive.Trigger asChild>
        <button type="button" className={`${variant === 'primary' ? '' : variant} ck-menu-trigger`.trim()}>
          {icon}
          {label}
          <Chevron />
        </button>
      </DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal>
        <DropdownPrimitive.Content className="ck-menu" align={align} sideOffset={6} collisionPadding={8}>
          {items.map((item, i) =>
            item === 'separator' ? (
              <DropdownPrimitive.Separator key={`sep-${i}`} className="ck-menu-sep" />
            ) : (
              <DropdownPrimitive.Item
                key={i}
                className={`ck-menu-item${item.destructive ? ' destructive' : ''}`}
                disabled={item.disabled}
                onSelect={() => item.onSelect()}
              >
                {item.icon ? <span className="ck-menu-icon">{item.icon}</span> : null}
                <span>
                  <span className="ck-menu-label">{item.label}</span>
                  {item.description ? <span className="ck-menu-desc">{item.description}</span> : null}
                </span>
              </DropdownPrimitive.Item>
            ),
          )}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

// ---------------------------------------------------------------------------
// Select — a styled dropdown. Same shape as SelectInput: value + onChange(string).
// ---------------------------------------------------------------------------

export type SelectOption = string | { value: string; label: React.ReactNode; description?: React.ReactNode };

const EMPTY = '__empty__';

/**
 * Option values must be non-empty strings (Radix rule). Pass value '' to show
 * the placeholder; if you need an "all" choice, give it a real value like 'all'.
 *
 *   <Select label="Stage" value={stage} onChange={setStage} options={['Lead', 'Offer']} />
 */
export function Select({
  value,
  onChange,
  options,
  label,
  hint,
  placeholder = 'Select…',
  disabled,
  size = 'md',
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  label?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  size?: 'sm' | 'md';
  ariaLabel?: string;
}) {
  const id = useId();
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  const control = (
    <SelectPrimitive.Root value={value || EMPTY} onValueChange={(v) => onChange(v === EMPTY ? '' : v)} disabled={disabled}>
      <SelectPrimitive.Trigger className={`ck-select ck-select-${size}`} id={label ? id : undefined} aria-label={ariaLabel}>
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon asChild>
          <Chevron />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content className="ck-popper" position="popper" sideOffset={4} collisionPadding={8}>
          <SelectPrimitive.Viewport className="ck-listbox">
            {/* Hidden sentinel so an empty value has an item to resolve to. */}
            <SelectPrimitive.Item value={EMPTY} className="ck-option" style={{ display: 'none' }}>
              <SelectPrimitive.ItemText>{placeholder}</SelectPrimitive.ItemText>
            </SelectPrimitive.Item>
            {opts.map((o) => (
              <SelectPrimitive.Item key={o.value} value={o.value} className="ck-option" disabled={!o.value}>
                <span className="ck-option-check">
                  <SelectPrimitive.ItemIndicator>
                    <CheckIcon />
                  </SelectPrimitive.ItemIndicator>
                </span>
                <span>
                  <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                  {o.description ? <span className="ck-option-desc">{o.description}</span> : null}
                </span>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
  if (!label) return control;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {hint ? <span className="muted" style={{ fontSize: '0.8rem' }}>{hint}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Combobox — a searchable select for long lists (customers, products…).
// ---------------------------------------------------------------------------

export interface ComboboxOption {
  value: string;
  label: string;
  description?: string;
}

export function Combobox({
  value,
  onChange,
  options,
  label,
  hint,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches.',
  disabled,
  allowClear = true,
  clearLabel = 'Clear selection',
  onCreate,
  createLabel = 'Create new',
}: {
  value: string;
  onChange: (value: string) => void;
  options: ComboboxOption[];
  label?: string;
  hint?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  allowClear?: boolean;
  clearLabel?: string;
  /** When given, the list ends with a "create" row that receives the typed search text. */
  onCreate?: (query: string) => void;
  createLabel?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => `${o.label} ${o.description ?? ''}`.toLowerCase().includes(q)) : options;
  }, [options, query]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setActive(Math.max(0, filtered.findIndex((o) => o.value === value)));
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const pick = (v: string) => {
    onChange(v);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((a) => Math.min(filtered.length - 1, a + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((a) => Math.max(0, a - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[active]) pick(filtered[active].value);
      else if (onCreate) {
        setOpen(false);
        onCreate(query.trim());
      }
    }
  };

  const control = (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className={`ck-select ck-select-md${selected ? '' : ' placeholder'}`} id={label ? id : undefined} disabled={disabled} role="combobox" aria-expanded={open}>
          <span className="ck-select-text">{selected ? selected.label : placeholder}</span>
          <Chevron />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="ck-popper ck-combobox" align="start" sideOffset={4} collisionPadding={8} onOpenAutoFocus={(e) => e.preventDefault()}>
          <input
            ref={inputRef}
            className="ck-combobox-input"
            value={query}
            placeholder={searchPlaceholder}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
            aria-autocomplete="list"
          />
          <div className="ck-listbox" role="listbox">
            {allowClear && value ? (
              <div className="ck-option muted" role="option" aria-selected={false} onClick={() => pick('')}>
                <span className="ck-option-check" />
                <span>{clearLabel}</span>
              </div>
            ) : null}
            {filtered.length === 0 ? <div className="ck-empty">{emptyText}</div> : null}
            {filtered.map((o, i) => (
              <div
                key={o.value}
                role="option"
                aria-selected={o.value === value}
                className={`ck-option${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => pick(o.value)}
              >
                <span className="ck-option-check">{o.value === value ? <CheckIcon /> : null}</span>
                <span>
                  {o.label}
                  {o.description ? <span className="ck-option-desc">{o.description}</span> : null}
                </span>
              </div>
            ))}
            {onCreate ? (
              <div
                className="ck-option ck-create"
                role="option"
                aria-selected={false}
                onClick={() => {
                  setOpen(false);
                  onCreate(query.trim());
                }}
              >
                <span className="ck-option-check">
                  <PlusIcon />
                </span>
                <span>
                  {createLabel}
                  {query.trim() ? <span className="ck-option-desc">{query.trim()}</span> : null}
                </span>
              </div>
            ) : null}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
  if (!label) return control;
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {control}
      {hint ? <span className="muted" style={{ fontSize: '0.8rem' }}>{hint}</span> : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Popover — small floating panel anchored to a trigger (filters, help).
// ---------------------------------------------------------------------------

export function Popover({
  trigger,
  children,
  align = 'start',
  open,
  onOpenChange,
}: {
  trigger: React.ReactElement;
  children: React.ReactNode;
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content className="ck-popper ck-popover" align={align} sideOffset={6} collisionPadding={8}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
