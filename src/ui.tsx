// Ready-made UI kit for Qaicu apps. Import everything you need from HERE —
// components, the data hooks and the format helpers are all re-exported, so one
// line covers most apps:
//
//   import { Container, PageHeader, Card, Field, TextInput, NumberInput,
//            SelectInput, Button, DataTable, EmptyState, Note, useCollection,
//            money, num, today } from './ui';
//
// Everything is already styled via src/index.css (dark/light theme aware). Do
// NOT add Tailwind classes or new CSS frameworks. For one-off styling use inline
// style={{...}} with var(--x) colours (the variables hold complete colours — do
// not wrap them in hsl()).
import React from 'react';

// Re-export the data + format helpers so './ui' is a single import surface.
export * from './format';
// Overlay + picker components (Dialog, Menu, Select, Combobox, Popover) — see components.tsx.
export * from './components';
export {
  useCollection,
  useDataset,
  useQaicuReady,
  getRows,
  ensureDataset,
  upsertRows,
  deleteRows,
  isQaicuAvailable,
  getSession,
  getPlacement,
  canOpenApp,
  openApp,
  getLocation,
  listDatasets,
  listReports,
  runReport,
  getSettings,
  getUserSettings,
  putSettings,
  putUserSettings,
  useSettings,
} from './useQaicu';
export type {
  QaicuRow,
  DimensionSetting,
  DimensionType,
  NavigationPath,
  Placement,
  LocationOptions,
  QaicuLocation,
  QaicuSession,
  DatasetInfo,
  ReportPeriod,
  ReportResult,
  CollectionItem,
} from './useQaicu';

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

/** Page wrapper. Put your whole app inside one <Container>. */
export function Container({ children }: { children: React.ReactNode }) {
  return <main className="container">{children}</main>;
}

/** Page title + optional subtitle and right-aligned actions. */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted" style={{ margin: 0 }}>{subtitle}</p> : null}
      </div>
      {actions ? <div className="inline">{actions}</div> : null}
    </header>
  );
}

/** A bordered card panel with an optional heading. */
export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="card">
      {title ? <h2>{title}</h2> : null}
      {children}
    </section>
  );
}

/** Vertical stack with consistent spacing. */
export function Stack({ children, gap = '0.75rem' }: { children: React.ReactNode; gap?: string }) {
  return <div className="stack" style={{ gap }}>{children}</div>;
}

/** Horizontal row of inputs/buttons that wraps on small widths (aligns to end). */
export function FormRow({ children }: { children: React.ReactNode }) {
  return <div className="row">{children}</div>;
}

/** Inline group (e.g. a set of buttons), centered vertically. */
export function Inline({ children }: { children: React.ReactNode }) {
  return <div className="inline">{children}</div>;
}

// ---------------------------------------------------------------------------
// Form controls — all controlled: pass value + onChange(nextValue: string)
// ---------------------------------------------------------------------------

/** Labelled field wrapper. Inputs below wrap themselves in one when given a `label`. */
export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="field">
      <label>{label}</label>
      {children}
      {hint ? <span className="muted" style={{ fontSize: '0.8rem' }}>{hint}</span> : null}
    </div>
  );
}

function maybeField(label: string | undefined, hint: string | undefined, el: React.ReactNode) {
  return label ? (
    <Field label={label} hint={hint}>
      {el}
    </Field>
  ) : (
    <>{el}</>
  );
}

interface InputBase {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
}

export function TextInput({ value, onChange, label, hint, placeholder, disabled }: InputBase) {
  return maybeField(
    label,
    hint,
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />,
  );
}

export function NumberInput({
  value,
  onChange,
  label,
  hint,
  placeholder,
  disabled,
  step,
  min,
  max,
}: InputBase & { step?: number | string; min?: number; max?: number }) {
  return maybeField(
    label,
    hint,
    <input
      type="number"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      step={step}
      min={min}
      max={max}
      onChange={(e) => onChange(e.target.value)}
    />,
  );
}

export function DateInput({ value, onChange, label, hint, disabled }: InputBase) {
  return maybeField(
    label,
    hint,
    <input type="date" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />,
  );
}

export function TextArea({ value, onChange, label, hint, placeholder, disabled, rows = 3 }: InputBase & { rows?: number }) {
  return maybeField(
    label,
    hint,
    <textarea
      value={value}
      rows={rows}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
    />,
  );
}

/** Dropdown. `options` is a list of strings or { value, label } objects. */
export function SelectInput({
  value,
  onChange,
  options,
  label,
  hint,
  placeholder,
  disabled,
}: InputBase & { options: Array<string | { value: string; label: string }> }) {
  const opts = options.map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
  return maybeField(
    label,
    hint,
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
      {placeholder ? (
        <option value="" disabled>
          {placeholder}
        </option>
      ) : null}
      {opts.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>,
  );
}

/** Checkbox with a label (boolean value). */
export function Checkbox({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label className="inline" style={{ fontWeight: 500 }}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Buttons / feedback / display
// ---------------------------------------------------------------------------

export function Button({
  children,
  onClick,
  variant = 'primary',
  type = 'button',
  disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  type?: 'button' | 'submit';
  disabled?: boolean;
}) {
  return (
    <button type={type} className={variant === 'primary' ? undefined : variant} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** Small success/error message under a form. */
export function Note({ kind = 'ok', children }: { kind?: 'ok' | 'error'; children: React.ReactNode }) {
  return <p className={`note ${kind}`}>{children}</p>;
}

/** Rounded pill label. */
export function Badge({ children }: { children: React.ReactNode }) {
  return <span className="badge">{children}</span>;
}

/** Centered muted message for empty lists. */
export function EmptyState({ message = 'Nothing here yet.', children }: { message?: string; children?: React.ReactNode }) {
  return (
    <p className="muted" style={{ textAlign: 'center', padding: '1.5rem 0' }}>
      {children ?? message}
    </p>
  );
}

/** A single KPI tile. Group several inside <StatRow>. */
export function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-value">{value}</div>
      <div className="stat-label muted">{label}</div>
    </div>
  );
}

export function StatRow({ children }: { children: React.ReactNode }) {
  return <div className="stat-row">{children}</div>;
}

// ---------------------------------------------------------------------------
// Data table — the fastest way to render a list. Auto-shows an empty state.
// ---------------------------------------------------------------------------

export interface Column<T> {
  /** Property to read from each row (used as the header key and default cell value). */
  key: string;
  /** Column header text. */
  label: string;
  /** Optional custom cell renderer (e.g. a button, badge or formatted number). */
  render?: (row: T) => React.ReactNode;
  align?: 'left' | 'right' | 'center';
}

export function DataTable<T extends { id?: string }>({
  columns,
  rows,
  empty = 'Nothing here yet.',
  rowKey,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  empty?: string;
  rowKey?: (row: T, index: number) => string;
}) {
  if (!rows.length) return <EmptyState message={empty} />;
  return (
    <table>
      <thead>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={{ textAlign: c.align ?? 'left' }}>
              {c.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={rowKey ? rowKey(row, i) : row.id ?? String(i)}>
            {columns.map((c) => (
              <td key={c.key} style={{ textAlign: c.align ?? 'left' }}>
                {c.render ? c.render(row) : ((row as Record<string, unknown>)[c.key] as React.ReactNode)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
