const { sendSuccessEnvelope } = require('../../platform/http/response-envelope');
const {
  appendSetCookie,
  buildClearedSessionCookie,
  buildSessionCookie,
  readSessionToken,
} = require('./auth.cookies');

function createAuthController(deps) {
  const secure = deps.config.nodeEnv === 'production';

  function setSessionCookie(res, session) {
    appendSetCookie(
      res,
      buildSessionCookie({
        token: session.sessionToken,
        maxAgeSeconds: session.maxAgeSeconds,
        secure,
      }),
    );
  }

  function clearSessionCookie(res) {
    appendSetCookie(res, buildClearedSessionCookie({ secure }));
  }

  return {
    async csrf(req, res, next) {
      try {
        const result = await deps.authService.issueCsrf(readSessionToken(req));
        setSessionCookie(res, result);
        sendSuccessEnvelope(res, 200, { csrfToken: result.csrfToken });
      } catch (error) {
        next(error);
      }
    },

    async login(req, res, next) {
      try {
        const transport = req.authTransport ?? { clientKey: 'unknown' };
        const result = await deps.authService.login(req.body ?? {}, transport);
        setSessionCookie(res, result);
        sendSuccessEnvelope(res, 200, {
          csrfToken: result.csrfToken,
          session: result.session,
        });
      } catch (error) {
        next(error);
      }
    },

    async logout(req, res, next) {
      try {
        const transport = req.authTransport ?? { clientKey: 'unknown' };
        const result = await deps.authService.logout(transport);
        clearSessionCookie(res);
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    async session(req, res, next) {
      try {
        const snapshot = await deps.authService.getSession(readSessionToken(req));
        sendSuccessEnvelope(res, 200, snapshot);
      } catch (error) {
        next(error);
      }
    },

    async switchContext(req, res, next) {
      try {
        const transport = req.authTransport ?? { clientKey: 'unknown' };
        const result = await deps.authService.switchContext(req.body ?? {}, transport);
        setSessionCookie(res, result);
        sendSuccessEnvelope(res, 200, {
          csrfToken: result.csrfToken,
          session: result.session,
        });
      } catch (error) {
        next(error);
      }
    },

    async requestPasswordReset(req, res, next) {
      try {
        const transport = req.authTransport ?? { clientKey: 'unknown' };
        const result = await deps.authService.requestPasswordReset(req.body ?? {}, transport);
        const responseBody = { ...result };
        delete responseBody.resetTokenForTest;
        sendSuccessEnvelope(res, 200, {
          ...responseBody,
          ...(deps.config.nodeEnv === 'test' && result.resetTokenForTest !== undefined
            ? { resetTokenForTest: result.resetTokenForTest }
            : {}),
        });
      } catch (error) {
        next(error);
      }
    },

    async confirmPasswordReset(req, res, next) {
      try {
        const transport = req.authTransport ?? { clientKey: 'unknown' };
        const result = await deps.authService.confirmPasswordReset(req.body ?? {}, transport);
        setSessionCookie(res, result);
        sendSuccessEnvelope(res, 200, {
          status: result.status,
          csrfToken: result.csrfToken,
        });
      } catch (error) {
        next(error);
      }
    },

    async activate(req, res, next) {
      try {
        if (deps.onboardingService === undefined) {
          throw new Error('Onboarding service is required for activation');
        }
        const activated = await deps.onboardingService.activateOwner(req.body ?? {});
        const session = await deps.authService.establishSessionForUser(
          String(activated['userId'] ?? activated['ownerUserId'] ?? ''),
        );
        setSessionCookie(res, session);
        sendSuccessEnvelope(res, 200, {
          ...activated,
          csrfToken: session.csrfToken,
          session: session.session,
        });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createAuthController,
};
