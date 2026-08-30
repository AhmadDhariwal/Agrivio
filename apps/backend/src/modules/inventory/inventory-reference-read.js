const { formatQuantityMinorUnits } = require('../../platform/primitives/money-and-time');
const { toBatchDto, toMovementDto, toTransferDto } = require('./inventory.validation');

function uniqueIds(values) {
  return [...new Set(values.map((value) => String(value)).filter(Boolean))];
}

async function loadMovementReferenceMaps({ store, catalogService, locationsService, organizationId, movements }) {
  const productIds = uniqueIds(movements.map((item) => item.productId));
  const warehouseIds = uniqueIds(movements.map((item) => item.warehouseId));
  const batchIds = uniqueIds(
    movements.map((item) => item.batchId).filter((id) => id !== null && id !== undefined && id !== ''),
  );

  const [products, warehouses, batches] = await Promise.all([
    typeof catalogService?.findProductsByIds === 'function'
      ? catalogService.findProductsByIds(organizationId, productIds)
      : Promise.resolve([]),
    typeof locationsService?.findWarehousesByIds === 'function'
      ? locationsService.findWarehousesByIds(organizationId, warehouseIds)
      : Promise.resolve([]),
    typeof store.findBatchesByIds === 'function'
      ? store.findBatchesByIds(organizationId, batchIds)
      : Promise.resolve([]),
  ]);

  const productMap = new Map(products.map((item) => [String(item.id), item]));
  const warehouseMap = new Map(warehouses.map((item) => [String(item.id), item]));
  const batchMap = new Map(batches.map((item) => [String(item.id ?? item._id), item]));

  return { productMap, warehouseMap, batchMap };
}

function toMovementListItemDto(record, refs) {
  const dto = toMovementDto(record);
  const product = refs.productMap.get(String(record.productId));
  const warehouse = refs.warehouseMap.get(String(record.warehouseId));
  const batch =
    record.batchId === null || record.batchId === undefined || record.batchId === ''
      ? null
      : refs.batchMap.get(String(record.batchId));

  return {
    ...dto,
    productNameSnapshot: product ? String(product.name) : null,
    productSkuSnapshot: product ? String(product.sku ?? '') : null,
    productBaseUnitSnapshot: product ? String(product.baseUnitCode ?? '') : null,
    warehouseNameSnapshot: warehouse ? String(warehouse.name) : null,
    warehouseCodeSnapshot: warehouse ? String(warehouse.code ?? '') : null,
    batchNumberSnapshot: batch ? String(batch.batchNumber ?? '') : null,
  };
}

async function attachBatchStockLocations(store, organizationId, batchDtos) {
  if (!Array.isArray(batchDtos) || batchDtos.length === 0) {
    return batchDtos;
  }
  const batchIds = batchDtos.map((item) => String(item.id));
  const locationsByBatchId =
    typeof store.listBalanceLocationsByBatchIds === 'function'
      ? await store.listBalanceLocationsByBatchIds(organizationId, batchIds)
      : new Map();

  return batchDtos.map((batch) => ({
    ...batch,
    stockLocations: formatBalanceLocationRows(locationsByBatchId.get(String(batch.id)) ?? []),
  }));
}

async function attachFindingBatchSnapshots(store, organizationId, findings) {
  if (!Array.isArray(findings) || findings.length === 0) {
    return findings;
  }
  const batchIds = uniqueIds(
    findings.map((item) => item.batchId).filter((id) => id !== null && id !== undefined && id !== ''),
  );
  if (batchIds.length === 0) {
    return findings;
  }
  const batches =
    typeof store.findBatchesByIds === 'function'
      ? await store.findBatchesByIds(organizationId, batchIds)
      : [];
  const batchNumberById = new Map(
    batches.map((batch) => [String(batch.id ?? batch._id), String(batch.batchNumber ?? '')]),
  );

  return findings.map((finding) => ({
    ...finding,
    batchNumberSnapshot:
      finding.batchId && batchNumberById.has(String(finding.batchId))
        ? batchNumberById.get(String(finding.batchId))
        : null,
  }));
}

function formatBalanceLocationRows(rows) {
  return rows.map((row) => ({
    warehouseId: String(row.warehouseId),
    quantityBase: formatQuantityMinorUnits(BigInt(String(row.quantityBaseMinorUnits ?? '0'))),
    unsellableQuantityBase: formatQuantityMinorUnits(
      BigInt(String(row.unsellableQuantityBaseMinorUnits ?? '0')),
    ),
  }));
}

async function loadTransferReferenceMaps({
  catalogService,
  locationsService,
  organizationId,
  transfers,
}) {
  const productIds = uniqueIds(transfers.map((item) => item.productId));
  const warehouseIds = uniqueIds(
    transfers.flatMap((item) => [item.sourceWarehouseId, item.destinationWarehouseId]),
  );

  const [products, warehouses] = await Promise.all([
    typeof catalogService?.findProductsByIds === 'function'
      ? catalogService.findProductsByIds(organizationId, productIds)
      : Promise.resolve([]),
    typeof locationsService?.findWarehousesByIds === 'function'
      ? locationsService.findWarehousesByIds(organizationId, warehouseIds)
      : Promise.resolve([]),
  ]);

  return {
    productMap: new Map(products.map((item) => [String(item.id), item])),
    warehouseMap: new Map(warehouses.map((item) => [String(item.id), item])),
  };
}

function toTransferListItemDto(record, refs) {
  const dto = toTransferDto(record);
  const product = refs.productMap.get(String(record.productId));
  const sourceWarehouse = refs.warehouseMap.get(String(record.sourceWarehouseId));
  const destinationWarehouse = refs.warehouseMap.get(String(record.destinationWarehouseId));

  return {
    ...dto,
    productNameSnapshot: product ? String(product.name) : null,
    productSkuSnapshot: product ? String(product.sku ?? '') : null,
    sourceWarehouseNameSnapshot: sourceWarehouse ? String(sourceWarehouse.name) : null,
    sourceWarehouseCodeSnapshot: sourceWarehouse ? String(sourceWarehouse.code ?? '') : null,
    destinationWarehouseNameSnapshot: destinationWarehouse ? String(destinationWarehouse.name) : null,
    destinationWarehouseCodeSnapshot: destinationWarehouse
      ? String(destinationWarehouse.code ?? '')
      : null,
  };
}

async function attachBalanceBatchSnapshots(store, organizationId, balanceDtos) {
  if (!Array.isArray(balanceDtos) || balanceDtos.length === 0) {
    return balanceDtos;
  }
  const batchIds = uniqueIds(
    balanceDtos
      .map((item) => item.batchId)
      .filter((id) => id !== null && id !== undefined && id !== ''),
  );
  if (batchIds.length === 0) {
    return balanceDtos;
  }
  const batches =
    typeof store.findBatchesByIds === 'function'
      ? await store.findBatchesByIds(organizationId, batchIds)
      : [];
  const batchNumberById = new Map(
    batches.map((batch) => [String(batch.id ?? batch._id), String(batch.batchNumber ?? '')]),
  );

  return balanceDtos.map((dto) => ({
    ...dto,
    batchNumberSnapshot:
      dto.batchId && batchNumberById.has(String(dto.batchId))
        ? batchNumberById.get(String(dto.batchId))
        : null,
  }));
}

module.exports = {
  attachBalanceBatchSnapshots,
  attachBatchStockLocations,
  attachFindingBatchSnapshots,
  formatBalanceLocationRows,
  loadMovementReferenceMaps,
  loadTransferReferenceMaps,
  toMovementListItemDto,
  toTransferListItemDto,
  uniqueIds,
};
