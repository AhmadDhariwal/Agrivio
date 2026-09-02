import { describe, expect, it } from 'vitest';
import capabilityRegistryModule from './capability.registry';

const { listCapabilityControls, CONTROL_TYPES, RISK_LEVELS } = capabilityRegistryModule;

const EXPECTED_MODULES = [
  'inventory.products',
  'inventory.categories',
  'inventory.stock',
  'inventory.openingStock',
  'inventory.batches',
  'inventory.expiry',
  'inventory.adjustments',
  'inventory.transfers',
  'inventory.reconciliation',
  'inventory.movements',
  'branches',
  'warehouses',
  'customers',
  'suppliers',
  'returns',
  'purchases',
  'sales',
  'payments.customer',
  'payments.supplier',
  'payments.supplierLedger',
  'accounts',
  'expenses',
  'expenses.categories',
  'reports',
  'alerts',
  'employees',
  'dashboard',
  'billing',
  'setup',
  'settings',
  'imports',
  'audit',
];

describe('Capability Registry Integrity', () => {
  it('registers all 32 expected domain and system modules', () => {
    const controls = listCapabilityControls();
    const modules = controls.filter((c) => c.type === CONTROL_TYPES.Module || (c.type === CONTROL_TYPES.Feature && c.key === 'inventory.products'));
    const moduleKeys = new Set(controls.map((c) => c.moduleKey));
    
    for (const key of EXPECTED_MODULES) {
      expect(moduleKeys.has(key), `Expected registry to contain module: ${key}`).toBe(true);
    }
    expect(moduleKeys.size).toBe(EXPECTED_MODULES.length);
  });

  it('ensures every control has valid structure and metadata', () => {
    const controls = listCapabilityControls();
    for (const control of controls) {
      expect(control.key).toBeTypeOf('string');
      expect(control.key.length).toBeGreaterThan(0);
      expect(control.moduleKey).toBeTypeOf('string');
      expect(Object.values(CONTROL_TYPES)).toContain(control.type);
      expect(control.label).toBeTypeOf('string');
      expect(control.description).toBeTypeOf('string');
      expect(Object.values(RISK_LEVELS)).toContain(control.risk);
      expect(control.defaultPolicy).toBeTypeOf('object');
      expect(control.configurable).toBeTypeOf('object');

      // Platform enforced / required fields must have explicit platformEnforced boolean
      if (control.type === CONTROL_TYPES.Field) {
        if (control.configurable.visible === false && control.configurable.editable === false) {
          expect(
            control.platformEnforced,
            `Field ${control.key} is non-configurable but missing platformEnforced: true`,
          ).toBe(true);
        }
      }
    }
  });

  it('ensures unique keys across all controls', () => {
    const controls = listCapabilityControls();
    const seen = new Set();
    for (const control of controls) {
      expect(seen.has(control.key), `Duplicate key detected: ${control.key}`).toBe(false);
      seen.add(control.key);
    }
  });

  it('ensures imports and audit module definitions conform to constraints', () => {
    const controls = listCapabilityControls();
    const importsControls = controls.filter((c) => c.moduleKey === 'imports');
    const auditControls = controls.filter((c) => c.moduleKey === 'audit');

    expect(importsControls.length).toBeGreaterThanOrEqual(10);
    expect(auditControls.length).toBeGreaterThanOrEqual(10);

    // Imports actions separation: preview vs execute
    const previewAction = importsControls.find((c) => c.key === 'imports.actions.preview');
    const executeAction = importsControls.find((c) => c.key === 'imports.actions.execute');
    expect(previewAction).toBeDefined();
    expect(executeAction).toBeDefined();
    expect(previewAction.requiredPermissions.allowed).toBe('imports.preview');
    expect(executeAction.requiredPermissions.allowed).toBe('imports.execute');

    // Audit immutable fields are platformEnforced
    const timestampField = auditControls.find((c) => c.key === 'audit.fields.timestamp');
    expect(timestampField).toBeDefined();
    expect(timestampField.platformEnforced).toBe(true);
  });
});
