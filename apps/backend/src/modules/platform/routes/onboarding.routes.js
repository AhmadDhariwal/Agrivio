// @ts-check
import { Router } from 'express';
import { API_ONBOARDING_REQUEST_PATH } from '@agrivio/api-contracts';
import { createSubmitActivationRequestHandler } from '../controllers/onboarding.controller.js';

/**
 * Register public onboarding routes.
 *
 * @param {{
 *   onboardingService: Parameters<typeof import('../controllers/onboarding.controller.js').createSubmitActivationRequestHandler>[0]['onboardingService'];
 *   idempotencyService: Parameters<typeof import('../controllers/onboarding.controller.js').createSubmitActivationRequestHandler>[0]['idempotencyService'];
 * }} deps
 * @returns {Router}
 */
export function createOnboardingRouter({ onboardingService, idempotencyService }) {
  const router = Router();

  const handler = createSubmitActivationRequestHandler({ onboardingService, idempotencyService });

  router.post(API_ONBOARDING_REQUEST_PATH, handler);

  return router;
}
