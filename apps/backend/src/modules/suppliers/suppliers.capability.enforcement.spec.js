import { describe, expect, it, vi } from 'vitest';
import suppliersModule from './suppliers.module';

const { createSuppliersModule } = suppliersModule;

describe('Suppliers capability mutation enforcement', () => {
  it('delegates create, profile, lifecycle, delete, and opening mutations to capability checks', async () => {
    const capabilityDenied = new Error('capability denied');
    const capabilityService = {
      assertSupplierCreateAllowed: vi.fn(),
      assertSupplierPatchAllowed: vi.fn(),
      assertSupplierDeleteAllowed: vi.fn(),
      assertSupplierOpeningBalanceAllowed: vi.fn().mockRejectedValue(capabilityDenied),
    };
    const suppliers = createSuppliersModule({
      persistence: 'memory',
      capabilityService,
      ledgersService: {},
    });
    const actor = { actorId: 'actor-1' };
    const created = await suppliers.suppliersService.createSupplier(
      'org-1',
      { name: 'Capability Supplier' },
      actor,
    );
    const edited = await suppliers.suppliersService.updateSupplier(
      'org-1',
      created.id,
      { expectedVersion: 1, phone: '03001234567' },
      actor,
    );
    const deactivated = await suppliers.suppliersService.updateSupplier(
      'org-1',
      created.id,
      { expectedVersion: edited.version, status: 'inactive' },
      actor,
    );
    const reactivated = await suppliers.suppliersService.updateSupplier(
      'org-1',
      created.id,
      { expectedVersion: deactivated.version, status: 'active' },
      actor,
    );

    expect(capabilityService.assertSupplierCreateAllowed).toHaveBeenCalledWith('org-1');
    expect(capabilityService.assertSupplierPatchAllowed).toHaveBeenNthCalledWith(
      1,
      'org-1',
      expect.objectContaining({ status: 'active' }),
      expect.objectContaining({ phone: '03001234567' }),
    );
    expect(capabilityService.assertSupplierPatchAllowed).toHaveBeenNthCalledWith(
      2,
      'org-1',
      expect.objectContaining({ status: 'active' }),
      { status: 'inactive' },
    );
    expect(capabilityService.assertSupplierPatchAllowed).toHaveBeenNthCalledWith(
      3,
      'org-1',
      expect.objectContaining({ status: 'inactive' }),
      { status: 'active' },
    );

    const openingSupplier = await suppliers.suppliersService.createSupplier(
      'org-1',
      { name: 'Opening Supplier' },
      actor,
    );
    await expect(
      suppliers.suppliersService.postOpeningBalance(
        'org-1',
        openingSupplier.id,
        { kind: 'payable', amount: { amount: '100.00', currency: 'PKR' } },
        actor,
        'opening-key',
      ),
    ).rejects.toBe(capabilityDenied);
    expect(capabilityService.assertSupplierOpeningBalanceAllowed).toHaveBeenCalledWith('org-1');

    await suppliers.suppliersService.deleteSupplier('org-1', created.id, actor);
    expect(capabilityService.assertSupplierDeleteAllowed).toHaveBeenCalledWith('org-1');
    await expect(suppliers.suppliersService.getSupplier('org-1', created.id)).rejects.toMatchObject(
      {
        code: 'NOT_FOUND',
      },
    );

    expect(reactivated.status).toBe('active');
  });
});
