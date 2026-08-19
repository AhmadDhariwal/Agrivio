const CONTROL_TYPES = Object.freeze({
  Module: 'MODULE',
  Feature: 'FEATURE',
  View: 'VIEW',
  Field: 'FIELD',
  Widget: 'WIDGET',
  Action: 'ACTION',
});

const RISK_LEVELS = Object.freeze({
  Normal: 'NORMAL',
  Recommended: 'RECOMMENDED',
  Critical: 'CRITICAL',
});

const PRODUCTS_MODULE_KEY = 'inventory.products';
const CATEGORIES_MODULE_KEY = 'inventory.categories';

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
    risk: RISK_LEVELS.Critical,
    platformEnforced: true,
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
    risk: RISK_LEVELS.Critical,
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
    risk: RISK_LEVELS.Normal,
    platformEnforced: true,
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
    risk: RISK_LEVELS.Normal,
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
    risk: RISK_LEVELS.Recommended,
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
    risk: RISK_LEVELS.Normal,
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
    risk: RISK_LEVELS.Recommended,
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
    risk: RISK_LEVELS.Recommended,
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
    risk: RISK_LEVELS.Critical,
    platformEnforced: true,
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
    risk: RISK_LEVELS.Critical,
    platformEnforced: true,
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
    risk: RISK_LEVELS.Recommended,
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
    risk: RISK_LEVELS.Critical,
    platformEnforced: true,
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
    risk: RISK_LEVELS.Normal,
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
    risk:
      id === 'inspect'
        ? RISK_LEVELS.Normal
        : id === 'delete'
          ? RISK_LEVELS.Critical
          : RISK_LEVELS.Recommended,
    requiredPermissions: { allowed: permission },
    ...(id === 'delete'
      ? { reason: 'The policy can block deletion but cannot bypass record-in-use protection.' }
      : {}),
  })),
  {
    key: CATEGORIES_MODULE_KEY,
    parentKey: 'inventory',
    moduleKey: CATEGORIES_MODULE_KEY,
    type: CONTROL_TYPES.Feature,
    label: 'Categories module',
    description: 'Category screens and Category API operations for this organization.',
    defaultPolicy: { enabled: true },
    configurable: { enabled: true },
    risk: RISK_LEVELS.Critical,
    requiredPermissions: { enabled: 'catalog.view' },
    reason: 'Disabling access does not delete existing category records.',
  },
  {
    key: 'inventory.categories.views.desktopCards',
    parentKey: CATEGORIES_MODULE_KEY,
    moduleKey: CATEGORIES_MODULE_KEY,
    type: CONTROL_TYPES.View,
    label: 'Desktop card view',
    description: 'Optional user-selectable card layout on desktop and tablet.',
    defaultPolicy: { enabled: true },
    configurable: { enabled: true },
    risk: RISK_LEVELS.Normal,
    requiredPermissions: { enabled: 'catalog.view' },
    reason: 'Responsive phone cards remain platform enforced so Categories stays usable on mobile.',
  },
  {
    key: 'inventory.categories.fields.name',
    parentKey: CATEGORIES_MODULE_KEY,
    moduleKey: CATEGORIES_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Category name',
    description: 'Category identity shown in Category presentations.',
    defaultPolicy: { visible: true, editable: true },
    configurable: { visible: true, editable: true },
    risk: RISK_LEVELS.Recommended,
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
  },
  {
    key: 'inventory.categories.fields.productClass',
    parentKey: CATEGORIES_MODULE_KEY,
    moduleKey: CATEGORIES_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Product class',
    description: 'Agricultural classification that determines mandatory tracking behavior.',
    defaultPolicy: { visible: true, editable: true },
    configurable: { visible: true, editable: true },
    risk: RISK_LEVELS.Critical,
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
    reason: 'The derived tracking rule remains platform enforced and cannot be overridden.',
  },
  {
    key: 'inventory.categories.fields.status',
    parentKey: CATEGORIES_MODULE_KEY,
    moduleKey: CATEGORIES_MODULE_KEY,
    type: CONTROL_TYPES.Field,
    label: 'Lifecycle status',
    description: 'Active or inactive Category state.',
    defaultPolicy: { visible: true, editable: false },
    configurable: { visible: true, editable: false },
    risk: RISK_LEVELS.Critical,
    platformEnforced: true,
    requiredPermissions: { visible: 'catalog.view', editable: 'catalog.manage' },
    reason: 'Status changes remain controlled by deactivate and reactivate actions.',
  },
  {
    key: 'inventory.categories.features.trackingRequirementDisplay',
    parentKey: CATEGORIES_MODULE_KEY,
    moduleKey: CATEGORIES_MODULE_KEY,
    type: CONTROL_TYPES.Feature,
    label: 'Tracking requirement display',
    description: 'Informational section derived from Product class.',
    defaultPolicy: { enabled: true },
    configurable: { enabled: true },
    risk: RISK_LEVELS.Normal,
    requiredPermissions: { enabled: 'catalog.view' },
    reason: 'This controls presentation only; mandatory tracking rules remain platform enforced.',
  },
  {
    key: 'inventory.categories.widgets.totalCategories',
    parentKey: CATEGORIES_MODULE_KEY,
    moduleKey: CATEGORIES_MODULE_KEY,
    type: CONTROL_TYPES.Widget,
    label: 'Total Categories',
    description: 'Authoritative total Category KPI.',
    defaultPolicy: { visible: true },
    configurable: { visible: true },
    risk: RISK_LEVELS.Normal,
    requiredPermissions: { visible: 'catalog.view' },
  },
  ...[
    ['create', 'Create Category', 'catalog.manage'],
    ['inspect', 'Inspect Category', 'catalog.view'],
    ['edit', 'Edit Category', 'catalog.manage'],
    ['deactivate', 'Deactivate', 'catalog.manage'],
    ['reactivate', 'Reactivate', 'catalog.manage'],
    ['delete', 'Delete permanently', 'catalog.manage'],
  ].map(([id, label, permission]) => ({
    key: `inventory.categories.actions.${id}`,
    parentKey: CATEGORIES_MODULE_KEY,
    moduleKey: CATEGORIES_MODULE_KEY,
    type: CONTROL_TYPES.Action,
    label,
    description: `${label} action. Existing validation and lifecycle rules still apply.`,
    defaultPolicy: { allowed: true },
    configurable: { allowed: true },
    risk:
      id === 'inspect'
        ? RISK_LEVELS.Normal
        : id === 'delete'
          ? RISK_LEVELS.Critical
          : RISK_LEVELS.Recommended,
    requiredPermissions: { allowed: permission },
    ...(id === 'edit' ? { dependencies: ['inventory.categories.actions.inspect'] } : {}),
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
  RISK_LEVELS,
  PRODUCTS_MODULE_KEY,
  CATEGORIES_MODULE_KEY,
  listCapabilityControls,
  getCapabilityControl,
};
