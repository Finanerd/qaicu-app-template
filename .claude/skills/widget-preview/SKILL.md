---
name: widget-preview
description: Show a Qaicu app as a dashboard widget at every grid size (1×1, 2×1, 1×2, 2×2, 3×2, 3×3) side by side on a /?preview dev page, and make the app fit each size. Use when building or checking a widget view, or when asked how the app looks on a dashboard ("how does it look as a widget", "show all sizes", "widget preview").
---

# Widget preview

A Qaicu app can sit on a dashboard as a widget. There it runs in a grid cell:

| size | px (frame) |
|---|---|
| 1×1 | 280×178 |
| 2×1 | 580×178 |
| 1×2 | 280×378 |
| 2×2 | 580×378 |
| 3×2 | 880×378 |
| 3×3 | 760×578 |

The frame fills the card with **no padding around it**, on the card surface
(the host sets `--background` to the `--card` colour). The same bundle runs on
the app's own page, so one app has two views: a widget and a full view.

This skill adds a dev page, `/?preview`, that renders the app in an iframe at
every size above, and gives the rules that make a widget view fit them.

## 1. The bridge knows where it runs

`src/qaicu.ts` must have `getPlacement()`, `canOpenApp()` and `openApp()`, and
`dev/qaicu-dev-plugin.js` must read `?qaicuPlacement=` into `QDB.placement`.
The template has both. An app cloned from an older template does not: copy
those parts of `src/qaicu.ts` (the `Placement` type, the `placement`/`openApp`
fields on the bridge, the three functions), their re-exports in `useQaicu.ts`
and `ui.tsx`, and the `PLACEMENT` / `q.openApp` lines of the dev plugin's
`bridgeScript` from the template.

## 2. Copy the files

From this folder (`.claude/skills/widget-preview/`) into `src/`, unless they
are already there:

- `WidgetPreview.tsx` — the `/?preview` page, and `useDevFrameSurface()`, which
  inside a preview frame hides the dev bar, sets the card surface and follows
  the dev bar's theme toggle.
- `use-frame.ts` — `useFrame()` → `{ width, height, view }`, where `view` is
  `'widget' | 'full' | null` (null until the frame has a size).

They use only inline styles and theme variables, so they work with or without
Tailwind. If the app imports with an `@/` alias, adjust the `./qaicu` import.

## 3. Wire the app

```tsx
import { WidgetPreview, useDevFrameSurface } from './WidgetPreview';
import { useFrame } from './use-frame';

export default function App() {
  useDevFrameSurface();
  if (import.meta.env.DEV && new URLSearchParams(window.location.search).has('preview')) {
    return <WidgetPreview />;
  }
  return <Main />;
}

/** The widget in a dashboard cell, the full view on a page of its own. */
function Main() {
  const { width, height, view } = useFrame();
  if (!view) return null;
  return view === 'widget' ? <Widget width={width} height={height} /> : <FullView />;
}
```

Keep data hooks in a component or custom hook both views share, so switching
view does not refetch.

## 4. Build the widget view to fit

- **Fill the frame with viewport units**: the outermost element is
  `height: 100vh; overflow: hidden; box-sizing: border-box`. A percentage
  height chain resolves to 0 (the frame is first laid out at zero size).
  `window.innerWidth` is 0 on the first render — `useFrame` handles that.
- **Pad yourself**, the same at the top as at the sides (≈ 14–16 px). No
  `<Container>` (it adds 1.5rem and a max width), and **no app-name heading**:
  the dashboard card has the title.
- **Transparent background** — the page `--background` is already the card.
- **Decide by size, not by guessing**: pass `width`/`height` in and branch on a
  few thresholds, e.g. `tall = height >= 290`, `wide = width >= 460`,
  `roomy = height >= 520`. Describe what each size shows in a comment at the
  top of the widget component.
- **Fit, do not clip**: compute how many items fit (`Math.floor(space / itemSize)`)
  and render that many, rather than letting a row or list get cut mid-item.
  The widget as a whole never scrolls; an inner list may, with a fade.
- **Smallest first**: 1×1 shows the one thing that matters. Each larger size
  adds, it does not rearrange everything.
- **Open the app** from the widget with a small icon button in the header,
  only where `canOpenApp()` (check it once: `useState(canOpenApp)`), calling
  `openApp().catch(() => {})`.
- Overlays (`Popover`, `Dialog`, `Select`) render inside the iframe: keep them
  small and give their content a `max-height: calc(100vh - 48px); overflow: auto`.
- Colours only as `var(--…)`, as everywhere in a Qaicu app.

## 5. Test the sizes

```tsx
function frame(width: number, height: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
}
function host(placement: string, openApp?: () => Promise<boolean>) {
  (window as unknown as { QDB: unknown }).QDB = {
    ready: false, placement, session: { user: null, company: null, language: 'en-US', placement },
    settings: {}, userSettings: {}, call: () => Promise.resolve(undefined), openApp,
  };
}
```

Cover at least: nothing renders at 0×0; `host('widget')` gives the widget
however large; `host('inapp')` gives the full view however small; the open
button calls `openApp` only where the host offers it; and what each size shows
(render the widget with fixed data at each of the sizes above). Reset
`innerWidth`/`innerHeight` and delete `window.QDB` in `afterEach`, or later
tests (the template's `App renders`) see a widget.

## 6. Look at it

1. Start the dev server in the background on a free port:
   `npx vite --port 5190 --strictPort` (5173 is often taken by another app).
2. Open `http://localhost:<port>/?preview` in Chrome (claude-in-chrome), take a
   screenshot, and `zoom` into each size to read it. `?preview&qaicuPlacement=`
   is not needed — each frame sets it.
3. Flip **Dark/Light theme** in the dev bar: every frame follows. Check both.
4. Fix what does not fit, and look again. Changes hot-reload into all frames;
   a change to `dev/qaicu-dev-plugin.js` needs a server restart.
5. Leave the tab open for the user when they asked to see it, and tell them the
   URL.
