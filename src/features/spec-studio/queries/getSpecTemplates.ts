export function getDefaultSpecContracts() {
  const types = `export type WorkspaceRole = 'owner' | 'auditor' | 'contributor';

export interface TenancyScope {
  tenantId: string;
  role: WorkspaceRole;
  permissions: string[];
  issuedAt: number;
}

export interface RoleAssignmentRequest {
  targetUserId: string;
  role: WorkspaceRole;
  reason?: string;
}`;

  const tests = `import { test, expect } from '@playwright/test';

test.describe('RBAC Multi-tenant Guard', () => {
  test('auditor role should have read-only access to billing ledger', async ({ page }) => {
    await page.goto('/settings/billing');
    await expect(page.locator('#change-plan-button')).toBeDisabled();
    await expect(page.locator('.invoice-history-table')).toBeVisible();
  });
});`;

  return { types, tests };
}
