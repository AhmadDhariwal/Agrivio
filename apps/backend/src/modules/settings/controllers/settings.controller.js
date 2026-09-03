const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { forbidden } = require('../../../platform/errors/app-error');

function createSettingsController(deps) {
  return {
    async get(req, res, next) {
      try {
        const organizationId = req.authContext?.organizationId;
        if (typeof organizationId !== 'string' || organizationId === '') {
          throw forbidden('Organization context is required');
        }
        const data = await deps.settingsService.getSettings(organizationId);
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },

    async patch(req, res, next) {
      try {
        const organizationId = req.authContext?.organizationId;
        if (typeof organizationId !== 'string' || organizationId === '') {
          throw forbidden('Organization context is required');
        }
        if (req.body?.organizationId !== undefined && req.body.organizationId !== organizationId) {
          throw forbidden('Cross-organization modification rejected');
        }
        const data = await deps.settingsService.updateSettings(organizationId, req.body, {
          actorId: String(req.authContext.userId),
        });
        sendSuccessEnvelope(res, 200, data);
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createSettingsController,
};
