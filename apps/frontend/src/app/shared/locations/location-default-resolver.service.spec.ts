import { TestBed } from '@angular/core/testing';
import { LocationDefaultResolverService } from './location-default-resolver.service';
import { AuthSessionStore } from '../../features/auth/data-access/auth-session.store';

describe('LocationDefaultResolverService', () => {
  let context: { branchId?: string; warehouseId?: string };
  let allowedBranchIds: Set<string> | null;
  let service: LocationDefaultResolverService;

  beforeEach(() => {
    context = {};
    allowedBranchIds = null;
    TestBed.configureTestingModule({
      providers: [
        LocationDefaultResolverService,
        {
          provide: AuthSessionStore,
          useValue: {
            activeContext: () => context,
            filterBranches: <T extends { id: string }>(items: T[]) => {
              const allowed = allowedBranchIds;
              return allowed ? items.filter((item) => allowed.has(item.id)) : items;
            },
            filterWarehouses: <T>(items: T[]) => items,
          },
        },
      ],
    });
    service = TestBed.inject(LocationDefaultResolverService);
  });

  it('auto-selects exactly one active branch', () => {
    expect(service.resolveBranches([{ id: 'b1', status: 'active' }]).selectedId).toBe('b1');
  });

  it('uses an accessible preferred branch before the organization default', () => {
    context.branchId = 'b2';
    expect(
      service.resolveBranches([
        { id: 'b1', status: 'active', isDefault: true },
        { id: 'b2', status: 'active' },
      ]).selectedId,
    ).toBe('b2');
  });

  it('ignores inactive defaults and leaves selection manual when multiple options remain', () => {
    context.branchId = 'b2';
    expect(
      service.resolveBranches([
        { id: 'b1', status: 'active' },
        { id: 'b2', status: 'inactive', isDefault: true },
        { id: 'b3', status: 'active' },
      ]).selectedId,
    ).toBe('');
  });

  it('ignores an inaccessible organization default', () => {
    allowedBranchIds = new Set(['b2', 'b3']);
    expect(
      service.resolveBranches([
        { id: 'b1', status: 'active', isDefault: true },
        { id: 'b2', status: 'active' },
        { id: 'b3', status: 'active' },
      ]).selectedId,
    ).toBe('');
  });

  it('uses the branch default warehouse and drops an incompatible prior selection', () => {
    const result = service.resolveWarehouses(
      [
        { id: 'w1', branchId: 'b1', status: 'active' },
        { id: 'w2', branchId: 'b2', status: 'active', isDefault: true },
        { id: 'w3', branchId: 'b2', status: 'active' },
      ],
      'b2',
      'w1',
    );
    expect(result.options.map((item) => item.id)).toEqual(['w2', 'w3']);
    expect(result.selectedId).toBe('w2');
  });

  it('auto-selects exactly one warehouse valid for the branch', () => {
    expect(
      service.resolveWarehouses(
        [
          { id: 'w1', branchId: 'b1', status: 'active' },
          { id: 'w2', branchId: 'b2', status: 'active' },
        ],
        'b1',
      ).selectedId,
    ).toBe('w1');
  });

  it('requires manual warehouse selection when multiple valid options have no default', () => {
    expect(
      service.resolveWarehouses(
        [
          { id: 'w1', branchId: 'b1', status: 'active' },
          { id: 'w2', branchId: null, status: 'active' },
        ],
        'b1',
      ).selectedId,
    ).toBe('');
  });
});
