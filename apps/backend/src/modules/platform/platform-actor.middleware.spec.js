import { describe, expect, it } from 'vitest';
import { createPlatformActorMiddleware } from '../platform/platform-actor.middleware';
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
});
