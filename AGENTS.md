# Building a Qaicu app

You are in the template for a **Qaicu app**: a small React app that runs inside
the Qaicu product, on a page of it, reading and writing that company's own data.

Your job: replace `src/App.tsx` with the app that was asked for, keep the tests
passing, and deploy it.

```
npm install
npm run dev       # the app, with a local stand-in for Qaicu
npm run check     # typecheck + tests — run this before deploying
npm run deploy    # build and push it into Qaicu
```

## Hard rules

- **Keep the default export named `App`** in `src/App.tsx`.
- **Qaicu data goes through the data hooks below.** The app holds no Qaicu
  token, API URL or company id: the host makes those calls with the viewer's
  permissions.
- **No CSS framework is installed.** `flex`, `p-4`, `text-xl`, `bg-gray-100` do
  NOTHING. Style with the components below, the classes in `src/index.css`, and
  inline `style={{…}}`.
- **Colours only as `var(--…)`** (`var(--primary)`, `var(--chart-1)`). Never a
  hex/rgb literal, and never wrapped in `hsl(…)` — each variable already holds a
  complete colour, which is what lets Qaicu inject the user's live theme.
- **The build must stay ONE self-contained `dist/index.html`.** It is served from
  a `blob:` URL, so bundle what the page is built from: no CDN scripts, no web fonts, no
  remote images. `vite-plugin-singlefile` does this — leave it in place.
- **Do not rewrite the helpers** (`src/ui.tsx`, `components.tsx`, `format.ts`,
  `qaicu.ts`, `useQaicu.ts`, `index.css`, `components.css`). Import from `./ui`.
- **No page-level app-name heading.** Qaicu draws the title in the frame around
  the app. Start with the actual content. Section headings inside are fine.

## Everything comes from `./ui`

```tsx
import {
  // layout
  Container, PageHeader, Card, Stack, FormRow, Inline,
  // form controls (controlled: value + onChange(next: string))
  Field, TextInput, NumberInput, DateInput, TextArea, SelectInput, Checkbox,
  // pickers and overlays (the same Radix primitives Qaicu's own UI uses)
  Select, Combobox, Menu, Dialog, ConfirmDialog, Popover, PlusIcon,
  // display / feedback
  Button, Note, Badge, EmptyState, Stat, StatRow, DataTable,
  // data
  useCollection, useDataset, upsertRows, deleteRows,
  // where it runs (see "On a dashboard")
  getPlacement, canOpenApp, openApp,
  // the viewer's position (see "Location")
  getLocation,
  // format
  num, money, decimal, percent, sum, groupBy, today, formatDate, uid,
} from './ui';
```

- `<Container>` wraps the whole app. `<PageHeader title subtitle actions />`;
  `<Card title?>` a bordered panel; `<FormRow>` a horizontal wrapping row,
  `<Stack>` vertical, `<Inline>` a button group.
- Every input takes `label value onChange` and wraps itself in a `<Field>`.
  `NumberInput` also `step min max`, `TextArea` `rows`, `SelectInput`
  `options=[…]`, `Checkbox` `checked`.
- `<Button onClick variant?>` — `primary` (default) | `secondary` | `ghost` | `danger`.
- `<DataTable rows columns empty? />` is the fast list view and renders its own
  empty state. `columns={[{ key, label, align?, render?: row => ReactNode }]}`.
- `<Stat label value />` inside `<StatRow>`; `<Note kind="ok"|"error">`,
  `<Badge>`, `<EmptyState message>`.

### Pickers and overlays (`src/components.tsx`)

Use these instead of the native `<select>` and instead of forms that unfold
inline and push the page around. They render into portals, trap focus and
close on Escape, and look like the rest of Qaicu.

- `<Select label value onChange options placeholder size="sm"|"md" />` — a
  styled dropdown with the same shape as `SelectInput`. Option values must be
  non-empty strings; `value=""` shows the placeholder. For an "all" choice use
  a real value such as `'all'`.
- `<Combobox label value onChange options placeholder searchPlaceholder />` —
  a searchable select for long lists (customers, products). `options` are
  `{ value, label, description? }`; `allowClear` (default true) adds a
  "clear" row; `onCreate(query)` + `createLabel` add a "create new…" row at
  the end, for opening a create dialog straight from the picker.
- `<Menu label items />` — one button that opens a list of actions. Put a
  single **Create** menu top-right and let it list what can be created, like
  the dashboard's widget picker: `items={[{ label: 'Deal', description: '…',
  onSelect }, 'separator', …]}`.
- `<Dialog open onOpenChange title description footer size>` — a modal. Put
  the create/edit form inside; the form's own submit and cancel buttons stay
  in the body, or pass `footer` for actions.
- `<ConfirmDialog open onOpenChange title description confirmLabel destructive
  onConfirm />` — yes/no before a delete.
- `<Popover trigger>` — a small anchored panel (filters, help).

Pattern that works well: the shell owns the modals (`creating`, `editing`
state) and hands views an `actions` object (`createDeal(defaults)`,
`editDeal(deal)`…). Views stay read-only lists; every write starts from a
button and lands in a modal.
- `num(x)` parses a stored number, `sum(items, i => i.Amount)` totals one,
  `money(x)` formats one.

## Data

Qaicu stores data as **datasets** (tables) of **rows**. A row is a stable
`externalId` plus a map of `{ dimensionName: value }`, and **every value is a
string** — dates `YYYY-MM-DD`, numbers `"12.5"`. A dimension's `type` is one of
`Text | Number | Date | Select` (for `Select`, pass `values: [{ name: 'a' }]`).

`useCollection` is the whole data layer for CRUD over one dataset. It ensures the
dataset exists, flattens rows into items, and gives you add/update/remove that
handle ids and string conversion. The list updates from the write itself — never
reload after one:

```tsx
const { items, loading, add, update, remove } = useCollection('Expenses', [
  { name: 'Date',   type: 'Date' },
  { name: 'Amount', type: 'Number' },
  { name: 'Note',   type: 'Text' },
]);
// items -> [{ id, Date, Amount, Note }, …]   (every field is a string)
await add({ Date: today(), Amount: 12.5, Note: 'Lunch' }); // returns the new id
await update(item.id, { Note: 'Dinner' });                 // merges into that row
await remove(item.id);
```

For read-only or multi-dataset cases use `useDataset(name, dims)` →
`{ rows, loading, reload }` and call `upsertRows` / `deleteRows` yourself.
`getRows(name)` returns every row, newest first.

`getSession()` tells who has the app open — `user.name`, `user.email`,
`company.name`, `language` — once `useQaicuReady()` is true.
`runReport(nameOrId, { from, to })` runs one of the company's saved reports.

The app has two JSON objects of its own, each at most 64 kB and replaced whole
by its put: **settings**, shared by everyone in the company who uses the app
(targets, choices an admin makes), and **user settings**, the viewer's own
(their filters, their defaults). `useSettings()` / `useSettings('user')` give
them as state with a save; outside components use `getSettings()`,
`putSettings(obj)`, `getUserSettings()`, `putUserSettings(obj)`. Keep data in
datasets, not in settings.

The first time the app reaches for a dataset, Qaicu asks the person whether to
allow it. A refused dataset makes that call reject — so a read of someone else's
table (`Partners`) should fall back to an empty list, not crash.

Pick dataset names deliberately: they are the company's own tables, shared with
everything else in Qaicu. `TimeEntries` is a table someone else can also report
on; `MyAppData` is not.

## Location

The app's sandboxed frame has no origin of its own, so the browser will not
grant it the location: **`navigator.geolocation` does not work — use
`getLocation()`**, which asks through Qaicu.

```tsx
try {
  const { latitude, longitude, accuracy } = await getLocation(); // or getLocation({ highAccuracy, timeoutMs })
  showOnMap(latitude, longitude, accuracy);
} catch (error) {
  showAddressField(error instanceof Error ? error.message : String(error)); // always offer another way
}
```

It resolves to `{ latitude, longitude, accuracy, altitude, heading, speed,
timestamp }`: degrees; `accuracy` in metres at 68 % confidence; `altitude` (m),
`heading` (° clockwise from north) and `speed` (m/s) may be null; `timestamp` in
ms since the epoch. `highAccuracy` (default false) buys GPS precision with
battery and delay; `timeoutMs` defaults to 10000 and is clamped to 1000–60000.

- **It rejects, and often.** Always catch it and offer another way, such as an
  address or place search. `error.message` is readable as is, e.g. "The person
  did not allow their location to be used."
- **Ask when it is needed, never on start.** The browser shows a permission
  prompt the first time. Asked where the person does something that needs the
  location, they understand why and say yes more often.
- **One reading per call.** There is no watching: ask again when a fresh
  position is needed, never in a tight loop.
- **Accuracy varies wildly**: metres on a phone, kilometres on a desktop
  (IP-based). Show it or allow for it; do not assume street level.
- `getLocation()` waits for the bridge itself. Calling `QDB.getLocation`
  directly, wait for `QDB.ready` or the `qdb-ready` event first.

`npm run dev` answers it from the dev page's own `navigator.geolocation`.

## On a dashboard

The same app can be placed on a dashboard as a widget. `getPlacement()` says
where it runs — `'inapp' | 'widget' | 'fullscreen'`, or null on an older host —
and in a widget `canOpenApp()` / `openApp()` take the viewer to the app's own
page. A widget cell is small (280×178 px at 1×1), sits on the card surface, and
the frame fills it with no padding around: the widget pads itself.

The **`widget-preview` skill** (`.claude/skills/widget-preview/`) adds a
`/?preview` dev page showing the app at every dashboard size side by side, and
has the rules for a widget view. `?qaicuPlacement=widget` makes the dev bridge
report a widget.

## What actually breaks these builds

- **The app renders at least once with NO data** — during the render check, and
  for a moment on every load. Guard every list and number: render an empty state,
  never `items[0].x`, never divide by `items.length`.
- **Offline, reads come back empty but WRITES REJECT.** `add`/`update`/`remove`
  throw when there is no host. Only ever write from a user action — never during
  render or in a mount effect.
- Write complete files. A partial file with "… rest unchanged" ships as the app.

## Running it locally

`npm run dev` serves the app with a stand-in for Qaicu (`dev/qaicu-dev-plugin.js`):
the same `window.QDB` bridge and the same operations, answered from
`.qaicu-dev-data.json`. `npm run dev:reset` empties it. It does not ask for
dataset consent and does not run reports.

Set `QAICU_URL` + `QAICU_API_KEY` in `.env` and the same operations go to a real
Qaicu instead — same code path, real datasets.

## Deploying

```
npm run deploy                  # build, then add a version to the key's app
npm run deploy -- --dry-run     # build and report, send nothing
```

Needs `QAICU_URL` and `QAICU_DEPLOY_KEY` in `.env` (copy `.env.example`). The key
belongs to one app: create it in Qaicu with Settings > Apps > Add app > "Import
with the deploy tool" (or in an existing app's settings: edit > Create deploy key).

The deploy sends the built page only, never the source. This repository is where
this app's code lives and is changed; Qaicu shows no "edit" for an app that
arrived without source, so there is one place to change it, not two.
