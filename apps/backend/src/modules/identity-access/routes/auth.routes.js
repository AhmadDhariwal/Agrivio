// @ts-check
import { Router } from 'express';
import { API_AUTH_ACTIVATE_PATH } from '@agrivio/api-contracts';
import { createActivateAccountHandler } from '../controllers/activation.controller.js';

/**
 * Register authentication routes (public activation endpoint).
 *
 * @param {{
 *   activationService: Parameters<typeof import('../controllers/activation.controller.js').createActivateAccountHandler>[0]['activationService'];
 * }} deps
 * @returns {Router}
 */
export function createAuthRouter({ activationService }) {
  const router = Router();

  router.post(API_AUTH_ACTIVATE_PATH, createActivateAccountHandler({ activationService }));

  return router;
}
