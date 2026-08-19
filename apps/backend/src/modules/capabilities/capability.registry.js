const CONTROL_TYPES = Object.freeze({
  Module: 'MODULE',
  Feature: 'FEATURE',
  View: 'VIEW',
  Field: 'FIELD',
  Widget: 'WIDGET',
  Action: 'ACTION',
});

const PRODUCTS_MODULE_KEY = 'inventory.products';

const definitions = [
  {
    key: 'inventory',
    parentKey: null,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Module,
    label: 'Inventory',
    description: 'Inventory domain safety boundary.',
    defaultPolicy: { enabled: true },
    configurable: { enabled: false },
    reason: 'Inventory-wide configuration is reserved for a later module phase.',
  },
  {
    key: PRODUCTS_MODULE_KEY,
    parentKey: 'inventory',
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Feature,
    label: 'Products module',
    description: 'Product catalog screens and product API operations.',
    defaultPolicy: { enabled: true },
    configurable: { enabled: true },
    requiredPermissions: { enabled: 'catalog.view' },
  },
  {
    key: 'inventory.products.views.table',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.View,
    label: 'Table view',
    description: 'High-density desktop and tablet product table.',
    defaultPolicy: { enabled: true },
    configurable: { enabled: false },
    requiredPermissions: { enabled: 'catalog.view' },
    reason: 'The table remains the safe desktop fallback when desktop cards are disabled.',
  },
  {
    key: 'inventory.products.views.desktopCards',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.View,
    label: 'Desktop card view',
    description: 'Optional user-selectable card layout on desktop and tablet.',
    defaultPolicy: { enabled: true },
    configurable: { enabled: true },
    requiredPermissions: { enabled: 'catalog.view' },
    dependencies: ['inventory.products.views.table'],
    reason: 'Responsive phone cards are an internal required renderer and are not controlled here.',
  },
  {
    key: 'inventory.products.fields.productName',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Product name',
    description: 'Required product identity.',
    defaultPolicy: { visible: true, editable: true },
    configurable: { visible: false, editable: true },
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
    reason: 'Product name visibility is required for a usable catalog and valid creation flow.',
  },
  {
    key: 'inventory.products.fields.sku',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'SKU / Barcode',
    description: 'Optional product SKU or barcode.',
    defaultPolicy: { visible: true, editable: true },
    configurable: { visible: true, editable: true },
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
  },
  {
    key: 'inventory.products.fields.category',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Category',
    description: 'Required product classification.',
    defaultPolicy: { visible: true, editable: true },
    configurable: { visible: false, editable: true },
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
    reason: 'Category visibility is required for validation and mandatory tracking rules.',
  },
  {
    key: 'inventory.products.fields.trackingMode',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Tracking mode',
    description: 'Batch and expiry tracking behavior.',
    defaultPolicy: { visible: true, editable: true },
    configurable: { visible: false, editable: true },
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
    reason: 'Tracking remains visible because frozen product-class rules require a valid value.',
  },
  {
    key: 'inventory.products.fields.baseUnit',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Base unit',
    description: 'Inventory storage unit.',
    defaultPolicy: { visible: true, editable: true },
    configurable: { visible: false, editable: false },
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
    reason:
      'Base-unit policy changes are unsafe while stock and transaction history may reference it.',
  },
  {
    key: 'inventory.products.fields.measurementDimension',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Measurement dimension',
    description: 'Mass or volume measurement family.',
    defaultPolicy: { visible: true, editable: true },
    configurable: { visible: false, editable: false },
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
    reason: 'Measurement dimension remains safety-controlled with the base unit.',
  },
  {
    key: 'inventory.products.fields.sellingPrice',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Selling price',
    description: 'Product sales price tiers and list presentation.',
    defaultPolicy: { visible: true, editable: true },
    configurable: { visible: true, editable: true },
    requiredPermissions: { visible: 'pricing.view', editable: 'pricing.manage' },
  },
  {
    key: 'inventory.products.fields.status',
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Lifecycle status',
    description: 'Active or inactive product state.',
    defaultPolicy: { visible: true, editable: false },
    configurable: { visible: false, editable: false },
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
    reason: 'Lifecycle changes are controlled by deactivate and reactivate actions.',
  },
  ...[
    ['totalProducts', 'Total products'],
    ['activeProducts', 'Active products'],
    ['lowStock', 'Low / Out of Stock'],
    ['trackedItems', 'Tracked items'],
  ].map(([id, label]) => ({
    key: `inventory.products.widgets.${id}`,
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Widget,
    label,
    description: `${label} product summary widget.`,
    defaultPolicy: { visible: true },
    configurable: { visible: true },
    requiredPermissions: { visible: 'catalog.view' },
  })),
  ...[
    ['create', 'Create product', 'catalog.manage'],
    ['inspect', 'Inspect product', 'catalog.view'],
    ['edit', 'Edit product', 'catalog.manage'],
    ['managePricing', 'Manage pricing', 'pricing.manage'],
    ['deactivate', 'Deactivate', 'catalog.manage'],
    ['reactivate', 'Reactivate', 'catalog.manage'],
    ['delete', 'Delete permanently', 'catalog.manage'],
  ].map(([id, label, permission]) => ({
    key: `inventory.products.actions.${id}`,
    parentKey: PRODUCTS_MODULE_KEY,
    moduleKey: PRODUCTS_MODULE_KEY,
    type: CONTROL_TYPES.Action,
    label,
    description: `${label} action. Existing validation and lifecycle rules still apply.`,
    defaultPolicy: { allowed: true },
    configurable: { allowed: true },
    requiredPermissions: { allowed: permission },
    ...(id === 'delete'
      ? { reason: 'The policy can block deletion but cannot bypass record-in-use protection.' }
      : {}),
  })),
];

const registry = new Map(
  definitions.map((definition) => [definition.key, Object.freeze(definition)]),
);

function cloneDefinition(definition) {
  return {
    ...definition,
    defaultPolicy: { ...definition.defaultPolicy },
    configurable: { ...definition.configurable },
    ...(definition.requiredPermissions === undefined
      ? {}
      : { requiredPermissions: { ...definition.requiredPermissions } }),
    ...(definition.dependencies === undefined
      ? {}
      : { dependencies: [...definition.dependencies] }),
  };
}

function listCapabilityControls() {
  return definitions.map(cloneDefinition);
}

function getCapabilityControl(key) {
  const definition = registry.get(key);
  return definition === undefined ? null : cloneDefinition(definition);
}

module.exports = {
  CONTROL_TYPES,
  PRODUCTS_MODULE_KEY,
  listCapabilityControls,
  getCapabilityControl,
};
