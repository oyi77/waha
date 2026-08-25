import * as fs from 'fs';
import * as path from 'path';

import { PUBLIC_API_KEY_EXCLUDE_PATHS } from './public-api-paths';

/**
 * Regression guard for the ApiKeyAuthMiddleware exclusion list.
 *
 * Collects every @Controller prefix and @Get/@Post/@Put/@Patch/@Delete method
 * path from the source tree, then asserts:
 *  1. The cookie-flow bootstrap endpoints stay public (login/logout/config).
 *  2. Every concrete entry in PUBLIC_API_KEY_EXCLUDE_PATHS resolves to a real
 *     route — catches stale/typo'd entries (the phantom-endpoint class of bug).
 *  3. Wildcard `*path` entries have a real base route.
 *  4. Deliberately key-protected dashboard routes (health) stay OUT of the list.
 */
function collectRoutes(): string[] {
  const srcRoot = path.join(__dirname, '..', '..');
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.output')) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith('.controller.ts')) {
        files.push(full);
      }
    }
  };
  walk(srcRoot);

  const routes = new Set<string>();
  const methodRe = /@(?:Get|Post|Put|Patch|Delete)\(([^)]*)\)/g;
  for (const file of files) {
    const text = fs.readFileSync(file, 'utf-8');
    const prefixes = [...text.matchAll(/@Controller\(\s*'([^']+)'\s*\)/g)].map(
      (m) => m[1],
    );
    if (!prefixes.length) {
      continue;
    }
    const methods = [...text.matchAll(methodRe)].map((m) => {
      const arg = m[1].trim();
      const quoted = arg.match(/^'([^']*)'/);
      return quoted ? quoted[1] : '';
    });
    for (const prefix of prefixes) {
      for (const method of methods) {
        routes.add('/' + [prefix, method].filter(Boolean).join('/'));
      }
    }
  }
  return [...routes].sort();
}

describe('PUBLIC_API_KEY_EXCLUDE_PATHS', () => {
  it('keeps the dashboard cookie-flow bootstrap endpoints public', () => {
    for (const bootstrap of [
      '/api/dashboard/login',
      '/api/dashboard/logout',
      '/api/dashboard/config',
    ]) {
      expect(PUBLIC_API_KEY_EXCLUDE_PATHS).toContain(bootstrap);
    }
  });

  it('resolves every concrete entry to a real route', () => {
    const routes = collectRoutes();
    for (const entry of PUBLIC_API_KEY_EXCLUDE_PATHS) {
      if (entry.endsWith('/*path')) {
        continue;
      }
      expect(routes).toContain(entry);
    }
  });

  it('has a real base route for every wildcard entry', () => {
    const prefixes = collectRoutes();
    for (const entry of PUBLIC_API_KEY_EXCLUDE_PATHS) {
      if (!entry.endsWith('/*path')) {
        continue;
      }
      const base = entry.slice(0, -'/*path'.length);
      expect(prefixes.some((route) => route === base || route.startsWith(base + '/'))).toBe(true);
    }
  });

  it('does not expose key-protected dashboard health routes publicly', () => {
    for (const entry of PUBLIC_API_KEY_EXCLUDE_PATHS) {
      expect(entry.startsWith('/api/dashboard/health')).toBe(false);
    }
  });
});
