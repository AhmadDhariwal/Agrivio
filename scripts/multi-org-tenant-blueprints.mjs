/**
 * Agrivio Multi-Organization Blueprints with Valid Product Classes & Units
 */

// Generate random suffix to avoid colliding with any previous test runs
const RUN_ID = Math.floor(Math.random() * 900000 + 100000).toString();

const BLUEPRINT_ORG_A = {
  code: `ORG-A-${RUN_ID}`,
  prefix: `ORG-A-${RUN_ID}`,
  name: `AgroChem Retail Express (${RUN_ID})`,
  owner: {
    email: `org-a.owner.${RUN_ID}@agrivio.test`,
    name: 'Chaudhry Tariq (AgroChem Owner)',
  },
  employees: [
    { email: `org-a.mgr.${RUN_ID}@agrivio.test`, name: 'Rashid Manager (Org A)', role: 'Manager' },
    { email: `org-a.csh.${RUN_ID}@agrivio.test`, name: 'Bilal Cashier (Org A)', role: 'Cashier' },
    { email: `org-a.stk.${RUN_ID}@agrivio.test`, name: 'Akhtar StoreKeeper (Org A)', role: 'StoreKeeper' },
  ],
  branches: [
    { key: 'br1', name: `ORG-A Multan Retail Main (${RUN_ID})`, code: `A-MLT-${RUN_ID.slice(0, 3)}` },
    { key: 'br2', name: `ORG-A Lodhran Sub-Shop (${RUN_ID})`, code: `A-LOD-${RUN_ID.slice(0, 3)}` },
  ],
  warehouses: [
    { key: 'wh1', name: `ORG-A Multan Chem Depot (${RUN_ID})`, code: `A-WH1-${RUN_ID.slice(0, 3)}`, branchKey: 'br1' },
    { key: 'wh2', name: `ORG-A Lodhran Transit Store (${RUN_ID})`, code: `A-WH2-${RUN_ID.slice(0, 3)}`, branchKey: 'br2' },
  ],
  accounts: [
    { key: 'cash', name: `ORG-A Cash Drawer Till (${RUN_ID})`, type: 'cash', openingBalance: '150000.00' },
    { key: 'bank', name: `ORG-A HBL Operations (${RUN_ID})`, type: 'bank', bankName: 'Habib Bank Ltd', mask: 'HBL-990182', openingBalance: '1200000.00' },
  ],
  categories: [
    { key: 'cat_pest', name: `ORG-A Insecticides & Pesticides (${RUN_ID})`, productClass: 'pesticide' },
    { key: 'cat_tools', name: `ORG-A Farm Equipment & Sprayers (${RUN_ID})`, productClass: 'general' },
  ],
  products: [
    {
      key: 'p1',
      name: `ORG-A Chlorpyrifos 40EC 1L (${RUN_ID})`,
      sku: `ORG-A-SKU-CHL40-${RUN_ID}`,
      categoryKey: 'cat_pest',
      trackingMode: 'batch_expiry',
      baseUnitCode: 'LITRE',
      measurementDimension: 'volume',
      prices: { retail: '1800.00', wholesale: '1600.00' },
    },
    {
      key: 'p2',
      name: `ORG-A Emamectin 1.9EC 1L (${RUN_ID})`,
      sku: `ORG-A-SKU-EMA19-${RUN_ID}`,
      categoryKey: 'cat_pest',
      trackingMode: 'batch_expiry',
      baseUnitCode: 'LITRE',
      measurementDimension: 'volume',
      prices: { retail: '2900.00', wholesale: '2600.00' },
    },
    {
      key: 'p3',
      name: `ORG-A Glyphosate 48SL 1L (${RUN_ID})`,
      sku: `ORG-A-SKU-GLY48-${RUN_ID}`,
      categoryKey: 'cat_pest',
      trackingMode: 'batch',
      baseUnitCode: 'LITRE',
      measurementDimension: 'volume',
      prices: { retail: '1450.00', wholesale: '1300.00' },
    },
    {
      key: 'p4',
      name: `ORG-A Manual Sprayer 16L (${RUN_ID})`,
      sku: `ORG-A-SKU-MSP16-${RUN_ID}`,
      categoryKey: 'cat_tools',
      trackingMode: 'none',
      baseUnitCode: 'COUNT',
      measurementDimension: 'mass',
      prices: { retail: '3500.00', wholesale: '3100.00' },
    },
  ],
  openingStock: [
    { productKey: 'p1', warehouseKey: 'wh1', quantity: '50.0000', batchNumber: `LOT-A-CHL-${RUN_ID}`, expiryOffset: 365, value: '60000.00' },
    { productKey: 'p2', warehouseKey: 'wh1', quantity: '40.0000', batchNumber: `LOT-A-EMA-${RUN_ID}`, expiryOffset: 400, value: '88000.00' },
    { productKey: 'p3', warehouseKey: 'wh1', quantity: '60.0000', batchNumber: `LOT-A-GLY-${RUN_ID}`, value: '60000.00' },
    { productKey: 'p4', warehouseKey: 'wh2', quantity: '20.0000', value: '50000.00' },
  ],
  customers: [
    { key: 'c1', name: `ORG-A-CUSTOMER Haji Akram Cotton (${RUN_ID})`, type: 'farmer', phone: '03001110001', creditEnabled: true, creditLimit: '250000.00', openingReceivable: '40000.00' },
    { key: 'c2', name: `ORG-A-CUSTOMER Tariq Orchardist (${RUN_ID})`, type: 'farmer', phone: '03001110002', creditEnabled: true, creditLimit: '150000.00' },
    { key: 'c3', name: `ORG-A-CUSTOMER Walk-in Retail Buyer (${RUN_ID})`, type: 'farmer', phone: '03001110003', creditEnabled: false },
  ],
  suppliers: [
    { key: 's1', name: `ORG-A-SUPPLIER National Chemical Ind (${RUN_ID})`, phone: '03009990001', email: `natchem.${RUN_ID}@example.com`, address: 'Industrial Area Multan', contactPerson: 'Mr. Aslam', openingPayable: '50000.00' },
    { key: 's2', name: `ORG-A-SUPPLIER Pak Agro Formulations (${RUN_ID})`, phone: '03009990002', email: `pakagro.${RUN_ID}@example.com`, address: 'Bosan Road Multan', contactPerson: 'Mr. Javaid' },
  ],
  purchases: [
    {
      key: 'po1',
      supplierKey: 's1',
      warehouseKey: 'wh1',
      productKey: 'p1',
      quantity: '30.0000',
      unitCost: '1200.00',
      batchNumber: `LOT-A-PO-CHL-${RUN_ID}`,
      expiryOffset: 450,
      invoiceRef: `A-INV-PO-01-${RUN_ID}`,
      landedFreight: '1500.00',
      payAmount: '20000.00',
      accountKey: 'bank',
    },
  ],
  sales: [
    // 1. Cash Sale
    { key: 'sa_cash', branchKey: 'br1', warehouseKey: 'wh1', customerKey: 'c3', productKey: 'p1', quantity: '5.0000', unitPrice: '1800.00', payAmount: '9000.00', accountKey: 'cash' },
    // 2. 100% Credit Sale
    { key: 'sa_credit', branchKey: 'br1', warehouseKey: 'wh1', customerKey: 'c1', productKey: 'p2', quantity: '10.0000', unitPrice: '2900.00' },
    // 3. Partial Sale
    { key: 'sa_partial', branchKey: 'br2', warehouseKey: 'wh2', customerKey: 'c2', productKey: 'p4', quantity: '4.0000', unitPrice: '3500.00', payAmount: '6000.00', accountKey: 'cash' },
  ],
  customerPayment: { customerKey: 'c1', accountKey: 'cash', amount: '15000.00', notes: 'Org A Farmer installment' },
  supplierPayment: { supplierKey: 's1', accountKey: 'bank', amount: '15000.00', notes: 'Org A Supplier partial check' },
  expense: { categoryName: `ORG-A Shop Lease (${RUN_ID})`, accountKey: 'bank', amount: '25000.00', purpose: 'Org A Branch Monthly Rent', reference: `A-RENT-${RUN_ID}` },
  stockAdjustment: { warehouseKey: 'wh1', productKey: 'p1', type: 'damage', direction: 'outbound', quantity: '1.0000', reason: 'Forklift leak damage in warehouse' },
  warehouseTransfer: { productKey: 'p3', sourceWarehouseKey: 'wh1', destWarehouseKey: 'wh2', quantity: '5.0000', reason: 'Branch stock replenishment' },
  salesReturn: { saleKey: 'sa_cash', quantity: '1.0000', accountKey: 'cash', reason: 'Defective bottle cap returned' },
  purchaseReturn: { purchaseKey: 'po1', quantity: '2.0000', reason: 'Seal punctured in shipment' },
};

const BLUEPRINT_ORG_B = {
  code: `ORG-B-${RUN_ID}`,
  prefix: `ORG-B-${RUN_ID}`,
  name: `GreenSprout Seed & Fertilizer (${RUN_ID})`,
  owner: {
    email: `org-b.owner.${RUN_ID}@agrivio.test`,
    name: 'Mian Bashir (Seed & Fert Owner)',
  },
  employees: [
    { email: `org-b.mgr.${RUN_ID}@agrivio.test`, name: 'Nawaz Manager (Org B)', role: 'Manager' },
    { email: `org-b.csh.${RUN_ID}@agrivio.test`, name: 'Irfan Cashier (Org B)', role: 'Cashier' },
    { email: `org-b.stk.${RUN_ID}@agrivio.test`, name: 'Qasim StoreKeeper (Org B)', role: 'StoreKeeper' },
  ],
  branches: [
    { key: 'br1', name: `ORG-B Faisalabad Hub (${RUN_ID})`, code: `B-FSD-${RUN_ID.slice(0, 3)}` },
    { key: 'br2', name: `ORG-B Jhang Distribution (${RUN_ID})`, code: `B-JHG-${RUN_ID.slice(0, 3)}` },
  ],
  warehouses: [
    { key: 'wh1', name: `ORG-B Seed Silo Central (${RUN_ID})`, code: `B-WH1-${RUN_ID.slice(0, 3)}`, branchKey: 'br1' },
    { key: 'wh2', name: `ORG-B Fertilizer Depot (${RUN_ID})`, code: `B-WH2-${RUN_ID.slice(0, 3)}`, branchKey: 'br2' },
  ],
  accounts: [
    { key: 'cash', name: `ORG-B Main Cash Counter (${RUN_ID})`, type: 'cash', openingBalance: '300000.00' },
    { key: 'bank', name: `ORG-B Meezan Islamic (${RUN_ID})`, type: 'bank', bankName: 'Meezan Bank Ltd', mask: 'MEEZAN-551029', openingBalance: '2500000.00' },
  ],
  categories: [
    { key: 'cat_seed', name: `ORG-B Certified Crop Seeds (${RUN_ID})`, productClass: 'seed' },
    { key: 'cat_fert', name: `ORG-B Granular Fertilizers (${RUN_ID})`, productClass: 'fertilizer' },
  ],
  products: [
    {
      key: 'p1',
      name: `ORG-B Wheat Seed Akbar-19 50KG (${RUN_ID})`,
      sku: `ORG-B-SKU-WHT19-${RUN_ID}`,
      categoryKey: 'cat_seed',
      trackingMode: 'batch_expiry',
      baseUnitCode: 'BAG',
      measurementDimension: 'mass',
      prices: { retail: '7500.00', wholesale: '6800.00' },
    },
    {
      key: 'p2',
      name: `ORG-B Corn Seed Pioneer 30Y87 20KG (${RUN_ID})`,
      sku: `ORG-B-SKU-CRN30-${RUN_ID}`,
      categoryKey: 'cat_seed',
      trackingMode: 'batch_expiry',
      baseUnitCode: 'BAG',
      measurementDimension: 'mass',
      prices: { retail: '21000.00', wholesale: '19500.00' },
    },
    {
      key: 'p3',
      name: `ORG-B Urea Sona Granular 50KG (${RUN_ID})`,
      sku: `ORG-B-SKU-UREA50-${RUN_ID}`,
      categoryKey: 'cat_fert',
      trackingMode: 'batch',
      baseUnitCode: 'BAG',
      measurementDimension: 'mass',
      prices: { retail: '4600.00', wholesale: '4300.00' },
    },
    {
      key: 'p4',
      name: `ORG-B DAP Fertilizer Engro 50KG (${RUN_ID})`,
      sku: `ORG-B-SKU-DAP50-${RUN_ID}`,
      categoryKey: 'cat_fert',
      trackingMode: 'batch',
      baseUnitCode: 'BAG',
      measurementDimension: 'mass',
      prices: { retail: '12500.00', wholesale: '11800.00' },
    },
  ],
  openingStock: [
    { productKey: 'p1', warehouseKey: 'wh1', quantity: '80.0000', batchNumber: `LOT-B-WHT-${RUN_ID}`, expiryOffset: 270, value: '480000.00' },
    { productKey: 'p2', warehouseKey: 'wh1', quantity: '30.0000', batchNumber: `LOT-B-CRN-${RUN_ID}`, expiryOffset: 320, value: '510000.00' },
    { productKey: 'p3', warehouseKey: 'wh2', quantity: '100.0000', batchNumber: `LOT-B-URE-${RUN_ID}`, value: '390000.00' },
    { productKey: 'p4', warehouseKey: 'wh2', quantity: '50.0000', batchNumber: `LOT-B-DAP-${RUN_ID}`, value: '550000.00' },
  ],
  customers: [
    { key: 'c1', name: `ORG-B-CUSTOMER Mian Asif Grain Farm (${RUN_ID})`, type: 'farmer', phone: '03002220001', creditEnabled: true, creditLimit: '500000.00', openingReceivable: '75000.00' },
    { key: 'c2', name: `ORG-B-CUSTOMER Liaquat Maize Growers (${RUN_ID})`, type: 'business', priceTier: 'dealer', phone: '03002220002', creditEnabled: true, creditLimit: '300000.00' },
    { key: 'c3', name: `ORG-B-CUSTOMER Counter Walk-in Farmer (${RUN_ID})`, type: 'farmer', phone: '03002220003', creditEnabled: false },
  ],
  suppliers: [
    { key: 's1', name: `ORG-B-SUPPLIER Pioneer Seeds Pakistan (${RUN_ID})`, phone: '03008880001', email: `pioneer.${RUN_ID}@example.com`, address: 'Sahiwal Road', contactPerson: 'Mr. Shahzad', openingPayable: '120000.00' },
    { key: 's2', name: `ORG-B-SUPPLIER Engro Fertilizers (${RUN_ID})`, phone: '03008880002', email: `engro.${RUN_ID}@example.com`, address: 'Harbour Front Karachi', contactPerson: 'Mr. Faisal' },
  ],
  purchases: [
    {
      key: 'po1',
      supplierKey: 's2',
      warehouseKey: 'wh2',
      productKey: 'p3',
      quantity: '40.0000',
      unitCost: '3900.00',
      batchNumber: `LOT-B-PO-URE-${RUN_ID}`,
      invoiceRef: `B-ENG-PO-01-${RUN_ID}`,
      landedFreight: '2000.00',
      payAmount: '100000.00',
      accountKey: 'bank',
    },
  ],
  sales: [
    // 1. Cash Sale
    { key: 'sa_cash', branchKey: 'br1', warehouseKey: 'wh1', customerKey: 'c3', productKey: 'p1', quantity: '8.0000', unitPrice: '7500.00', payAmount: '60000.00', accountKey: 'cash' },
    // 2. 100% Credit Sale
    { key: 'sa_credit', branchKey: 'br1', warehouseKey: 'wh1', customerKey: 'c1', productKey: 'p2', quantity: '4.0000', unitPrice: '21000.00' },
    // 3. Partial Sale
    { key: 'sa_partial', branchKey: 'br2', warehouseKey: 'wh2', customerKey: 'c2', productKey: 'p3', quantity: '10.0000', unitPrice: '4600.00', payAmount: '20000.00', accountKey: 'cash' },
  ],
  customerPayment: { customerKey: 'c1', accountKey: 'bank', amount: '30000.00', notes: 'Org B Grain farm bank transfer' },
  supplierPayment: { supplierKey: 's1', accountKey: 'bank', amount: '50000.00', notes: 'Org B Seed account payment' },
  expense: { categoryName: `ORG-B Silo Power (${RUN_ID})`, accountKey: 'cash', amount: '38000.00', purpose: 'Org B FESCO Commercial Electricity', reference: `B-UTIL-${RUN_ID}` },
  stockAdjustment: { warehouseKey: 'wh2', productKey: 'p3', type: 'correction', direction: 'inbound', quantity: '2.0000', inventoryValue: '7800.00', reason: 'Surplus bag identified in physical stocktake' },
  warehouseTransfer: { productKey: 'p3', sourceWarehouseKey: 'wh2', destWarehouseKey: 'wh1', quantity: '10.0000', reason: 'Grain center urgent dispatch' },
  salesReturn: { saleKey: 'sa_cash', quantity: '1.0000', accountKey: 'cash', reason: 'Wrong wheat variety selected by farmer' },
  purchaseReturn: { purchaseKey: 'po1', quantity: '2.0000', reason: 'Bag torn in supplier delivery truck' },
};

const BLUEPRINT_ORG_C = {
  code: `ORG-C-${RUN_ID}`,
  prefix: `ORG-C-${RUN_ID}`,
  name: `Crestline Agri Wholesale (${RUN_ID})`,
  owner: {
    email: `org-c.owner.${RUN_ID}@agrivio.test`,
    name: 'Sardar Farooq (Wholesale Owner)',
  },
  employees: [
    { email: `org-c.mgr.${RUN_ID}@agrivio.test`, name: 'Hamid Manager (Org C)', role: 'Manager' },
    { email: `org-c.csh.${RUN_ID}@agrivio.test`, name: 'Tanveer Cashier (Org C)', role: 'Cashier' },
    { email: `org-c.stk.${RUN_ID}@agrivio.test`, name: 'Zahid StoreKeeper (Org C)', role: 'StoreKeeper' },
  ],
  branches: [
    { key: 'br1', name: `ORG-C Lahore Terminal (${RUN_ID})`, code: `C-LHR-${RUN_ID.slice(0, 3)}` },
    { key: 'br2', name: `ORG-C Gujranwala Outpost (${RUN_ID})`, code: `C-GUJ-${RUN_ID.slice(0, 3)}` },
  ],
  warehouses: [
    { key: 'wh1', name: `ORG-C Terminal Depot (${RUN_ID})`, code: `C-WH1-${RUN_ID.slice(0, 3)}`, branchKey: 'br1' },
    { key: 'wh2', name: `ORG-C Equipment Depot (${RUN_ID})`, code: `C-WH2-${RUN_ID.slice(0, 3)}`, branchKey: 'br2' },
  ],
  accounts: [
    { key: 'cash', name: `ORG-C Central Cash Vault (${RUN_ID})`, type: 'cash', openingBalance: '500000.00' },
    { key: 'bank', name: `ORG-C Standard Chartered (${RUN_ID})`, type: 'bank', bankName: 'Standard Chartered', mask: 'SCB-883011', openingBalance: '5000000.00' },
  ],
  categories: [
    { key: 'cat_mach', name: `ORG-C Farm Equipment & Tools (${RUN_ID})`, productClass: 'general' },
    { key: 'cat_fert', name: `ORG-C Bulk Soil Conditioners (${RUN_ID})`, productClass: 'fertilizer' },
  ],
  products: [
    {
      key: 'p1',
      name: `ORG-C Battery Sprayer 20L (${RUN_ID})`,
      sku: `ORG-C-SKU-BAT20-${RUN_ID}`,
      categoryKey: 'cat_mach',
      trackingMode: 'none',
      baseUnitCode: 'COUNT',
      measurementDimension: 'mass',
      prices: { retail: '8500.00', wholesale: '7200.00' },
    },
    {
      key: 'p2',
      name: `ORG-C Drip Emitter Line 500M (${RUN_ID})`,
      sku: `ORG-C-SKU-DRP500-${RUN_ID}`,
      categoryKey: 'cat_mach',
      trackingMode: 'none',
      baseUnitCode: 'COUNT',
      measurementDimension: 'mass',
      prices: { retail: '14000.00', wholesale: '12200.00' },
    },
    {
      key: 'p3',
      name: `ORG-C Gypsum Granular 50KG (${RUN_ID})`,
      sku: `ORG-C-SKU-GYP50-${RUN_ID}`,
      categoryKey: 'cat_fert',
      trackingMode: 'batch',
      baseUnitCode: 'BAG',
      measurementDimension: 'mass',
      prices: { retail: '1100.00', wholesale: '950.00' },
    },
    {
      key: 'p4',
      name: `ORG-C Potassium Humate 25KG (${RUN_ID})`,
      sku: `ORG-C-SKU-HUM25-${RUN_ID}`,
      categoryKey: 'cat_fert',
      trackingMode: 'batch_expiry',
      baseUnitCode: 'BAG',
      measurementDimension: 'mass',
      prices: { retail: '6500.00', wholesale: '5600.00' },
    },
  ],
  openingStock: [
    { productKey: 'p1', warehouseKey: 'wh2', quantity: '25.0000', value: '137500.00' },
    { productKey: 'p2', warehouseKey: 'wh2', quantity: '20.0000', value: '190000.00' },
    { productKey: 'p3', warehouseKey: 'wh1', quantity: '200.0000', batchNumber: `LOT-C-GYP-${RUN_ID}`, value: '150000.00' },
    { productKey: 'p4', warehouseKey: 'wh1', quantity: '50.0000', batchNumber: `LOT-C-HUM-${RUN_ID}`, expiryOffset: 365, value: '225000.00' },
  ],
  customers: [
    { key: 'c1', name: `ORG-C-CUSTOMER Punjab Agri Cooperative (${RUN_ID})`, type: 'business', priceTier: 'dealer', phone: '03003330001', creditEnabled: true, creditLimit: '1000000.00', openingReceivable: '150000.00' },
    { key: 'c2', name: `ORG-C-CUSTOMER Indus River Mega Farm (${RUN_ID})`, type: 'farmer', phone: '03003330002', creditEnabled: true, creditLimit: '800000.00' },
    { key: 'c3', name: `ORG-C-CUSTOMER Walk-in Bulk Buyer (${RUN_ID})`, type: 'business', priceTier: 'dealer', phone: '03003330003', creditEnabled: false },
  ],
  suppliers: [
    { key: 's1', name: `ORG-C-SUPPLIER Horizon Agri Equipment (${RUN_ID})`, phone: '03007770001', email: `horizon.${RUN_ID}@example.com`, address: 'GT Road Lahore', contactPerson: 'Mr. Kamran', openingPayable: '200000.00' },
    { key: 's2', name: `ORG-C-SUPPLIER National Minerals Corp (${RUN_ID})`, phone: '03007770002', email: `minerals.${RUN_ID}@example.com`, address: 'Khewra Road Jhelum', contactPerson: 'Mr. Tariq' },
  ],
  purchases: [
    {
      key: 'po1',
      supplierKey: 's1',
      warehouseKey: 'wh2',
      productKey: 'p1',
      quantity: '15.0000',
      unitCost: '5500.00',
      invoiceRef: `C-HOR-PO-01-${RUN_ID}`,
      landedFreight: '3500.00',
      payAmount: '50000.00',
      accountKey: 'bank',
    },
  ],
  sales: [
    // 1. Cash Sale
    { key: 'sa_cash', branchKey: 'br1', warehouseKey: 'wh1', customerKey: 'c3', productKey: 'p3', quantity: '20.0000', unitPrice: '1100.00', payAmount: '22000.00', accountKey: 'cash' },
    // 2. 100% Credit Sale
    { key: 'sa_credit', branchKey: 'br1', warehouseKey: 'wh1', customerKey: 'c1', productKey: 'p4', quantity: '10.0000', unitPrice: '6500.00' },
    // 3. Partial Sale
    { key: 'sa_partial', branchKey: 'br2', warehouseKey: 'wh2', customerKey: 'c2', productKey: 'p1', quantity: '5.0000', unitPrice: '8500.00', payAmount: '20000.00', accountKey: 'cash' },
  ],
  customerPayment: { customerKey: 'c1', accountKey: 'bank', amount: '50000.00', notes: 'Org C Cooperative bank transfer' },
  supplierPayment: { supplierKey: 's1', accountKey: 'bank', amount: '80000.00', notes: 'Org C Machinery payment' },
  expense: { categoryName: `ORG-C Logistics Fleet (${RUN_ID})`, accountKey: 'cash', amount: '45000.00', purpose: 'Diesel & Freight fleet expense', reference: `C-FRT-${RUN_ID}` },
  stockAdjustment: { warehouseKey: 'wh1', productKey: 'p3', type: 'damage', direction: 'outbound', quantity: '1.0000', reason: 'Gypsum bag torn in moisture' },
  warehouseTransfer: { productKey: 'p3', sourceWarehouseKey: 'wh1', destWarehouseKey: 'wh2', quantity: '10.0000', reason: 'Replenishing Gujranwala stock' },
  salesReturn: { saleKey: 'sa_cash', quantity: '1.0000', accountKey: 'cash', reason: 'Surplus gypsum bag returned' },
  purchaseReturn: { purchaseKey: 'po1', quantity: '1.0000', reason: 'Sprayer motor defective' },
};

export {
  BLUEPRINT_ORG_A,
  BLUEPRINT_ORG_B,
  BLUEPRINT_ORG_C,
  RUN_ID,
};
