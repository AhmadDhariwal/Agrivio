const { createApiErrorEnvelope, createApiSuccessEnvelope } = require('@agrivio/api-contracts');
const { requireRequestIdFromContext } = require('./request-id.middleware');
function sendSuccessEnvelope(res, statusCode, data, meta) {
  const requestId = requireRequestIdFromContext(res);
  const body = createApiSuccessEnvelope(requestId, data, meta);
  res.status(statusCode).json(body);
}

function sendErrorEnvelope(res, statusCode, error) {
  const requestId = requireRequestIdFromContext(res);
  const body = createApiErrorEnvelope(requestId, error);
  res.status(statusCode).json(body);
}

module.exports = {
  sendSuccessEnvelope,
  sendErrorEnvelope,
};
