import { describe, expect, it, vi } from 'vitest';
import customersModule from './customers.module';

const { createCustomersModule } = customersModule;

describe('Customers capability mutation enforcement', () => {
  it('delegates profile, lifecycle, credit-policy, and opening-balance mutations to backend capability checks', async () => {
    const capabilityDenied = new Error('capability denied');
    const capabilityService = {
      assertCustomerPatchAllowed: vi.fn(),
      assertCustomerCreditPolicyAllowed: vi.fn(),
      assertCustomerOpeningBalanceAllowed: vi.fn().mockRejectedValue(capabilityDenied),
    };
    const customers = createCustomersModule({
      persistence: 'memory',
      capabilityService,
      ledgersService: {},
    });
    const actor = { actorId: 'actor-1' };
    const created = await customers.customersService.createCustomer(
      'org-1',
      { name: 'Capability Customer', customerType: 'individual' },
      actor,
    );

    const edited = await customers.customersService.updateCustomer(
      'org-1',
      created.id,
      { expectedVersion: 1, phone: '03001234567' },
      actor,
    );
    const deactivated = await customers.customersService.updateCustomer(
      'org-1',
      created.id,
      { expectedVersion: edited.version, status: 'inactive' },
      actor,
    );
    const reactivated = await customers.customersService.updateCustomer(
      'org-1',
      created.id,
      { expectedVersion: deactivated.version, status: 'active' },
      actor,
    );
    await customers.customersService.updateCreditPolicy(
      'org-1',
      created.id,
      { expectedVersion: reactivated.version, creditEnabled: true },
      actor,
    );

    expect(capabilityService.assertCustomerPatchAllowed).toHaveBeenNthCalledWith(
      1,
      'org-1',
      expect.objectContaining({ status: 'active' }),
      expect.objectContaining({ phone: '03001234567' }),
    );
    expect(capabilityService.assertCustomerPatchAllowed).toHaveBeenNthCalledWith(
      2,
      'org-1',
      expect.objectContaining({ status: 'active' }),
      { status: 'inactive' },
    );
    expect(capabilityService.assertCustomerPatchAllowed).toHaveBeenNthCalledWith(
      3,
      'org-1',
      expect.objectContaining({ status: 'inactive' }),
      { status: 'active' },
    );
    expect(capabilityService.assertCustomerCreditPolicyAllowed).toHaveBeenCalledWith(
      'org-1',
      expect.objectContaining({ creditEnabled: false }),
      { creditEnabled: true },
    );

    await expect(
      customers.customersService.postOpeningBalance(
        'org-1',
        created.id,
        { kind: 'receivable', amount: { amount: '100.00', currency: 'PKR' } },
        actor,
        'opening-key',
      ),
    ).rejects.toBe(capabilityDenied);
    expect(capabilityService.assertCustomerOpeningBalanceAllowed).toHaveBeenCalledWith('org-1');
  });
});
