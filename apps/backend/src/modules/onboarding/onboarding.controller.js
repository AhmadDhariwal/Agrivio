// @ts-check
const { sendSuccessEnvelope } = require('../../platform/http/response-envelope');

/**
 * @param {{ onboardingService: ReturnType<import('../onboarding/onboarding.service').createOnboardingService> }} deps
 */
function createOnboardingController(deps) {
  return {
    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    async submitActivationRequest(req, res, next) {
      try {
        const result = await deps.onboardingService.submitActivationRequest(
          /** @type {Record<string, unknown>} */ (req.body ?? {}),
        );
        sendSuccessEnvelope(res, result.duplicate ? 200 : 201, result);
      } catch (error) {
        next(error);
      }
    },

    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    async activateOwner(req, res, next) {
      try {
        const result = await deps.onboardingService.activateOwner(
          /** @type {Record<string, unknown>} */ (req.body ?? {}),
        );
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },
  };
}

/**
 * @param {{ onboardingService: ReturnType<import('../onboarding/onboarding.service').createOnboardingService> }} deps
 */
function createPlatformOrganizationController(deps) {
  return {
    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    async list(req, res, next) {
      try {
        const status =
          typeof req.query['status'] === 'string' ? req.query['status'] : undefined;
        const result = await deps.onboardingService.listOrganizations(
          status === undefined ? {} : { status },
        );
        sendSuccessEnvelope(res, 200, { items: result });
      } catch (error) {
        next(error);
      }
    },

    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    async getById(req, res, next) {
      try {
        const id = String(req.params['id'] ?? '');
        const result = await deps.onboardingService.getOrganization(id);
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    async approve(req, res, next) {
      try {
        const id = String(req.params['id'] ?? '');
        const actor = /** @type {{ platformActor?: { actorId: string } }} */ (req).platformActor;
        const result = await deps.onboardingService.approveOrganization(id, {
          actorId: actor?.actorId ?? 'unknown',
        });
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },

    /**
     * Explicit reject route — name matches behaviour.
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {import('express').NextFunction} next
     */
    async reject(req, res, next) {
      try {
        const id = String(req.params['id'] ?? '');
        const actor = /** @type {{ platformActor?: { actorId: string } }} */ (req).platformActor;
        const result = await deps.onboardingService.rejectOrganization(
          id,
          /** @type {Record<string, unknown>} */ (req.body ?? {}),
          { actorId: actor?.actorId ?? 'unknown' },
        );
        sendSuccessEnvelope(res, 200, result);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createOnboardingController,
  createPlatformOrganizationController,
};
