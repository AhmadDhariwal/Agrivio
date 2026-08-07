import { describe, expect, it } from 'vitest';
import { createPlatformActorMiddleware } from '../platform/platform-actor.middleware';
import { API_PLATFORM_ACTOR_HEADER } from '@agrivio/api-contracts';

describe('platform actor middleware', () => {
  it('rejects the development bypass header in production', () => {
    const middleware = createPlatformActorMiddleware({ nodeEnv: 'production' });
    /** @type {unknown} */
    let captured;
    middleware(
      /** @type {any} */ ({
        header: (name) => (name === API_PLATFORM_ACTOR_HEADER ? 'actor' : undefined),
      }),
      /** @type {any} */ ({}),
      (error) => {
        captured = error;
      },
    );
    expect(captured).toMatchObject({ name: 'AppError', statusCode: 403 });
  });

  it('requires the header in development/test', () => {
    const middleware = createPlatformActorMiddleware({ nodeEnv: 'test' });
    /** @type {unknown} */
    let captured;
    middleware(
      /** @type {any} */ ({ header: () => undefined }),
      /** @type {any} */ ({}),
      (error) => {
        captured = error;
      },
    );
    expect(captured).toMatchObject({ name: 'AppError', statusCode: 401 });
  });
});
