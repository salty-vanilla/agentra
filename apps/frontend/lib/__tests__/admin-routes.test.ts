import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

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
