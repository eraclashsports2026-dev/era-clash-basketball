import { describe, it, expect } from 'vitest';
import { buildRouteInventory, ownerSurfaceCoverage } from '../scripts/loop/fullBrowserAudit.mjs';

describe('Owner-only development surface audit scope', () => {
  it('labels the actual deployment inventory route private and unverified', async () => {
    const { routes } = await buildRouteInventory();
    const route = routes.find(row => row.path === '/dev/basketball-theme-lab');
    expect(route?.access).toBe('owner-only');
    const coverage = ownerSurfaceCoverage(route);
    expect(coverage.status).toBe('UNVERIFIED');
    expect(coverage.acceptanceStatus).toBe('PARTIAL');
    expect(coverage.probeControls).toBe(false);
    expect(coverage.reason).toContain('fallback lobby');
    expect(coverage.reason).toContain('compile');
  });

  it('does not exempt generic unknown URLs or public gameplay routes', () => {
    for (const path of ['/this-page-does-not-exist-browser-audit', '/dev/not-a-real-owner-route', '/clash/modes', '/play']) {
      expect(ownerSurfaceCoverage({ path })).toBeNull();
    }
  });
});
