#!/usr/bin/env node
// Empties the dev mock's data file (.qaicu-dev-data.json). Only affects mock
// mode — it never touches a real Qaicu.

import { existsSync, rmSync } from 'node:fs';
import { relative, resolve } from 'node:path';

const file = resolve(process.cwd(), '.qaicu-dev-data.json');

if (!existsSync(file)) {
  console.log(`  ${relative(process.cwd(), file)} does not exist — nothing to reset.`);
} else {
  rmSync(file);
  console.log(`  Cleared ${relative(process.cwd(), file)}. Restart or reload the dev server.`);
}
