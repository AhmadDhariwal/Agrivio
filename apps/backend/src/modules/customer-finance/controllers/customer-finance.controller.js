const { forbidden } = require('../../../platform/errors/app-error');
const { sendSuccessEnvelope } = require('../../../platform/http/response-envelope');
const { parsePaginationQuery } = require('../../../platform/http/parse-pagination-query');

function org(req) { const value = req.authContext?.organizationId; if (!value) throw forbidden('Organization context is required'); return String(value); }
function actor(req) { return { actorId: String(req.authContext.userId) }; }
function createCustomerFinanceController(deps) {
  const service = deps.customerFinanceService;
  return {
    async createLoan(req, res, next) { try { const result = await service.createLoan(org(req), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (e) { next(e); } },
    async listLoans(req, res, next) { try { const pagination = parsePaginationQuery(req.query); const result = await service.listLoans(org(req), { ...req.query, ...pagination }); sendSuccessEnvelope(res, 200, result.items, { page: result.page, pageSize: result.pageSize, total: result.total }); } catch (e) { next(e); } },
    async getLoan(req, res, next) { try { sendSuccessEnvelope(res, 200, await service.getLoan(org(req), String(req.params.id))); } catch (e) { next(e); } },
    async repayLoan(req, res, next) { try { const result = await service.repayLoan(org(req), String(req.params.id), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (e) { next(e); } },
    async reverseLoan(req, res, next) { try { const result = await service.reverseLoan(org(req), String(req.params.id), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (e) { next(e); } },
    async reverseRepayment(req, res, next) { try { const result = await service.reverseRepayment(org(req), String(req.params.id), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (e) { next(e); } },
    async adjustBalance(req, res, next) { try { const result = await service.adjustBalance(org(req), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (e) { next(e); } },
    async reverseAdjustment(req, res, next) { try { const result = await service.reverseAdjustment(org(req), String(req.params.id), req.body, actor(req), req.get('Idempotency-Key')); sendSuccessEnvelope(res, result.statusCode, result.data); } catch (e) { next(e); } },
  };
}
module.exports = { createCustomerFinanceController };
