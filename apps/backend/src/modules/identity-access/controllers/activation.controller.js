// @ts-check
import { sendSuccessEnvelope } from '../../../platform/http/response-envelope.js';

/**
 * Controller for the public account activation endpoint.
 * Route: POST /api/v1/auth/activate
 *
 * @param {{
 *   activationService: {
 *     activateAccount: (params: { token: string; password: string }) => Promise<{ userId: string; organizationId: string | null }>;
 *   };
 * }} deps
 * @returns {import('express').RequestHandler}
 */
export function createActivateAccountHandler({ activationService }) {
  return async (req, res, next) => {
    try {
      const body = /** @type {Record<string, unknown>} */ (req.body ?? {});
      const token = typeof body['token'] === 'string' ? body['token'] : '';
      const password = typeof body['password'] === 'string' ? body['password'] : '';

      const result = await activationService.activateAccount({ token, password });

      return sendSuccessEnvelope(res, 200, { userId: result.userId });
    } catch (error) {
      return next(error);
    }
  };
}
