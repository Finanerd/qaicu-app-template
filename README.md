# Qaicu app template

A starting point for building Qaicu apps. A Qaicu app is a small React app that
lives on a page inside Qaicu and works with the company's own data.

The template uses Vite, React and TypeScript and builds into a single
`dist/index.html`. It comes with a local mock of Qaicu, so you can develop
without a Qaicu instance, and a script for deploying the finished app.

## Start with a coding agent

Open an empty folder in Claude Code or another coding agent and paste this,
with your own description at the end:

> Set up a new Qaicu app in this folder from the template at
> https://github.com/Finanerd/qaicu-app-template. Copy its files here without
> its git history, run `git init` and `npm install`, then read `AGENTS.md` and
> follow it. The app should: *describe what you want here.*

`AGENTS.md` tells the agent how to build the app: which components and data
hooks to use, what breaks the build and how to deploy. When it is time to deploy,
the agent will ask you for a deploy key (see [Deploying](#deploying)).

## Start by hand

Click "Use this template" on GitHub, or copy the files without the history:

```
npx degit Finanerd/qaicu-app-template my-app
cd my-app && git init
npm install
npm run dev
```

Then edit `src/App.tsx`. All the components and hooks can be imported from
`src/ui.tsx`.

On a fresh copy one test fails on purpose: `App is implemented (placeholder
removed)`. It keeps you from deploying the empty placeholder, and it starts
passing once you replace `src/App.tsx`.

## How data moves

The app never gets a Qaicu API token. When it needs data, it asks the Qaicu page
it runs in, and the page makes the API call:

```
  App                 ./ui hooks                 Qaicu page                 Qaicu API
  ────────────────────────────────────────────────────────────────────────────────────
  useCollection() ──▶ QDB.call("rows.list") ──▶ checks the app may read it,
                      (postMessage)              adds the signed-in user's
                                                 auth + company ─────────────▶ /api/external/*
  items        ◀───── resolve            ◀────── rows
```

Your components don't deal with tokens or URLs. Use
`useCollection(name, dimensions)` for simple CRUD on one dataset, or
`useDataset` with `upsertRows` and `deleteRows` for anything bigger. The calls
run with the permissions of the person using the app, limited to the datasets
they have allowed the app to use.

Data in Qaicu lives in datasets (tables) made of rows. Each row has a stable
`externalId` and a map of `{ dimensionName: value }`. All values are strings:
dates are `YYYY-MM-DD` and numbers look like `"12.5"`. `useCollection` turns rows
into plain `{ id, Field, … }` objects and converts them back when you save.

Each app also has two JSON settings objects. `QDB.settings` is shared by
everyone who uses the app, and `QDB.userSettings` belongs to the current user.
Qaicu passes both to the app when it starts. Save them with `putSettings(obj)`
and `putUserSettings(obj)`, or use the `useSettings()` hook in React.

## Local development

`npm run dev` starts the app with `dev/qaicu-dev-plugin.js` acting as Qaicu. It
provides the same `window.QDB` bridge and operations as the real thing, including
the short delay before the bridge is ready. It has two modes:

- **Mock** (default): data is stored in `.qaicu-dev-data.json`. You don't need a
  Qaicu instance, the data survives restarts, and `npm run dev:reset` clears it.
- **Live**: set `QAICU_URL` and `QAICU_API_KEY` in `.env`, and the same calls go
  to a real Qaicu using that key.

The plugin only runs in the dev server and is not part of the build.

## Deploying

```
cp .env.example .env      # fill in QAICU_URL and QAICU_DEPLOY_KEY
npm run check             # typecheck + tests
npm run deploy
```

Each deploy key belongs to one app and can only add new versions to it. To get
one for a new app, go to Settings → Apps → Add app → Import with the deploy tool
in Qaicu. Give the app a name and a place in the navigation, and Qaicu shows you
the key. For an existing app, open its settings and choose Edit → Create deploy
key. Creating a new key replaces the old one.

- `npm run deploy` builds the app and adds a new version.
- `npm run deploy -- --no-build` deploys what is already in `dist/`.
- `npm run deploy -- --dry-run` builds and reports without sending anything.

Only the built page is sent to Qaicu, not the source code. Qaicu can't edit an
app that was deployed this way, so this repository stays the one place where
the app's code is changed.

## What's in here

| File | What it is |
|---|---|
| `src/App.tsx` | Your app. Replace it. |
| `src/ui.tsx` | Components and data hooks, all exported from one place |
| `src/components.tsx` | Select, Combobox, Menu, Dialog, ConfirmDialog and Popover, built on Radix |
| `src/useQaicu.ts` | `useCollection` and `useDataset` |
| `src/qaicu.ts` | The bridge, the only code that talks to Qaicu |
| `src/format.ts` | Helpers like `num`, `money`, `sum`, `groupBy` and `today` |
| `src/index.css` | Theme variables and base styles. Qaicu injects its theme here |
| `dev/qaicu-dev-plugin.js` | The local Qaicu mock, used only in development |
| `scripts/deploy.mjs` | The deploy script |
| `AGENTS.md` | Instructions for coding agents |
| `.claude/skills/widget-preview/` | A skill that shows the app at every dashboard widget size on `/?preview` |

`src/ui.tsx`, `src/qaicu.ts`, `src/useQaicu.ts` and `src/index.css` are the same
files Qaicu's built-in app builder uses. You can change them, but if you leave
them as they are, your app stays compatible with the component kit.

## License

[MIT](LICENSE)
