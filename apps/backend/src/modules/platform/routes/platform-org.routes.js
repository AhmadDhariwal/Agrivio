// @ts-check
import { Router } from 'express';
import { API_PLATFORM_ORGANIZATIONS_PATH } from '@agrivio/api-contracts';
import { createPlatformOrgHandlers } from '../controllers/platform-org.controller.js';
import { requirePlatformPermission } from '../middleware/platform-auth.middleware.js';

const PERM_VIEW = 'platform.organizations.view';
const PERM_APPROVE = 'platform.organizations.approve';

/**
 * Register platform organization management routes.
 *
 * @param {{
 *   platformOrgService: Parameters<typeof import('../controllers/platform-org.controller.js').createPlatformOrgHandlers>[0]['platformOrgService'];
 *   idempotencyService: Parameters<typeof import('../controllers/platform-org.controller.js').createPlatformOrgHandlers>[0]['idempotencyService'];
 * }} deps
 * @returns {Router}
 */
export function createPlatformOrgRouter({ platformOrgService, idempotencyService }) {
  const router = Router();
  const { listOrganizations, getOrganization, decideOrganization } = createPlatformOrgHandlers({
    platformOrgService,
    idempotencyService,
  });

  router.get(
    API_PLATFORM_ORGANIZATIONS_PATH,
    requirePlatformPermission(PERM_VIEW),
    listOrganizations,
  );

  router.get(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id`,
    requirePlatformPermission(PERM_VIEW),
    getOrganization,
  );

  router.post(
    `${API_PLATFORM_ORGANIZATIONS_PATH}/:id/approve`,
    requirePlatformPermission(PERM_APPROVE),
    decideOrganization,
  );

  return router;
}
