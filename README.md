# Qaicu app template

The starting point for a **Qaicu app**: a small React app that runs inside the
Qaicu product, on a page of it, working with that company's own data.

Vite + React + TypeScript, building to one self-contained `dist/index.html`, with
a local stand-in for Qaicu so you can develop without it and a script that pushes
the result into a real one.

## Start with a coding agent

Open an empty folder in Claude Code (or any coding agent) and say:

> Set up a new Qaicu app in this folder from the template at
> https://github.com/Finanerd/qaicu-app-template — copy its files here without
> its git history, run `git init` and `npm install`, then read `AGENTS.md` and
> follow it. The app should: *describe what you want here.*

The agent takes it from there: `AGENTS.md` is the authoring guide it works from
(the component kit, the data hooks, the rules that break a build, how to
deploy). To deploy, it will ask you for a deploy key — see [Deploying](#deploying).

## Start by hand

Click **Use this template** on GitHub, or copy the files without the history:

```
npx degit Finanerd/qaicu-app-template my-app
cd my-app && git init
npm install
npm run dev
```

Then edit `src/App.tsx`. Everything you need is re-exported from `src/ui.tsx`.

One test fails on a fresh copy, on purpose: `App is implemented (placeholder
removed)`. It is the template saying the app has not been written yet, and it is
what stops an empty placeholder from being deployed. It passes as soon as you
replace `src/App.tsx`.

## How data moves

The app has **no Qaicu API token** — that is the point. For Qaicu data it names
an operation, and its host runs it:

```
  App                 ./ui hooks                 Qaicu page                 Qaicu API
  ────────────────────────────────────────────────────────────────────────────────────
  useCollection() ──▶ QDB.call("rows.list") ──▶ checks the app may read it,
                      (postMessage)              adds the signed-in user's
                                                 auth + company ─────────────▶ /api/external/*
  items        ◀───── resolve            ◀────── rows
```

So a component needs no token or Qaicu URL. It uses `useCollection(name, dimensions)` for
CRUD over one dataset, or `useDataset` + `upsertRows`/`deleteRows` for anything
larger, and the host does the call **with the permissions of whoever has the app
open**, narrowed to the datasets they have allowed this app.

Qaicu stores data as **datasets** (tables) of **rows**. A row is a stable
`externalId` plus a map of `{ dimensionName: value }`, and **every value is a
string** — dates as `YYYY-MM-DD`, numbers as `"12.5"`. `useCollection` flattens
that into `{ id, Field, … }` items and converts on the way back in.

Besides datasets the app has two JSON objects of its own: `QDB.settings`, shared
by everyone who uses it, and `QDB.userSettings`, the viewer's own. Qaicu hands
both to the app at start, and `putSettings(obj)` / `putUserSettings(obj)`
replace them (`useSettings()` wraps them as React state).

## Local development

`npm run dev` runs the app with `dev/qaicu-dev-plugin.js` standing in for Qaicu:
the same `window.QDB` bridge, the same operations, the same "not ready yet"
moment at startup. Two backends sit behind it:

| | |
|---|---|
| **mock** (default) | answered from `.qaicu-dev-data.json`. No Qaicu needed, data survives restarts, `npm run dev:reset` empties it. |
| **live** | Set `QAICU_URL` + `QAICU_API_KEY` in `.env` and the same operations go to a real Qaicu with that key. Same code path, real datasets. |

None of it is in the build: the plugin is `apply: 'serve'` only.

## Deploying

```
cp .env.example .env      # fill in QAICU_URL and QAICU_DEPLOY_KEY
npm run check             # typecheck + tests
npm run deploy
```

The deploy key belongs to one app and can only add versions to it. Get one in
Qaicu with **Settings → Apps → Add app → Import with the deploy tool**: give the
app a name and a place in the navigation, and Qaicu shows the key. An existing
app gets a key in its settings (**edit → Create deploy key**). A new key replaces
the previous one.

| | |
|---|---|
| `npm run deploy` | build, then add a version to the key's app |
| `npm run deploy -- --no-build` | deploy whatever is already in `dist/` |
| `npm run deploy -- --dry-run` | build and report, send nothing |

The deploy sends the built page and **not** the source. This repository is where
the app's code lives and is changed; Qaicu offers no "edit" for an app that
arrived without source, so there is one place to change it rather than two that
drift apart.

## What is in here

| | |
|---|---|
| `src/App.tsx` | your app — replace it |
| `src/ui.tsx` | the component kit and the data hooks, all re-exported |
| `src/components.tsx` | pickers and overlays on Radix primitives: Select, Combobox, Menu, Dialog, ConfirmDialog, Popover |
| `src/useQaicu.ts` | `useCollection` / `useDataset` |
| `src/qaicu.ts` | the bridge itself: the only place that talks to the host |
| `src/format.ts` | `num`, `money`, `sum`, `groupBy`, `today`, … |
| `src/index.css` | the theme variables and base styles Qaicu injects into |
| `dev/qaicu-dev-plugin.js` | the local stand-in for Qaicu (dev only) |
| `scripts/deploy.mjs` | build and push into Qaicu |
| `AGENTS.md` | the authoring guide, written for a coding agent |
| `.claude/skills/widget-preview/` | a skill: the app at every dashboard widget size on `/?preview` |

`src/ui.tsx`, `src/qaicu.ts`, `src/useQaicu.ts` and `src/index.css` are the same
files Qaicu's own in-product app builder works with. Changing them is allowed but
rarely what you want: an app that keeps them stays compatible with the kit.

## License

[MIT](LICENSE)
