const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { notFound } = require('../../../platform/errors/app-error');

function createOrganizationController(deps) {
  return {
    async getCurrent(req, res, next) {
      try {
        const organizationId = req.authContext?.organizationId;
        if (typeof organizationId !== 'string' || organizationId === '') {
          throw notFound('Organization not found');
        }

        const organization = await deps.findOrganizationById(organizationId);
        if (organization === null) {
          throw notFound('Organization not found');
        }

        sendSuccessEnvelope(res, 200, {
          id: String(organization['_id']),
          name: organization['name'],
          status: organization['status'],
          timezone: organization['timezone'],
        });
      } catch (error) {
        next(error);
      }
    },
  };
}

module.exports = {
  createOrganizationController,
};
