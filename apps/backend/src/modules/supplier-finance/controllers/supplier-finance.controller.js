const { forbidden } = require('../../../platform/errors/app-error');
const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { parsePaginationQuery } = require('../../../platform/http/parse-pagination-query');

function org(req) { const value = req.authContext?.organizationId; if (!value) throw forbidden('Organization context is required'); return String(value); }
function actor(req) { return { actorId: String(req.authContext.userId) }; }

function createSupplierFinanceController(deps) {
  const service = deps.supplierFinanceService;
  return {
    async postRefund(req, res, next) { try { const result = await service.postRefund(org(req), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (error) { next(error); } },
    async listRefunds(req, res, next) { try { const pagination = parsePaginationQuery(req.query); const result = await service.listRefunds(org(req), { ...req.query, ...pagination }); sendSuccessEnvelope(res, 200, result.items, { page: result.page, pageSize: result.pageSize, total: result.total }); } catch (error) { next(error); } },
    async reverseRefund(req, res, next) { try { const result = await service.reverseRefund(org(req), String(req.params.id), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (error) { next(error); } },
    async adjustBalance(req, res, next) { try { const result = await service.adjustBalance(org(req), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (error) { next(error); } },
    async reverseAdjustment(req, res, next) { try { const result = await service.reverseAdjustment(org(req), String(req.params.id), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (error) { next(error); } },
  };
}

module.exports = { createSupplierFinanceController };
