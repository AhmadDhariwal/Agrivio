/**
 * Explicit Frozen allow/deny matrix for F08 P4 (R1-F08-009).
 *
 * Sources:
 * - API_DESIGN 12.17–12.19 subscription labels
 * - SUBSCRIPTION_AND_BILLING §4.3 suspended may/may-not
 * - Plan entitlements: reportsExports (boolean), imports (boolean), auditHistory (string depth)
 *
 * There is no separate commercial `reports` boolean in the plan model. Report *view*
 * is gated by permission + the Frozen subscription label `suspended-read`.
 * Report *export* additionally requires `reportsExports`.
 * Imports have no `suspended-read` label — they remain `operational` only.
 */

const FROZEN_SUSPENDED_POLICY_MATRIX = Object.freeze([
  Object.freeze({
    id: 'report-view',
    capability: 'View fixed reports',
    methods: Object.freeze(['GET']),
    paths: Object.freeze(['/api/v1/reports', '/api/v1/reports/:reportKey']),
    permission: 'reports.view',
    subscriptionLabel: 'suspended-read',
    entitlementKey: null,
    whileSuspended: 'allow',
    whileOperational: 'allow',
  }),
  Object.freeze({
    id: 'report-export',
    capability: 'Export fixed reports',
    methods: Object.freeze(['POST']),
    paths: Object.freeze(['/api/v1/reports/:reportKey/export']),
    permission: 'reports.export',
    subscriptionLabel: 'suspended-read',
    entitlementKey: 'reportsExports',
    whileSuspended: 'allow-if-entitled',
    whileOperational: 'allow-if-entitled',
  }),
  Object.freeze({
    id: 'dashboard',
    capability: 'Operational dashboard',
    methods: Object.freeze(['GET']),
    paths: Object.freeze(['/api/v1/dashboard']),
    permission: 'dashboard.view',
    subscriptionLabel: 'operational',
    entitlementKey: null,
    whileSuspended: 'deny',
    whileOperational: 'allow',
  }),
  Object.freeze({
    id: 'import-preview',
    capability: 'Import preview (create/upload/validate/get/errors/templates)',
    methods: Object.freeze(['GET', 'POST']),
    paths: Object.freeze([
      '/api/v1/imports',
      '/api/v1/imports/templates',
      '/api/v1/imports/:id',
      '/api/v1/imports/:id/upload',
      '/api/v1/imports/:id/validate',
      '/api/v1/imports/:id/errors',
    ]),
    permission: 'imports.preview',
    subscriptionLabel: 'operational',
    entitlementKey: 'imports',
    whileSuspended: 'deny',
    whileOperational: 'allow-if-entitled',
  }),
  Object.freeze({
    id: 'import-execute',
    capability: 'Import confirm/execute',
    methods: Object.freeze(['POST']),
    paths: Object.freeze(['/api/v1/imports/:id/confirm', '/api/v1/imports/:id/execute']),
    permission: 'imports.execute',
    subscriptionLabel: 'operational',
    entitlementKey: 'imports',
    whileSuspended: 'deny',
    whileOperational: 'allow-if-entitled',
  }),
  Object.freeze({
    id: 'audit-view',
    capability: 'Organization audit inquiry',
    methods: Object.freeze(['GET']),
    paths: Object.freeze(['/api/v1/audit-events', '/api/v1/audit-events/:id']),
    permission: 'audit.view',
    subscriptionLabel: 'suspended-read',
    entitlementKey: 'auditHistory',
    whileSuspended: 'allow-if-entitled',
    whileOperational: 'allow-if-entitled',
  }),
]);

function expectedOutcome(row, { status, entitlements }) {
  const operational = status === 'trial' || status === 'active' || status === 'grace';
  const suspendedRead =
    operational || status === 'suspended' || status === 'cancelled' || status === 'retained';

  if (row.subscriptionLabel === 'operational' && !operational) {
    return 'deny';
  }
  if (row.subscriptionLabel === 'suspended-read' && !suspendedRead) {
    return 'deny';
  }

  if (row.entitlementKey !== null) {
    const value = entitlements?.[row.entitlementKey];
    if (row.entitlementKey === 'auditHistory') {
      if (typeof value !== 'string' || value.trim() === '') {
        return 'deny';
      }
    } else if (value !== true) {
      return 'deny';
    }
  }

  if (status === 'suspended') {
    return row.whileSuspended === 'deny' ? 'deny' : 'allow';
  }
  return 'allow';
}

module.exports = {
  FROZEN_SUSPENDED_POLICY_MATRIX,
  expectedOutcome,
};
