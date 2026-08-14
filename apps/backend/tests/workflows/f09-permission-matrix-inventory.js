import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = join(here, '../../../..');
const require = createRequire(import.meta.url);
const apiContracts = require('@agrivio/api-contracts');

export const ROLE_KEYS = ['SuperAdmin', 'Owner', 'Manager', 'Cashier', 'StoreKeeper'];

export const KNOWN_UNIMPLEMENTED_FROZEN_ENDPOINTS = Object.freeze([]);

export const PUBLIC_OR_AUTH_ONLY_JUSTIFICATION = Object.freeze({
  'POST /api/v1/auth/login': 'public authentication',
  'POST /api/v1/auth/logout': 'authenticated session end; no action permission',
  'GET /api/v1/auth/session': 'authenticated session read; no action permission',
  'POST /api/v1/auth/session/context': 'authenticated context switch; no action permission',
  'POST /api/v1/auth/password-reset/request': 'public password reset',
  'POST /api/v1/auth/password-reset/confirm': 'public password reset',
  'POST /api/v1/auth/activate': 'public activation',
  'POST /api/v1/auth/csrf': 'public CSRF bootstrap',
  'POST /api/v1/organization-activation-requests': 'public onboarding',
  'GET /api/v1/health': 'public liveness',
});

export function parseFrozenPermissionCatalog(markdown) {
  const catalogStart = markdown.indexOf('## 8. Permission Catalog');
  const catalogEnd = markdown.indexOf('**Permission count:**');
  const section = markdown.slice(catalogStart, catalogEnd);
  const codes = [];
  const seen = new Set();
  const duplicates = [];
  const fence = /```text\r?\n([\s\S]*?)```/g;
  let match = fence.exec(section);
  while (match !== null) {
    for (const line of match[1].split('\n')) {
      const code = line.trim();
      if (code.length === 0) {
        continue;
      }
      if (seen.has(code)) {
        duplicates.push(code);
      }
      seen.add(code);
      codes.push(code);
    }
    match = fence.exec(section);
  }
  return { codes, duplicates };
}

export function parseFrozenRoleMatrix(markdown) {
  const start = markdown.indexOf('### 9.6 Permission matrix');
  const end = markdown.indexOf('Role-matrix coverage:');
  const section = markdown.slice(start, end);
  const matrix = {};
  for (const line of section.split('\n')) {
    if (!line.startsWith('| `')) {
      continue;
    }
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    const permission = cells[0].replaceAll('`', '');
    matrix[permission] = {
      SuperAdmin: cells[1],
      Owner: cells[2],
      Manager: cells[3],
      Cashier: cells[4],
      StoreKeeper: cells[5],
    };
  }
  return matrix;
}

export function parseFrozenApiEndpoints(markdown) {
  const start = markdown.indexOf('## 12. Endpoint Inventory');
  const end = markdown.indexOf('## 13. API Permission Mapping Rules');
  const section = markdown.slice(start, end);
  const endpoints = [];
  for (const line of section.split('\n')) {
    if (!/^\| (GET|POST|PATCH|PUT|DELETE) \|/.test(line)) {
      continue;
    }
    const cells = line
      .split('|')
      .map((cell) => cell.trim())
      .filter((cell) => cell.length > 0);
    const method = cells[0];
    const pathMatch = cells[1].match(/`([^`]+)`/);
    if (pathMatch === null) {
      continue;
    }
    const permissionCell = cells[3];
    const path = normalizePath(pathMatch[1]);
    const permissions =
      permissionCell === '—'
        ? []
        : [...permissionCell.matchAll(/`([^`]+)`/g)].map((match) => match[1]);
    endpoints.push({
      method,
      path,
      key: `${method} ${path}`,
      permissions,
      publicOrAuthOnly: permissionCell === '—',
    });
  }
  return endpoints;
}

export function collectRouteFiles(rootDir) {
  const files = [];
  function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const stat = statSync(full);
      if (stat.isDirectory()) {
        walk(full);
        continue;
      }
      const normalized = full.replaceAll('\\', '/');
      if (normalized.includes('.spec.')) {
        continue;
      }
      if (normalized.endsWith('.routes.js')) {
        files.push(full);
      }
    }
  }
  walk(rootDir);
  return files;
}

export function scanImplementedRoutes(backendSrc) {
  const constants = {};
  for (const [key, value] of Object.entries(apiContracts)) {
    if (key.startsWith('API_') && typeof value === 'string') {
      constants[key] = value;
    }
  }

  const routes = [];
  for (const filePath of collectRouteFiles(backendSrc)) {
    const source = readFileSync(filePath, 'utf8');
    const aliases = {};
    const aliasPattern =
      /(?:const|let)\s+(\w+)\s*=\s*createRequirePermissionMiddleware\(\s*'([^']+)'\s*,?\s*\)/g;
    let aliasMatch = aliasPattern.exec(source);
    while (aliasMatch !== null) {
      aliases[aliasMatch[1]] = aliasMatch[2];
      aliasMatch = aliasPattern.exec(source);
    }

    const callPattern = /router\.(get|post|patch|put|delete)\(\s*([\s\S]*?)\s*\);/g;
    let call = callPattern.exec(source);
    while (call !== null) {
      const method = call[1].toUpperCase();
      const args = call[2];
      const firstArg = args.split(',')[0].trim();
      const path = resolvePathExpression(firstArg, constants);
      const permissions = [];
      const inline = /createRequirePermissionMiddleware\(\s*'([^']+)'\s*,?\s*\)/g;
      let perm = inline.exec(args);
      while (perm !== null) {
        permissions.push(perm[1]);
        perm = inline.exec(args);
      }
      const platform = /requirePlatformPermission\('([^']+)'\)/g;
      let plat = platform.exec(args);
      while (plat !== null) {
        permissions.push(plat[1]);
        plat = platform.exec(args);
      }
      for (const [alias, code] of Object.entries(aliases)) {
        if (new RegExp(`\\b${alias}\\b`).test(args) && !permissions.includes(code)) {
          permissions.push(code);
        }
      }
      const normalized = filePath.replaceAll('\\', '/');
      const testOnly = normalized.includes('/testing/');
      routes.push({
        method,
        path: path === null ? firstArg : normalizePath(path),
        key: path === null ? `${method} ${firstArg}` : `${method} ${normalizePath(path)}`,
        permissions,
        file: normalized,
        testOnly,
        hasAuth: /\brequireAuth\b/.test(args) || /\boptionalAuth\b/.test(args),
      });
      call = callPattern.exec(source);
    }
  }
  return routes;
}

export function normalizePath(path) {
  return path.replace(/:([A-Za-z]+)/g, ':id');
}

function resolvePathExpression(expr, constants) {
  if ((expr.startsWith('`') && expr.endsWith('`')) || expr.includes('${')) {
    const inner = expr.replace(/^`/, '').replace(/`$/, '');
    const resolved = inner.replace(/\$\{(\w+)\}/g, (_, name) => constants[name] ?? '');
    if (resolved.includes('${')) {
      return null;
    }
    return resolved;
  }
  if (constants[expr]) {
    return constants[expr];
  }
  if (
    (expr.startsWith("'") && expr.endsWith("'")) ||
    (expr.startsWith('"') && expr.endsWith('"'))
  ) {
    return expr.slice(1, -1);
  }
  return null;
}

export function repoPaths() {
  return {
    repoRoot,
    securityDoc: join(repoRoot, 'docs/SECURITY_AUTHORIZATION.md'),
    apiDesignDoc: join(repoRoot, 'docs/API_DESIGN.md'),
    backendSrc: join(here, '../../src'),
  };
}
