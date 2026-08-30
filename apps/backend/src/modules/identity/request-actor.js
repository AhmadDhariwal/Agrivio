const { contextRequired } = require('../../platform/errors/app-error');

function requireOrganizationId(req) {
  const organizationId = req.authContext?.organizationId;
  if (typeof organizationId !== 'string' || organizationId === '') {
    throw contextRequired('Organization context is required');
  }
  return organizationId;
}

function actorFromRequest(req) {
  return {
    actorId: String(req.authContext.userId),
    role: req.authContext.role,
    permissions: req.authContext.permissions ?? [],
    branchAssignments: req.authContext.branchAssignments ?? [],
    warehouseAssignments: req.authContext.warehouseAssignments ?? [],
    contextType: req.authContext.contextType,
    organizationId: req.authContext.organizationId,
  };
}

module.exports = {
  requireOrganizationId,
  actorFromRequest,
};
