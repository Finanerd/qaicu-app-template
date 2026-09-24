#!/usr/bin/env node
// Builds the app and pushes it into Qaicu as a new version of one app.
//
//   npm run deploy                 build, then deploy
//   npm run deploy -- --no-build   deploy whatever is already in dist/
//   npm run deploy -- --dry-run    build and report, send nothing
//
// Credentials come from .env (see .env.example):
//   QAICU_URL          https://app.qaicu.ai  (or your preview environment's URL)
//   QAICU_DEPLOY_KEY   the app's deploy key (Qaicu: Settings > Apps > the app > edit > Create deploy key)
//
// The key belongs to one app and can only add versions to it. Get one with
// Settings > Apps > Add app > Import with the deploy tool.
//
// The app's SOURCE is deliberately not sent: this project is where its code
// lives and is edited.

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const ROOT = process.cwd();
const BUILD_FILE = resolve(ROOT, 'dist/index.html');

// The server refuses more than 8 MB of html.
const MAX_HTML_BYTES = 8 * 1024 * 1024;

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const env = { ...readDotEnv(resolve(ROOT, '.env')), ...process.env };

  const baseUrl = trimSlash(env.QAICU_URL);
  const deployKey = env.QAICU_DEPLOY_KEY;
  if (!baseUrl || !deployKey) {
    fail(
      'QAICU_URL and QAICU_DEPLOY_KEY are required (copy .env.example to .env).\n' +
        `  Create the key in Qaicu${baseUrl ? ` (${baseUrl})` : ''}: Settings > Apps > (the app) > edit > Create deploy key.\n` +
        '  No app yet? Settings > Apps > Add app > "Import with the deploy tool" creates one and its key.',
    );
  }

  if (!flags.noBuild) build();

  if (!existsSync(BUILD_FILE)) {
    fail(`No build at ${relative(ROOT, BUILD_FILE)} — run without --no-build, or run \`npm run build\` first.`);
  }

  const html = readFileSync(BUILD_FILE, 'utf8');
  const bytes = Buffer.byteLength(html, 'utf8');
  if (bytes > MAX_HTML_BYTES) {
    fail(
      `The build is ${mb(bytes)} MB, over the ${mb(MAX_HTML_BYTES)} MB limit.\n` +
        'Everything is inlined into one file, so a large image, font or source map in the bundle is the usual cause.',
    );
  }
  assertSelfContained(html);

  console.log(`  target    ${baseUrl}`);
  console.log(`  build     ${relative(ROOT, BUILD_FILE)} (${kb(bytes)} kB)`);

  if (flags.dryRun) {
    console.log('\n  --dry-run: nothing sent.');
    return;
  }

  const result = await post(`${baseUrl}/api/app-deploy`, deployKey, { html });

  console.log(`\n  Deployed version ${result.id}`);
  console.log(`  Open: ${baseUrl}/${result.companyId}/apps/${result.appId}`);
}

function build() {
  // Vite is invoked directly so the script behaves the same with npm, pnpm or bun.
  const vite = resolve(ROOT, 'node_modules/vite/bin/vite.js');
  if (!existsSync(vite)) fail('vite is not installed — run `npm install` first.');

  const result = spawnSync(process.execPath, [vite, 'build'], { stdio: 'inherit' });
  if (result.status !== 0) fail('The build failed; nothing was deployed.');
}

/** The app is served as one self-contained page from a blob: URL, so what it is built from must be bundled into it. */
function assertSelfContained(html) {
  const offenders = [
    [/<script[^>]+src=["']https?:/i, 'a <script src="http..."> (external script)'],
    [/<link[^>]+href=["']https?:/i, 'a <link href="http..."> (external stylesheet or font)'],
    [/@import\s+url\(["']?https?:/i, 'an @import of a remote stylesheet'],
  ];
  const found = offenders.filter(([pattern]) => pattern.test(html)).map(([, description]) => description);
  if (found.length > 0) {
    fail(
      `The build references external resources: ${found.join(', ')}.\n` +
        'Qaicu serves the app as one self-contained page from a blob: URL — bundle or inline them instead.',
    );
  }
}

async function post(url, deployKey, body) {
  let response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Deploy-Key': deployKey },
      body: JSON.stringify(body),
    });
  } catch (error) {
    fail(`Could not reach ${url}: ${error instanceof Error ? error.message : String(error)}`);
  }

  const text = await response.text();
  if (!response.ok) {
    if (response.status === 401) {
      fail('Qaicu rejected the deploy key. Create a new one in the app\'s settings and update QAICU_DEPLOY_KEY.');
    }
    fail(`Qaicu returned ${response.status}: ${text || response.statusText}`);
  }

  try {
    return JSON.parse(text);
  } catch {
    fail(`Qaicu returned a response that is not JSON:\n${text.slice(0, 400)}`);
  }
}

/** Minimal .env reader: KEY=value lines, optional quotes, # comments. */
function readDotEnv(file) {
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!match || line.trimStart().startsWith('#')) continue;
    out[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
  return out;
}

function parseFlags(argv) {
  const flags = { noBuild: false, dryRun: false };
  for (const arg of argv) {
    if (arg === '--no-build') flags.noBuild = true;
    else if (arg === '--dry-run') flags.dryRun = true;
    else fail(`Unknown option ${arg}`);
  }
  return flags;
}

// Declared as functions, not const arrows: main() runs as soon as the module is
// evaluated, so anything it reaches has to be hoisted.
function trimSlash(value) {
  return value ? String(value).replace(/\/+$/, '') : '';
}

function kb(bytes) {
  return Math.round(bytes / 1024);
}

function mb(bytes) {
  return Math.round((bytes / (1024 * 1024)) * 10) / 10;
}

function fail(message) {
  console.error(`\n  ${message}\n`);
  process.exit(1);
}
