const { Router } = require('express');
const { sendSuccessEnvelope } = require('../http/response-envelope');
const { forbidden } = require('../errors/app-error');
const { hashPassword } = require('../../modules/identity/password.service');

const E2E_SUPER_ADMIN_EMAIL = 'e2e-super-admin@agrivio.test';
const E2E_SUPER_ADMIN_PASSWORD = 'e2e-super-admin-passphrase';

/**
 * Test-only E2E bootstrap. Impossible in production (route not registered;
 * config.allowE2eBootstrap cannot be true when NODE_ENV=production).
 */
function registerE2eBootstrapRoutes(deps) {
  const router = Router();

  router.post('/api/v1/test/e2e/bootstrap', async (req, res, next) => {
    try {
      if (deps.config.nodeEnv === 'production' || deps.config.allowE2eBootstrap !== true) {
        next(forbidden('E2E bootstrap is not available'));
        return;
      }

      const existing = await deps.authStore.findUserByEmailNormalized(E2E_SUPER_ADMIN_EMAIL);
      if (existing === null) {
        const passwordHash = await hashPassword(E2E_SUPER_ADMIN_PASSWORD);
        await deps.authStore.insertUser(null, {
          email: E2E_SUPER_ADMIN_EMAIL,
          emailNormalized: E2E_SUPER_ADMIN_EMAIL,
          displayName: 'E2E Super Admin',
          passwordHash,
          status: 'active',
          platformAccess: 'super_admin',
          version: 1,
        });
      }

      sendSuccessEnvelope(res, 200, {
        superAdmin: {
          email: E2E_SUPER_ADMIN_EMAIL,
          password: E2E_SUPER_ADMIN_PASSWORD,
        },
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

module.exports = {
  registerE2eBootstrapRoutes,
  E2E_SUPER_ADMIN_EMAIL,
  E2E_SUPER_ADMIN_PASSWORD,
};
