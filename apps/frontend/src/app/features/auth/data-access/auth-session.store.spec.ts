import { TestBed } from '@angular/core/testing';
import { AuthSessionStore } from './auth-session.store';
import { AuthApi, AuthSessionSnapshot } from './auth.api';
import { of, Subject } from 'rxjs';

describe('AuthSessionStore', () => {
  it('shares a single authoritative session bootstrap request', () => {
    const response = new Subject<AuthSessionSnapshot>();
    const getSession = vi.fn(() => response.asObservable());
    TestBed.configureTestingModule({
      providers: [AuthSessionStore, { provide: AuthApi, useValue: { getSession } }],
    });
    const store = TestBed.inject(AuthSessionStore);

    const first = store.loadSession();
    const second = store.loadSession();
    first.subscribe();
    second.subscribe();

    expect(first).toBe(second);
    expect(getSession).toHaveBeenCalledOnce();
    response.next(snapshot('org-1'));
    response.complete();
    expect(store.activeContext()?.organizationId).toBe('org-1');
  });

  it('exposes active context and reacts when the context changes', () => {
    const api = {
      getSession: () => of(snapshot('org-1')),
      switchContext: () => of({ csrfToken: 'x', session: snapshot('org-2') }),
    };

    TestBed.configureTestingModule({
      providers: [AuthSessionStore, { provide: AuthApi, useValue: api }],
    });

    const store = TestBed.inject(AuthSessionStore);
    store.applySession(snapshot('org-1'));
    expect(store.activeContext()?.organizationId).toBe('org-1');
    expect(store.hasPermission('organization.view')).toBe(true);
    expect(store.canSelectBranch('branch-a')).toBe(true);
    expect(store.canSelectBranch('branch-b')).toBe(false);

    store.switchContext({ contextType: 'organization', organizationId: 'org-2' }).subscribe();
    expect(store.activeContext()?.organizationId).toBe('org-2');
    expect(store.hasPermission('organization.view')).toBe(false);
  });
});

function snapshot(organizationId: string): AuthSessionSnapshot {
  return {
    user: {
      id: 'u1',
      email: 'user@example.com',
      displayName: 'User',
      status: 'active',
    },
    activeContext: {
      contextType: 'organization',
      organizationId,
      membershipId: `m-${organizationId}`,
      role: organizationId === 'org-1' ? 'Cashier' : 'Cashier',
      permissions: organizationId === 'org-1' ? ['organization.view'] : ['sales.create'],
      branchAssignments:
        organizationId === 'org-1' ? [{ targetId: 'branch-a' }] : [{ targetId: 'branch-x' }],
      warehouseAssignments: [],
    },
    availableContexts: [],
    branchAssignments: [],
    warehouseAssignments: [],
    subscriptionAccessState: null,
  };
}
