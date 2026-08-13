const { conflict, insufficientStock } = require('../../platform/errors/app-error');
const {
  computeUnitCostMinorUnits,
} = require('../../platform/primitives/money-and-time');
const { applyInboundWac, applyOutboundWac, applyOutboundWacAtValue } = require('./wac');

function mapDuplicate(storeErrorHandler, error, message) {
  return storeErrorHandler(error, message);
}

async function applyBalanceInbound(store, session, organizationId, scope, quantityBaseMinorUnits) {
  const existing = await store.findBalance(
    organizationId,
    scope.warehouseId,
    scope.productId,
    scope.batchId,
  );
  if (existing === null) {
    try {
      return await store.insertBalance(session, {
        organizationId,
        warehouseId: scope.warehouseId,
        productId: scope.productId,
        batchId: scope.batchId,
        quantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
        version: 1,
      });
    } catch (error) {
      throw mapDuplicate(
        (duplicateError) => {
          if (duplicateError && duplicateError.agrivioDuplicate === true) {
            throw conflict('Concurrent stock balance update detected');
          }
          throw duplicateError;
        },
        error,
      );
    }
  }

  const nextQty = BigInt(String(existing.quantityBaseMinorUnits)) + quantityBaseMinorUnits;
  const updated = await store.updateBalanceConditional(
    session,
    organizationId,
    existing['_id'],
    Number(existing.version),
    { quantityBaseMinorUnits: nextQty.toString() },
  );
  if (updated === null) {
    throw conflict('Concurrent stock balance update detected');
  }
  return updated;
}

function unsellableQtyOf(balance) {
  return BigInt(String(balance.unsellableQuantityBaseMinorUnits ?? '0'));
}

async function applyBalanceUnsellableInbound(
  store,
  session,
  organizationId,
  scope,
  quantityBaseMinorUnits,
) {
  const existing = await store.findBalance(
    organizationId,
    scope.warehouseId,
    scope.productId,
    scope.batchId,
  );
  if (existing === null) {
    try {
      return await store.insertBalance(session, {
        organizationId,
        warehouseId: scope.warehouseId,
        productId: scope.productId,
        batchId: scope.batchId,
        quantityBaseMinorUnits: '0',
        unsellableQuantityBaseMinorUnits: quantityBaseMinorUnits.toString(),
        version: 1,
      });
    } catch (error) {
      throw mapDuplicate(
        (duplicateError) => {
          if (duplicateError && duplicateError.agrivioDuplicate === true) {
            throw conflict('Concurrent stock balance update detected');
          }
          throw duplicateError;
        },
        error,
      );
    }
  }

  const nextUnsellable = unsellableQtyOf(existing) + quantityBaseMinorUnits;
  const updated = await store.updateBalanceConditional(
    session,
    organizationId,
    existing['_id'],
    Number(existing.version),
    { unsellableQuantityBaseMinorUnits: nextUnsellable.toString() },
  );
  if (updated === null) {
    throw conflict('Concurrent stock balance update detected');
  }
  return updated;
}

async function applyBalanceOutbound(
  store,
  session,
  organizationId,
  scope,
  quantityBaseMinorUnits,
  options,
) {
  const existing = await store.findBalance(
    organizationId,
    scope.warehouseId,
    scope.productId,
    scope.batchId,
  );
  if (existing === null) {
    if (!options.allowNegativeStockOverride) {
      throw insufficientStock();
    }
    const negativeQty = -quantityBaseMinorUnits;
    try {
      return await store.insertBalance(session, {
        organizationId,
        warehouseId: scope.warehouseId,
        productId: scope.productId,
        batchId: scope.batchId,
        quantityBaseMinorUnits: negativeQty.toString(),
        version: 1,
      });
    } catch (error) {
      if (error && error.agrivioDuplicate === true) {
        throw conflict('Concurrent stock balance update detected');
      }
      throw error;
    }
  }

  const currentQty = BigInt(String(existing.quantityBaseMinorUnits));
  if (!options.allowNegativeStockOverride && currentQty < quantityBaseMinorUnits) {
    throw insufficientStock();
  }

  const nextQty = currentQty - quantityBaseMinorUnits;
  const updated = await store.updateBalanceConditional(
    session,
    organizationId,
    existing['_id'],
    Number(existing.version),
    { quantityBaseMinorUnits: nextQty.toString() },
  );
  if (updated === null) {
    throw conflict('Concurrent stock balance update detected');
  }
  return updated;
}

async function applyCostInbound(store, session, organizationId, scope, receipt) {
  const existing = await store.findCostState(organizationId, scope.warehouseId, scope.productId);
  const prior = existing
    ? {
        quantityBaseMinorUnits: BigInt(String(existing.quantityBaseMinorUnits)),
        inventoryValueMinorUnits: BigInt(String(existing.inventoryValueMinorUnits)),
        weightedAverageCostMinorUnits: BigInt(String(existing.weightedAverageCostMinorUnits)),
      }
    : {
        quantityBaseMinorUnits: 0n,
        inventoryValueMinorUnits: 0n,
        weightedAverageCostMinorUnits: 0n,
      };

  const next = applyInboundWac(prior, receipt);

  if (existing === null) {
    try {
      return {
        costState: await store.insertCostState(session, {
          organizationId,
          warehouseId: scope.warehouseId,
          productId: scope.productId,
          quantityBaseMinorUnits: next.quantityBaseMinorUnits.toString(),
          inventoryValueMinorUnits: next.inventoryValueMinorUnits.toString(),
          weightedAverageCostMinorUnits: next.weightedAverageCostMinorUnits.toString(),
          lastWeightedAverageCostMinorUnits: next.lastWeightedAverageCostMinorUnits.toString(),
          version: 1,
        }),
        receiptUnitCostMinorUnits: next.receiptUnitCostMinorUnits,
      };
    } catch (error) {
      if (error && error.agrivioDuplicate === true) {
        throw conflict('Concurrent inventory cost update detected');
      }
      throw error;
    }
  }

  const updated = await store.updateCostStateConditional(
    session,
    organizationId,
    existing['_id'],
    Number(existing.version),
    {
      quantityBaseMinorUnits: next.quantityBaseMinorUnits.toString(),
      inventoryValueMinorUnits: next.inventoryValueMinorUnits.toString(),
      weightedAverageCostMinorUnits: next.weightedAverageCostMinorUnits.toString(),
      lastWeightedAverageCostMinorUnits: next.lastWeightedAverageCostMinorUnits.toString(),
    },
  );
  if (updated === null) {
    throw conflict('Concurrent inventory cost update detected');
  }
  return {
    costState: updated,
    receiptUnitCostMinorUnits: next.receiptUnitCostMinorUnits,
  };
}

async function applyCostOutbound(store, session, organizationId, scope, outboundQuantityBaseMinorUnits) {
  const existing = await store.findCostState(organizationId, scope.warehouseId, scope.productId);
  const prior = existing
    ? {
        quantityBaseMinorUnits: BigInt(String(existing.quantityBaseMinorUnits)),
        inventoryValueMinorUnits: BigInt(String(existing.inventoryValueMinorUnits)),
        weightedAverageCostMinorUnits: BigInt(String(existing.weightedAverageCostMinorUnits)),
      }
    : {
        quantityBaseMinorUnits: 0n,
        inventoryValueMinorUnits: 0n,
        weightedAverageCostMinorUnits: 0n,
      };

  const next = applyOutboundWac(prior, outboundQuantityBaseMinorUnits);

  if (existing === null) {
    return {
      costState: await store.insertCostState(session, {
        organizationId,
        warehouseId: scope.warehouseId,
        productId: scope.productId,
        quantityBaseMinorUnits: next.quantityBaseMinorUnits.toString(),
        inventoryValueMinorUnits: next.inventoryValueMinorUnits.toString(),
        weightedAverageCostMinorUnits: next.weightedAverageCostMinorUnits.toString(),
        lastWeightedAverageCostMinorUnits: next.lastWeightedAverageCostMinorUnits.toString(),
        version: 1,
      }),
      outboundValueMinorUnits: next.outboundValueMinorUnits,
      unitCostMinorUnits: next.lastWeightedAverageCostMinorUnits,
    };
  }

  const updated = await store.updateCostStateConditional(
    session,
    organizationId,
    existing['_id'],
    Number(existing.version),
    {
      quantityBaseMinorUnits: next.quantityBaseMinorUnits.toString(),
      inventoryValueMinorUnits: next.inventoryValueMinorUnits.toString(),
      weightedAverageCostMinorUnits: next.weightedAverageCostMinorUnits.toString(),
      lastWeightedAverageCostMinorUnits: next.lastWeightedAverageCostMinorUnits.toString(),
    },
  );
  if (updated === null) {
    throw conflict('Concurrent inventory cost update detected');
  }
  return {
    costState: updated,
    outboundValueMinorUnits: next.outboundValueMinorUnits,
    unitCostMinorUnits: next.lastWeightedAverageCostMinorUnits,
  };
}

async function applyCostOutboundAtValue(
  store,
  session,
  organizationId,
  scope,
  outboundQuantityBaseMinorUnits,
  outboundValueMinorUnits,
) {
  const existing = await store.findCostState(organizationId, scope.warehouseId, scope.productId);
  const prior = existing
    ? {
        quantityBaseMinorUnits: BigInt(String(existing.quantityBaseMinorUnits)),
        inventoryValueMinorUnits: BigInt(String(existing.inventoryValueMinorUnits)),
        weightedAverageCostMinorUnits: BigInt(String(existing.weightedAverageCostMinorUnits)),
      }
    : {
        quantityBaseMinorUnits: 0n,
        inventoryValueMinorUnits: 0n,
        weightedAverageCostMinorUnits: 0n,
      };

  const next = applyOutboundWacAtValue(
    prior,
    outboundQuantityBaseMinorUnits,
    outboundValueMinorUnits,
  );

  if (existing === null) {
    return {
      costState: await store.insertCostState(session, {
        organizationId,
        warehouseId: scope.warehouseId,
        productId: scope.productId,
        quantityBaseMinorUnits: next.quantityBaseMinorUnits.toString(),
        inventoryValueMinorUnits: next.inventoryValueMinorUnits.toString(),
        weightedAverageCostMinorUnits: next.weightedAverageCostMinorUnits.toString(),
        lastWeightedAverageCostMinorUnits: next.lastWeightedAverageCostMinorUnits.toString(),
        version: 1,
      }),
      outboundValueMinorUnits: next.outboundValueMinorUnits,
      unitCostMinorUnits:
        outboundQuantityBaseMinorUnits > 0n
          ? computeUnitCostMinorUnits(next.outboundValueMinorUnits, outboundQuantityBaseMinorUnits)
          : 0n,
    };
  }

  const updated = await store.updateCostStateConditional(
    session,
    organizationId,
    existing['_id'],
    Number(existing.version),
    {
      quantityBaseMinorUnits: next.quantityBaseMinorUnits.toString(),
      inventoryValueMinorUnits: next.inventoryValueMinorUnits.toString(),
      weightedAverageCostMinorUnits: next.weightedAverageCostMinorUnits.toString(),
      lastWeightedAverageCostMinorUnits: next.lastWeightedAverageCostMinorUnits.toString(),
    },
  );
  if (updated === null) {
    throw conflict('Concurrent inventory cost update detected');
  }
  return {
    costState: updated,
    outboundValueMinorUnits: next.outboundValueMinorUnits,
    unitCostMinorUnits: computeUnitCostMinorUnits(
      next.outboundValueMinorUnits,
      outboundQuantityBaseMinorUnits,
    ),
  };
}

module.exports = {
  applyBalanceInbound,
  applyBalanceUnsellableInbound,
  applyBalanceOutbound,
  applyCostInbound,
  applyCostOutbound,
  applyCostOutboundAtValue,
};
