const { formatMoneyMinorUnits } = require('../../platform/primitives/money-and-time');
const { formatQuantityMinorUnits } = require('../../platform/primitives/money-and-time');

function pickRetailSellingPrice(prices) {
  const active = prices.filter((item) => String(item.status) === 'active');
  const retail = active.find((item) => String(item.priceTier) === 'retail');
  const chosen = retail ?? active[0];
  if (!chosen) {
    return null;
  }
  return {
    amount: formatMoneyMinorUnits(BigInt(String(chosen.amountMinorUnits ?? '0'))),
    currency: String(chosen.currency ?? 'PKR'),
  };
}

function buildProductListSummary(priceRows, quantityMinorUnits) {
  const sellingPrice = pickRetailSellingPrice(priceRows);
  const qtyMinor = BigInt(String(quantityMinorUnits ?? '0'));
  const availableQuantityBase = formatQuantityMinorUnits(qtyMinor);
  return {
    sellingPrice,
    availableQuantityBase,
  };
}

async function attachProductListSummaries(store, inventoryReader, organizationId, items) {
  if (!Array.isArray(items) || items.length === 0) {
    return items;
  }
  const productIds = items.map((item) => String(item.id));
  const [priceRows, quantityByProductId] = await Promise.all([
    store.listActivePricesByProductIds(organizationId, productIds),
    inventoryReader.sumAvailableQuantityByProductIds(organizationId, productIds),
  ]);

  const pricesByProductId = new Map();
  for (const row of priceRows) {
    const productId = String(row.productId);
    const list = pricesByProductId.get(productId) ?? [];
    list.push(row);
    pricesByProductId.set(productId, list);
  }

  return items.map((item) => ({
    ...item,
    listSummary: buildProductListSummary(
      pricesByProductId.get(String(item.id)) ?? [],
      quantityByProductId.get(String(item.id)) ?? '0',
    ),
  }));
}

module.exports = {
  attachProductListSummaries,
  buildProductListSummary,
  pickRetailSellingPrice,
};
