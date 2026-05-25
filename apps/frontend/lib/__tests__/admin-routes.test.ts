import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { isAdminConsoleActive, isNavItemActive } from '@/lib/admin-routes';

const appDir = resolve(__dirname, '../../app');
const componentsDir = resolve(__dirname, '../../components');

describe('admin route files', () => {
  it('app/admin/layout.tsx exists (admin shell)', () => {
    expect(existsSync(resolve(appDir, 'admin/layout.tsx'))).toBe(true);
  });

  it('app/admin/page.tsx exists (Admin Home at /admin)', () => {
    expect(existsSync(resolve(appDir, 'admin/page.tsx'))).toBe(true);
  });

  it('app/admin/observability/page.tsx exists (Observability Dashboard at /admin/observability)', () => {
    expect(existsSync(resolve(appDir, 'admin/observability/page.tsx'))).toBe(true);
  });

  it('components/admin/admin-sidebar.tsx exists', () => {
    expect(existsSync(resolve(componentsDir, 'admin/admin-sidebar.tsx'))).toBe(true);
  });
});

describe('isAdminConsoleActive', () => {
  it('returns true for /admin', () => {
    expect(isAdminConsoleActive('/admin')).toBe(true);
  });

  it('returns true for /admin/console', () => {
    expect(isAdminConsoleActive('/admin/console')).toBe(true);
  });

  it('returns true for /admin/console subroutes', () => {
    expect(isAdminConsoleActive('/admin/console/settings')).toBe(true);
    expect(isAdminConsoleActive('/admin/console/deep/path')).toBe(true);
  });

  it('returns false for /admin/observability', () => {
    expect(isAdminConsoleActive('/admin/observability')).toBe(false);
  });

  it('returns false for /', () => {
    expect(isAdminConsoleActive('/')).toBe(false);
  });

  it('returns false for /unknown', () => {
    expect(isAdminConsoleActive('/unknown')).toBe(false);
  });
});

describe('isNavItemActive', () => {
  it('returns true for exact match', () => {
    expect(isNavItemActive('/admin/observability', '/admin/observability')).toBe(true);
  });

  it('returns true for strict subroute', () => {
    expect(isNavItemActive('/admin/observability/detail', '/admin/observability')).toBe(
      true,
    );
  });

  it('returns false when pathname does not start with href', () => {
    expect(isNavItemActive('/admin', '/admin/observability')).toBe(false);
  });

  it('returns false for adjacent route that shares prefix characters', () => {
    expect(isNavItemActive('/admin/observability-old', '/admin/observability')).toBe(
      false,
    );
  });

  it('returns false for unrelated path', () => {
    expect(isNavItemActive('/unknown', '/admin/observability')).toBe(false);
  });
});
