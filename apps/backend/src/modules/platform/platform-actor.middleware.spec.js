import { describe, expect, it } from 'vitest';
import {
  createPlatformActorMiddleware,
  requirePlatformPermission,
} from '../platform/platform-actor.middleware';
import { API_PLATFORM_ACTOR_HEADER } from '@agrivio/api-contracts';

describe('platform actor middleware', () => {
  it('rejects the development bypass header in production', () => {
    const middleware = createPlatformActorMiddleware({ nodeEnv: 'production' });
    let captured;
    middleware(
      {
        header: (name) => (name === API_PLATFORM_ACTOR_HEADER ? 'actor' : undefined),
      },
      {},
      (error) => {
        captured = error;
      },
    );
    expect(captured).toMatchObject({ name: 'AppError', statusCode: 403 });
  });

  it('requires authentication or the development actor header in development/test', () => {
    const middleware = createPlatformActorMiddleware({ nodeEnv: 'test' });
    let captured;
    middleware({ header: () => undefined }, {}, (error) => {
      captured = error;
    });
    expect(captured).toMatchObject({ name: 'AppError', statusCode: 401 });
  });

  it('can disable the actor header for security-sensitive development routes', () => {
    const middleware = createPlatformActorMiddleware(
      { nodeEnv: 'development' },
      { allowDevelopmentHeader: false },
    );
    let captured;
    middleware({ header: () => 'spoofed-platform-actor' }, {}, (error) => {
      captured = error;
    });
    expect(captured).toMatchObject({ name: 'AppError', statusCode: 401 });
  });

  it.each(['Owner', 'Manager', 'Cashier', 'StoreKeeper'])(
    'denies tenant %s sessions on platform routes',
    (role) => {
      const middleware = createPlatformActorMiddleware(
        { nodeEnv: 'development' },
        { allowDevelopmentHeader: false },
      );
      let captured;
      middleware(
        {
          header: () => undefined,
          auth: {
            user: { _id: 'tenant-user', platformAccess: null },
            session: { activeContextType: 'organization' },
          },
          authContext: { contextType: 'organization', role },
        },
        {},
        (error) => {
          captured = error;
        },
      );
      expect(captured).toMatchObject({ name: 'AppError', statusCode: 403 });
    },
  );

  it('denies platform actors that lack the required organization permission', () => {
    const middleware = requirePlatformPermission('platform.organizations.create');
    let captured;
    middleware(
      {
        platformActor: {
          actorId: 'limited',
          permissions: ['platform.organizations.view'],
        },
      },
      {},
      (error) => {
        captured = error;
      },
    );
    expect(captured).toMatchObject({ name: 'AppError', statusCode: 403 });

    let passed = false;
    requirePlatformPermission('platform.organizations.suspend')(
      {
        platformActor: {
          actorId: 'ok',
          permissions: ['platform.organizations.suspend'],
        },
      },
      {},
      (error) => {
        passed = error === undefined;
      },
    );
    expect(passed).toBe(true);
  });
});
