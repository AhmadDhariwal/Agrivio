// @ts-check
import { API_IDEMPOTENCY_KEY_HEADER } from '@agrivio/api-contracts';
import { sendSuccessEnvelope } from '../../../platform/http/response-envelope.js';
import { idempotencyConflict } from '../../../platform/errors/app-error.js';

/**
 * Controller for the public organization activation-request endpoint.
 * Route: POST /api/v1/organization-activation-requests
 *
 * @param {{
 *   onboardingService: {
 *     submitActivationRequest: (input: unknown, session?: unknown) => Promise<{ organizationId: string; isNewUser: boolean }>;
 *   };
 *   idempotencyService: {
 *     execute: (scope: import('../../../platform/idempotency/idempotency-service.js').IdempotencyScope, key: string, fingerprint: unknown, handler: () => Promise<import('../../../platform/idempotency/idempotency-service.js').IdempotencyStoredResponse>) => Promise<{ replay: boolean; response: import('../../../platform/idempotency/idempotency-service.js').IdempotencyStoredResponse }>;
 *   };
 * }} deps
 * @returns {import('express').RequestHandler}
 */
export function createSubmitActivationRequestHandler({ onboardingService, idempotencyService }) {
  return async (req, res, next) => {
    try {
      const idempotencyKey = req.headers[API_IDEMPOTENCY_KEY_HEADER.toLowerCase()];

      if (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0) {
        throw idempotencyConflict('Idempotency-Key header is required for this endpoint');
      }

      const body = /** @type {Record<string, unknown>} */ (req.body ?? {});

      const result = await idempotencyService.execute(
        {
          scopeType: 'public_onboarding',
          actorId: 'public',
          operation: 'organization.activation_request',
        },
        idempotencyKey.trim(),
        body,
        async () => {
          const data = await onboardingService.submitActivationRequest(body);
          return { statusCode: 201, body: data };
        },
      );

      if (result.replay) {
        res.setHeader('Idempotency-Replayed', 'true');
        return sendSuccessEnvelope(res, result.response.statusCode, result.response.body);
      }

      return sendSuccessEnvelope(res, 201, result.response.body);
    } catch (error) {
      return next(error);
    }
  };
}
