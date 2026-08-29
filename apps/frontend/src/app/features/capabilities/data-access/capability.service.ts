import { Injectable, Injector, computed, inject, signal } from '@angular/core';
import { Observable, finalize, of, shareReplay, tap } from 'rxjs';
import { AuthSessionStore } from '../../auth/data-access/auth-session.store';
import { CapabilitiesApi } from './capabilities.api';
import { EffectiveCapabilitiesSnapshot } from '../models/capability.models';
import { QueryCacheService } from '../../../shared/data-access/query-cache.service';
import { invalidateDashboardReads } from '../../dashboard/data-access/dashboard-cache.invalidation';

const CURRENT_BEHAVIOR_DEFAULTS: Readonly<Record<string, Readonly<Record<string, boolean>>>> = {
  'inventory.products': { enabled: true },
  'inventory.products.views.table': { enabled: true },
  'inventory.products.views.desktopCards': { enabled: true },
  'inventory.products.fields.productName': { visible: true, editable: true },
  'inventory.products.fields.sku': { visible: true, editable: true },
  'inventory.products.fields.category': { visible: true, editable: true },
  'inventory.products.fields.trackingMode': { visible: true, editable: true },
  'inventory.products.fields.baseUnit': { visible: true, editable: true },
  'inventory.products.fields.measurementDimension': { visible: true, editable: true },
  'inventory.products.fields.sellingPrice': { visible: true, editable: true },
  'inventory.products.fields.status': { visible: true, editable: false },
  'inventory.products.widgets.totalProducts': { visible: true },
  'inventory.products.widgets.activeProducts': { visible: true },
  'inventory.products.widgets.lowStock': { visible: true },
  'inventory.products.widgets.trackedItems': { visible: true },
  'inventory.products.actions.create': { allowed: true },
  'inventory.products.actions.inspect': { allowed: true },
  'inventory.products.actions.edit': { allowed: true },
  'inventory.products.actions.managePricing': { allowed: true },
  'inventory.products.actions.deactivate': { allowed: true },
  'inventory.products.actions.reactivate': { allowed: true },
  'inventory.products.actions.delete': { allowed: true },
  'inventory.categories': { enabled: true },
  'inventory.categories.views.desktopCards': { enabled: true },
  'inventory.categories.fields.name': { visible: true, editable: true },
  'inventory.categories.fields.productClass': { visible: true, editable: true },
  'inventory.categories.fields.status': { visible: true, editable: false },
  'inventory.categories.features.trackingRequirementDisplay': { enabled: true },
  'inventory.categories.widgets.totalCategories': { visible: true },
  'inventory.categories.actions.create': { allowed: true },
  'inventory.categories.actions.inspect': { allowed: true },
  'inventory.categories.actions.edit': { allowed: true },
  'inventory.categories.actions.deactivate': { allowed: true },
  'inventory.categories.actions.reactivate': { allowed: true },
  'inventory.categories.actions.delete': { allowed: true },
  'inventory.stock': { enabled: true },
  'inventory.stock.views.desktopCards': { enabled: true },
  'inventory.stock.widgets.stockRecords': { visible: true },
  'inventory.stock.widgets.activeWarehouses': { visible: true },
  'inventory.stock.widgets.catalogProducts': { visible: true },
  'inventory.stock.widgets.expiringExpired': { visible: true },
  'inventory.stock.features.search': { enabled: true },
  'inventory.stock.features.warehouseFilter': { enabled: true },
  'inventory.stock.features.productFilter': { enabled: true },
  'inventory.stock.fields.product': { visible: true },
  'inventory.stock.fields.warehouse': { visible: true },
  'inventory.stock.fields.batch': { visible: true },
  'inventory.stock.fields.quantityBase': { visible: true },
  'inventory.stock.fields.wac': { visible: true },
  'inventory.stock.fields.inventoryValue': { visible: true },
  'inventory.stock.fields.status': { visible: true },
  'inventory.stock.features.identitySection': { enabled: true },
  'inventory.stock.features.quantitySection': { enabled: true },
  'inventory.stock.features.valuationSection': { enabled: true },
  'inventory.stock.features.trackingSection': { enabled: true },
  'inventory.stock.actions.inspect': { allowed: true },
  'inventory.openingStock': { enabled: true },
  'inventory.openingStock.features.moduleInfo': { enabled: true },
  'inventory.openingStock.features.productSearch': { enabled: true },
  'inventory.openingStock.fields.packagingUnit': { visible: true },
  'inventory.openingStock.fields.manufacturingDate': { visible: true },
  'inventory.openingStock.fields.warehouse': { visible: true },
  'inventory.openingStock.fields.product': { visible: true },
  'inventory.openingStock.fields.quantity': { visible: true },
  'inventory.openingStock.fields.inventoryValue': { visible: true },
  'inventory.openingStock.fields.batchExpiry': { visible: true },
  'inventory.openingStock.actions.post': { allowed: true },
  'inventory.openingStock.actions.viewStock': { allowed: true },
  'inventory.batches': { enabled: true },
  'inventory.batches.views.desktopCards': { enabled: true },
  'inventory.batches.features.moduleInfo': { enabled: true },
  'inventory.batches.widgets.totalBatches': { visible: true },
  'inventory.batches.widgets.expiringSoon': { visible: true },
  'inventory.batches.widgets.expired': { visible: true },
  'inventory.batches.widgets.warehouseProductSummary': { visible: true },
  'inventory.batches.features.search': { enabled: true },
  'inventory.batches.features.productFilter': { enabled: true },
  'inventory.batches.features.warehouseFilter': { enabled: true },
  'inventory.batches.fields.batchNumber': { visible: true },
  'inventory.batches.fields.product': { visible: true },
  'inventory.batches.fields.locations': { visible: true },
  'inventory.batches.fields.manufactureDate': { visible: true },
  'inventory.batches.fields.expiryDate': { visible: true },
  'inventory.batches.fields.firstReceived': { visible: true },
  'inventory.batches.fields.availableQuantity': { visible: true },
  'inventory.batches.fields.status': { visible: true },
  'inventory.batches.features.stockByLocation': { enabled: true },
  'inventory.batches.features.technicalDetails': { enabled: true },
  'inventory.batches.actions.inspect': { allowed: true },
  'inventory.batches.actions.viewProduct': { allowed: true },
  'inventory.batches.actions.viewStock': { allowed: true },
  'inventory.batches.actions.viewMovements': { allowed: true },
  'inventory.expiry': { enabled: true },
  'inventory.expiry.views.desktopCards': { enabled: true },
  'inventory.expiry.features.moduleInfo': { enabled: true },
  'inventory.expiry.widgets.totalRecords': { visible: true },
  'inventory.expiry.widgets.expiringSoon': { visible: true },
  'inventory.expiry.widgets.expired': { visible: true },
  'inventory.expiry.widgets.trackedProductsWarehouses': { visible: true },
  'inventory.expiry.features.search': { enabled: true },
  'inventory.expiry.features.productFilter': { enabled: true },
  'inventory.expiry.features.warehouseFilter': { enabled: true },
  'inventory.expiry.features.classificationFilter': { enabled: true },
  'inventory.expiry.fields.batchNumber': { visible: true },
  'inventory.expiry.fields.product': { visible: true },
  'inventory.expiry.fields.expiryDate': { visible: true },
  'inventory.expiry.fields.classification': { visible: true },
  'inventory.expiry.fields.warehouse': { visible: true },
  'inventory.expiry.fields.quantity': { visible: true },
  'inventory.expiry.features.timelineSection': { enabled: true },
  'inventory.expiry.features.quantitySection': { enabled: true },
  'inventory.expiry.features.technicalDetails': { enabled: true },
  'inventory.expiry.actions.inspect': { allowed: true },
  'inventory.expiry.actions.viewBatch': { allowed: true },
  'inventory.expiry.actions.viewProduct': { allowed: true },
  'inventory.expiry.actions.viewStock': { allowed: true },
  'inventory.expiry.actions.viewMovements': { allowed: true },
  'inventory.adjustments': { enabled: true },
  'inventory.adjustments.features.moduleInfo': { enabled: true },
  'inventory.adjustments.features.productSearch': { enabled: true },
  'inventory.adjustments.features.productContext': { enabled: true },
  'inventory.adjustments.features.stockContext': { enabled: true },
  'inventory.adjustments.features.guidance': { enabled: true },
  'inventory.adjustments.features.recentAdjustments': { enabled: true },
  'inventory.adjustments.features.serverPostingDate': { enabled: true },
  'inventory.adjustments.fields.warehouse': { visible: true },
  'inventory.adjustments.fields.product': { visible: true },
  'inventory.adjustments.fields.adjustmentType': { visible: true },
  'inventory.adjustments.fields.quantity': { visible: true },
  'inventory.adjustments.fields.reason': { visible: true },
  'inventory.adjustments.fields.batch': { visible: true },
  'inventory.adjustments.fields.direction': { visible: true },
  'inventory.adjustments.fields.inventoryValue': { visible: true },
  'inventory.adjustments.actions.post': { allowed: true },
  'inventory.adjustments.actions.reverse': { allowed: true },
  'inventory.adjustments.actions.viewStock': { allowed: true },
  'inventory.adjustments.actions.viewMovements': { allowed: true },
  'inventory.transfers': { enabled: true },
  'inventory.transfers.features.moduleInfo': { enabled: true },
  'inventory.transfers.features.productSearch': { enabled: true },
  'inventory.transfers.features.productContext': { enabled: true },
  'inventory.transfers.features.stockContext': { enabled: true },
  'inventory.transfers.features.guidance': { enabled: true },
  'inventory.transfers.features.recentTransfers': { enabled: true },
  'inventory.transfers.features.serverTransferDate': { enabled: true },
  'inventory.transfers.fields.sourceWarehouse': { visible: true },
  'inventory.transfers.fields.destinationWarehouse': { visible: true },
  'inventory.transfers.fields.product': { visible: true },
  'inventory.transfers.fields.quantity': { visible: true },
  'inventory.transfers.fields.reason': { visible: true },
  'inventory.transfers.fields.batch': { visible: true },
  'inventory.transfers.actions.post': { allowed: true },
  'inventory.transfers.actions.reverse': { allowed: true },
  'inventory.transfers.actions.inspect': { allowed: true },
  'inventory.transfers.actions.viewStock': { allowed: true },
  'inventory.reconciliation': { enabled: true },
  'inventory.reconciliation.features.moduleInfo': { enabled: true },
  'inventory.reconciliation.features.search': { enabled: true },
  'inventory.reconciliation.features.warehouseFilter': { enabled: true },
  'inventory.reconciliation.features.findingFilter': { enabled: true },
  'inventory.reconciliation.features.kpiCards': { enabled: true },
  'inventory.reconciliation.features.inspector': { enabled: true },
  'inventory.reconciliation.features.technicalDetails': { enabled: true },
  'inventory.reconciliation.fields.product': { visible: true },
  'inventory.reconciliation.fields.warehouse': { visible: true },
  'inventory.reconciliation.fields.batch': { visible: true },
  'inventory.reconciliation.fields.balanceQuantity': { visible: true },
  'inventory.reconciliation.fields.movementQuantity': { visible: true },
  'inventory.reconciliation.fields.variance': { visible: true },
  'inventory.reconciliation.fields.findingCode': { visible: true },
  'inventory.reconciliation.actions.refresh': { allowed: true },
  'inventory.reconciliation.actions.inspect': { allowed: true },
  'inventory.reconciliation.actions.viewStock': { allowed: true },
  'inventory.reconciliation.actions.viewMovements': { allowed: true },
  'inventory.reconciliation.actions.viewBatch': { allowed: true },
  'inventory.movements': { enabled: true },
  'inventory.movements.features.moduleInfo': { enabled: true },
  'inventory.movements.features.search': { enabled: true },
  'inventory.movements.features.filters': { enabled: true },
  'inventory.movements.features.kpiCards': { enabled: true },
  'inventory.movements.features.referenceResolution': { enabled: true },
  'inventory.movements.features.inspector': { enabled: true },
  'inventory.movements.features.technicalDetails': { enabled: true },
  'inventory.movements.features.mobileCards': { enabled: true },
  'inventory.movements.fields.product': { visible: true },
  'inventory.movements.fields.warehouse': { visible: true },
  'inventory.movements.fields.direction': { visible: true },
  'inventory.movements.fields.quantity': { visible: true },
  'inventory.movements.fields.sourceType': { visible: true },
  'inventory.movements.fields.batch': { visible: true },
  'inventory.movements.fields.inventoryValue': { visible: true },
  'inventory.movements.actions.refresh': { allowed: true },
  'inventory.movements.actions.inspect': { allowed: true },
  'inventory.movements.actions.viewStock': { allowed: true },
  'inventory.movements.actions.viewProduct': { allowed: true },
  'inventory.movements.actions.viewBatch': { allowed: true },
  customers: { enabled: true },
  'customers.views.desktopCards': { enabled: true },
  'customers.features.moduleInfo': { enabled: true },
  'customers.features.search': { enabled: true },
  'customers.features.statusFilter': { enabled: true },
  'customers.features.kpiCards': { enabled: true },
  'customers.features.inspector': { enabled: true },
  'customers.features.technicalDetails': { enabled: true },
  'customers.features.creditSection': { enabled: true },
  'customers.fields.name': { visible: true, editable: true },
  'customers.fields.customerType': { visible: true, editable: true },
  'customers.fields.creditEnabled': { visible: true, editable: true },
  'customers.fields.phone': { visible: true, editable: true },
  'customers.fields.priceTier': { visible: true, editable: true },
  'customers.fields.creditLimit': { visible: true, editable: true },
  'customers.fields.creditLimitBehaviour': { visible: true, editable: true },
  'customers.fields.derivedBalances': { visible: true },
  'customers.fields.openingBalance': { visible: true },
  'customers.actions.create': { allowed: true },
  'customers.actions.inspect': { allowed: true },
  'customers.actions.edit': { allowed: true },
  'customers.actions.deactivate': { allowed: true },
  'customers.actions.reactivate': { allowed: true },
  'customers.actions.delete': { allowed: true },
  'customers.actions.editCreditPolicy': { allowed: true },
  'customers.actions.postOpeningBalance': { allowed: true },
  'customers.actions.refresh': { allowed: true },
  // Suppliers module controls (21 authoritative controls)
  suppliers: { enabled: true },
  'suppliers.features.moduleInfo': { enabled: true },
  'suppliers.features.search': { enabled: true },
  'suppliers.features.statusFilter': { enabled: true },
  'suppliers.features.kpiCards': { enabled: true },
  'suppliers.features.inspector': { enabled: true },
  'suppliers.features.technicalDetails': { enabled: true },
  'suppliers.fields.name': { visible: true, editable: true },
  'suppliers.fields.contactName': { visible: true, editable: true },
  'suppliers.fields.phone': { visible: true, editable: true },
  'suppliers.fields.email': { visible: true, editable: true },
  'suppliers.fields.derivedBalances': { visible: true },
  'suppliers.fields.openingBalance': { visible: true },
  'suppliers.actions.create': { allowed: true },
  'suppliers.actions.inspect': { allowed: true },
  'suppliers.actions.edit': { allowed: true },
  'suppliers.actions.deactivate': { allowed: true },
  'suppliers.actions.reactivate': { allowed: true },
  'suppliers.actions.delete': { allowed: true },
  'suppliers.actions.postOpeningBalance': { allowed: true },
  'suppliers.actions.refresh': { allowed: true },
  // Returns and Corrections module controls (17 authoritative controls)
  returns: { enabled: true },
  'returns.features.moduleInfo': { enabled: true },
  'returns.features.typeFilter': { enabled: true },
  'returns.features.statusFilter': { enabled: true },
  'returns.features.warehouseFilter': { enabled: true },
  'returns.fields.warehouse': { visible: true },
  'returns.fields.product': { visible: true },
  'returns.fields.quantity': { visible: true },
  'returns.fields.reason': { visible: true },
  'returns.fields.batch': { visible: true },
  'returns.fields.resolution': { visible: true },
  'returns.fields.refundAccount': { visible: true },
  'returns.fields.approvedReturnValue': { visible: true },
  'returns.actions.post': { allowed: true },
  'returns.actions.withoutInvoice': { allowed: true },
  'returns.actions.reverse': { allowed: true },
  'returns.actions.inspect': { allowed: true },
  // Expenses module controls (12 authoritative controls)
  expenses: { enabled: true },
  'expenses.features.moduleInfo': { enabled: true },
  'expenses.features.statusFilter': { enabled: true },
  'expenses.features.dateSearch': { enabled: true },
  'expenses.fields.category': { visible: true },
  'expenses.fields.account': { visible: true },
  'expenses.fields.amount': { visible: true },
  'expenses.fields.purpose': { visible: true },
  'expenses.fields.expenseDate': { visible: true },
  'expenses.actions.post': { allowed: true },
  'expenses.actions.correct': { allowed: true },
  'expenses.actions.inspect': { allowed: true },
  'expenses.actions.manageCategories': { allowed: true },
  // Expense Categories submodule controls (11 authoritative controls)
  'expenses.categories': { enabled: true },
  'expenses.categories.features.moduleInfo': { enabled: true },
  'expenses.categories.features.search': { enabled: true },
  'expenses.categories.features.statusFilter': { enabled: true },
  'expenses.categories.fields.name': { visible: true, editable: true },
  'expenses.categories.fields.status': { visible: true, editable: false },
  'expenses.categories.actions.create': { allowed: true },
  'expenses.categories.actions.edit': { allowed: true },
  'expenses.categories.actions.deactivate': { allowed: true },
  'expenses.categories.actions.reactivate': { allowed: true },
  'expenses.categories.actions.delete': { allowed: true },
  // Accounts module controls (26 authoritative controls)
  accounts: { enabled: true },
  'accounts.features.moduleInfo': { enabled: true },
  'accounts.features.search': { enabled: true },
  'accounts.features.statusFilter': { enabled: true },
  'accounts.features.movementHistory': { enabled: true },
  'accounts.features.kpiCards': { enabled: true },
  'accounts.fields.name': { visible: true, editable: true },
  'accounts.fields.accountType': { visible: true, editable: false },
  'accounts.fields.status': { visible: true, editable: false },
  'accounts.fields.derivedBalance': { visible: true },
  'accounts.fields.bankName': { visible: true, editable: true },
  'accounts.fields.accountNumberMasked': { visible: true, editable: true },
  'accounts.fields.walletIdentifier': { visible: true, editable: true },
  'accounts.fields.openingBalance': { visible: true },
  'accounts.actions.create': { allowed: true },
  'accounts.actions.inspect': { allowed: true },
  'accounts.actions.edit': { allowed: true },
  'accounts.actions.deactivate': { allowed: true },
  'accounts.actions.reactivate': { allowed: true },
  'accounts.actions.delete': { allowed: true },
  'accounts.actions.postOpeningBalance': { allowed: true },
  'accounts.actions.postManualMovement': { allowed: true },
  'accounts.actions.transfer': { allowed: true },
  'accounts.actions.reverseMovement': { allowed: true },
  'accounts.actions.reverseTransfer': { allowed: true },
  'accounts.actions.refresh': { allowed: true },
  // Reports module controls (22 authoritative controls)
  reports: { enabled: true },
  'reports.features.moduleInfo': { enabled: true },
  'reports.reportAvailability.sales': { enabled: true },
  'reports.reportAvailability.purchases': { enabled: true },
  'reports.reportAvailability.grossProfit': { enabled: true },
  'reports.reportAvailability.stock': { enabled: true },
  'reports.reportAvailability.stockValuation': { enabled: true },
  'reports.reportAvailability.stockMovements': { enabled: true },
  'reports.reportAvailability.customerLedger': { enabled: true },
  'reports.reportAvailability.supplierLedger': { enabled: true },
  'reports.reportAvailability.accountCashBook': { enabled: true },
  'reports.reportAvailability.expenses': { enabled: true },
  'reports.reportAvailability.lowStock': { enabled: true },
  'reports.reportAvailability.expiry': { enabled: true },
  'reports.reportAvailability.deadStock': { enabled: true },
  'reports.reportAvailability.topProducts': { enabled: true },
  'reports.reportAvailability.topCustomers': { enabled: true },
  'reports.reportAvailability.employeeSales': { enabled: true },
  'reports.actions.run': { allowed: true },
  'reports.actions.exportPdf': { allowed: true },
  'reports.actions.exportExcel': { allowed: true },
  'reports.actions.exportCsv': { allowed: true },
  // Alerts module controls (13 authoritative controls)
  alerts: { enabled: true },
  'alerts.features.moduleInfo': { enabled: true },
  'alerts.features.summaryCards': { enabled: true },
  'alerts.features.navbarNotifications': { enabled: true },
  'alerts.alertTypeAvailability.lowStock': { enabled: true },
  'alerts.alertTypeAvailability.upcomingExpiry': { enabled: true },
  'alerts.alertTypeAvailability.expiredStock': { enabled: true },
  'alerts.alertTypeAvailability.deadStock': { enabled: true },
  'alerts.alertTypeAvailability.customerDues': { enabled: true },
  'alerts.alertTypeAvailability.supplierDues': { enabled: true },
  'alerts.actions.acknowledge': { allowed: true },
  'alerts.actions.markRead': { allowed: true },
  'alerts.actions.markAllRead': { allowed: true },
  // Purchases module controls (26 authoritative controls)
  purchases: { enabled: true },
  'purchases.features.moduleInfo': { enabled: true },
  'purchases.features.search': { enabled: true },
  'purchases.features.statusFilter': { enabled: true },
  'purchases.fields.branch': { visible: true, editable: true },
  'purchases.fields.supplierInvoiceReference': { visible: true, editable: true },
  'purchases.fields.notes': { visible: true, editable: true },
  'purchases.fields.packagingUnit': { visible: true, editable: true },
  'purchases.fields.manufacturingDate': { visible: true, editable: true },
  'purchases.fields.landedCosts': { visible: true, editable: true },
  'purchases.fields.warehouse': { visible: true, editable: true },
  'purchases.fields.supplier': { visible: true, editable: true },
  'purchases.fields.purchaseDate': { visible: true, editable: true },
  'purchases.fields.product': { visible: true, editable: true },
  'purchases.fields.quantity': { visible: true, editable: true },
  'purchases.fields.unitCost': { visible: true, editable: true },
  'purchases.fields.batchNumber': { visible: true, editable: true },
  'purchases.fields.expiryDate': { visible: true, editable: true },
  'purchases.actions.createDraft': { allowed: true },
  'purchases.actions.inspect': { allowed: true },
  'purchases.actions.editDraft': { allowed: true },
  'purchases.actions.discardDraft': { allowed: true },
  'purchases.actions.post': { allowed: true },
  'purchases.actions.cancel': { allowed: true },
  'purchases.actions.createReturn': { allowed: true },
  'purchases.actions.addPaymentAtPost': { allowed: true },
  // Supplier Payments submodule controls (17 authoritative controls)
  'payments.supplier': { enabled: true },
  'payments.supplier.features.moduleInfo': { enabled: true },
  'payments.supplier.features.paymentDateFilter': { enabled: true },
  'payments.supplier.fields.notes': { visible: true, editable: true },
  'payments.supplier.fields.paymentReference': { visible: true },
  'payments.supplier.fields.supplier': { visible: true, editable: true },
  'payments.supplier.fields.account': { visible: true, editable: true },
  'payments.supplier.fields.allocationMode': { visible: true, editable: true },
  'payments.supplier.fields.amount': { visible: true, editable: true },
  'payments.supplier.fields.paymentDate': { visible: true, editable: true },
  'payments.supplier.fields.allocations': { visible: true, editable: true },
  'payments.supplier.fields.status': { visible: true },
  'payments.supplier.actions.post': { allowed: true },
  'payments.supplier.actions.postInvoiceSpecific': { allowed: true },
  'payments.supplier.actions.inspect': { allowed: true },
  'payments.supplier.actions.viewLedger': { allowed: true },
  'payments.supplier.actions.correct': { allowed: true },
  // Supplier Ledger submodule controls (17 authoritative controls)
  'payments.supplierLedger': { enabled: true },
  'payments.supplierLedger.features.moduleInfo': { enabled: true },
  'payments.supplierLedger.features.supplierSearch': { enabled: true },
  'payments.supplierLedger.features.reconciliationSummary': { enabled: true },
  'payments.supplierLedger.features.ledgerFilters': { enabled: true },
  'payments.supplierLedger.fields.supplierIdentity': { visible: true },
  'payments.supplierLedger.fields.outstandingPayable': { visible: true },
  'payments.supplierLedger.fields.supplierAdvance': { visible: true },
  'payments.supplierLedger.fields.reconciliationStatus': { visible: true },
  'payments.supplierLedger.fields.allocationTotal': { visible: true },
  'payments.supplierLedger.fields.date': { visible: true },
  'payments.supplierLedger.fields.reference': { visible: true },
  'payments.supplierLedger.fields.entryType': { visible: true },
  'payments.supplierLedger.fields.effectKind': { visible: true },
  'payments.supplierLedger.fields.signedAmount': { visible: true },
  'payments.supplierLedger.fields.sourceStatus': { visible: true },
  'payments.supplierLedger.actions.viewSource': { allowed: true },
  // Sales module controls (34 authoritative controls)
  sales: { enabled: true },
  'sales.features.search': { enabled: true },
  'sales.features.statusFilter': { enabled: true },
  'sales.features.customerSearch': { enabled: true },
  'sales.features.productSearch': { enabled: true },
  'sales.fields.customer': { visible: true, editable: true },
  'sales.fields.notes': { visible: true, editable: true },
  'sales.fields.packagingUnit': { visible: true, editable: true },
  'sales.fields.branch': { visible: true, editable: true },
  'sales.fields.warehouse': { visible: true, editable: true },
  'sales.fields.saleDate': { visible: true, editable: true },
  'sales.fields.product': { visible: true, editable: true },
  'sales.fields.quantity': { visible: true, editable: true },
  'sales.fields.unitPrice': { visible: true, editable: true },
  'sales.fields.invoiceNumber': { visible: true, editable: false },
  'sales.fields.lifecycleStatus': { visible: true, editable: false },
  'sales.fields.saleTotal': { visible: true, editable: false },
  'sales.fields.paidTotal': { visible: true, editable: false },
  'sales.fields.receivableTotal': { visible: true, editable: false },
  'sales.fields.paymentDetails': { visible: true, editable: false },
  'sales.actions.createDraft': { allowed: true },
  'sales.actions.inspect': { allowed: true },
  'sales.actions.editDraft': { allowed: true },
  'sales.actions.discardDraft': { allowed: true },
  'sales.actions.post': { allowed: true },
  'sales.actions.cancel': { allowed: true },
  'sales.actions.print': { allowed: true },
  'sales.actions.createReturn': { allowed: true },
  'sales.actions.addPaymentAtPost': { allowed: true },
  'sales.actions.sellOnCredit': { allowed: true },
  'sales.actions.overridePrice': { allowed: true },
  'sales.actions.approveCreditLimit': { allowed: true },
  'sales.actions.approveExpiredStock': { allowed: true },
  'sales.actions.overrideNegativeStock': { allowed: true },
  // Customer Payments module controls (18 authoritative controls)
  'payments.customer': { enabled: true },
  'payments.customer.features.moduleInfo': { enabled: true },
  'payments.customer.features.search': { enabled: true },
  'payments.customer.features.paymentDateFilter': { enabled: true },
  'payments.customer.features.customerSearch': { enabled: true },
  'payments.customer.features.ledgerPreview': { enabled: true },
  'payments.customer.fields.notes': { visible: true, editable: true },
  'payments.customer.fields.customer': { visible: true, editable: true },
  'payments.customer.fields.account': { visible: true, editable: true },
  'payments.customer.fields.allocationMode': { visible: true, editable: true },
  'payments.customer.fields.amount': { visible: true, editable: true },
  'payments.customer.fields.paymentDate': { visible: true, editable: true },
  'payments.customer.fields.allocations': { visible: true, editable: true },
  'payments.customer.fields.status': { visible: true },
  'payments.customer.actions.post': { allowed: true },
  'payments.customer.actions.postInvoiceSpecific': { allowed: true },
  'payments.customer.actions.inspect': { allowed: true },
  'payments.customer.actions.correct': { allowed: true },
  dashboard: { enabled: true },
  'dashboard.features.datePeriodFilter': { enabled: true },
  'dashboard.features.branchFilter': { enabled: true },
  'dashboard.features.warehouseFilter': { enabled: true },
  'dashboard.widgets.financialSummary': { visible: true },
  'dashboard.widgets.accountSummary': { visible: true },
  'dashboard.widgets.salesVsPurchasesTrend': { visible: true },
  'dashboard.widgets.grossProfitTrend': { visible: true },
  'dashboard.widgets.topSellingProducts': { visible: true },
  'dashboard.widgets.inventoryHealth': { visible: true },
  'dashboard.widgets.recentSales': { visible: true },
};

@Injectable({ providedIn: 'root' })
export class CapabilityService {
  private readonly injector = inject(Injector);
  private readonly sessionStore = inject(AuthSessionStore);
  private readonly snapshotSignal = signal<EffectiveCapabilitiesSnapshot | null>(null);
  private readonly loadAttemptedSignal = signal(false);
  private activeRequest: Observable<EffectiveCapabilitiesSnapshot> | null = null;

  readonly snapshot = this.snapshotSignal.asReadonly();
  readonly version = computed(() => this.snapshotSignal()?.version ?? 0);
  readonly loadFailed = computed(
    () => this.loadAttemptedSignal() && this.snapshotSignal() === null,
  );

  clear(): void {
    this.snapshotSignal.set(null);
    this.loadAttemptedSignal.set(false);
    this.activeRequest = null;
  }

  ensureLoaded(): Observable<EffectiveCapabilitiesSnapshot | null> {
    const organizationId = this.sessionStore.activeContext()?.organizationId;
    const current = this.snapshotSignal();
    if (current !== null && current.organizationId === organizationId) {
      return of(current);
    }
    if (!organizationId) {
      this.clear();
      return of(null);
    }
    return this.refresh();
  }

  refresh(): Observable<EffectiveCapabilitiesSnapshot> {
    if (this.activeRequest !== null) {
      return this.activeRequest;
    }
    this.loadAttemptedSignal.set(true);
    const previousVersion = this.snapshotSignal()?.version ?? null;
    let api: CapabilitiesApi;
    try {
      api = this.injector.get(CapabilitiesApi);
    } catch {
      const snapshot = this.currentBehaviorSnapshot();
      this.snapshotSignal.set(snapshot);
      return of(snapshot);
    }
    const request = api.getCurrent().pipe(
      tap({
        next: (snapshot) => {
          this.snapshotSignal.set(snapshot);
          if (previousVersion !== null && snapshot.version !== previousVersion) {
            try {
              invalidateDashboardReads(this.injector.get(QueryCacheService));
            } catch {
              // Query cache is optional during bootstrap/tests.
            }
          }
        },
        error: () => this.snapshotSignal.set(null),
      }),
      finalize(() => {
        this.activeRequest = null;
      }),
      shareReplay({ bufferSize: 1, refCount: false }),
    );
    this.activeRequest = request;
    return request;
  }

  canUseModule(key: string): boolean {
    return this.value(key, 'enabled');
  }

  canUseFeature(key: string): boolean {
    return this.value(key, 'enabled');
  }

  canUseView(key: string): boolean {
    return this.value(key, 'enabled');
  }

  canShowWidget(key: string): boolean {
    return this.value(key, 'visible');
  }

  canViewField(key: string): boolean {
    return this.value(key, 'visible');
  }

  canEditField(key: string): boolean {
    return this.value(key, 'editable');
  }

  canPerformAction(key: string): boolean {
    return this.value(key, 'allowed');
  }

  private value(key: string, mode: string): boolean {
    const snapshot = this.snapshotSignal();
    if (snapshot !== null) {
      return snapshot.controls.find((control) => control.key === key)?.value[mode] === true;
    }
    return CURRENT_BEHAVIOR_DEFAULTS[key]?.[mode] === true;
  }

  private currentBehaviorSnapshot(): EffectiveCapabilitiesSnapshot {
    const moduleKeys = new Set([
      'inventory.products',
      'inventory.categories',
      'inventory.stock',
      'inventory.openingStock',
      'inventory.batches',
      'inventory.expiry',
      'inventory.adjustments',
      'inventory.transfers',
      'inventory.reconciliation',
      'inventory.movements',
      'customers',
      'suppliers',
      'returns',
      'expenses',
      'expenses.categories',
      'accounts',
      'reports',
      'alerts',
      'purchases',
      'payments.customer',
      'payments.supplier',
      'payments.supplierLedger',
      'sales',
      'dashboard',
    ]);
    return {
      organizationId: this.sessionStore.activeContext()?.organizationId ?? 'test-organization',
      version: 0,
      controls: Object.entries(CURRENT_BEHAVIOR_DEFAULTS).map(([key, value]) => ({
        key,
        type: moduleKeys.has(key)
          ? 'MODULE'
          : key.includes('.actions.')
            ? 'ACTION'
            : key.includes('.widgets.')
              ? 'WIDGET'
              : key.includes('.fields.')
                ? 'FIELD'
                : key.includes('.views.')
                  ? 'VIEW'
                  : 'FEATURE',
        value,
        reasons: [],
      })),
    };
  }
}
