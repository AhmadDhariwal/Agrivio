import { formatAppDate, formatAppTime } from '../../../shared/format/date-time.util';
import type { CustomerLedgerEffectRecord } from './customer-payments.models';

export type { CustomerLedgerEffectRecord };

export interface HumanizedLedgerEntry {
  id: string;
  title: string;
  sourceTypeLabel: string;
  sourceReference: string;
  date: string;
  time: string;
  formattedAmount: string;
  amountSign: '+' | '-';
  isPositive: boolean;
  effectKind: string;
}

export type HumanizedCustomerLedgerItem = HumanizedLedgerEntry;

const KNOWN_SOURCE_TITLES: Record<string, string> = {
  customer_payment_advance: 'Customer Advance Received',
  customer_advance_consumption: 'Advance Consumed',
  customer_advance_application: 'Advance Applied to Sale',
  customer_payment_allocation: 'Payment Received',
  sale_receivable: 'Sale Invoice',
  sale_cancellation: 'Sale Cancelled',
  sale_cancellation_advance_reinstatement: 'Advance Restored',
  sale_cancellation_advance_receivable_reversal: 'Advance Reversal',
  sale_cancellation_allocation_reversal: 'Payment Allocation Reversal',
  customer_opening_balance: 'Opening Balance',
  customer_opening_receivable: 'Opening Receivable',
  opening_balance: 'Opening Balance',
  customer_opening_balance_correction_reversal: 'Opening Balance Reversal',
  sales_return: 'Sales Return',
  sales_return_receivable: 'Sales Return Adjustment',
  sales_return_refund: 'Sales Return Refund',
  purchase_payable: 'Purchase Payable',
  purchase_cancellation: 'Purchase Cancelled',
  supplier_payment_allocation: 'Payment Allocation',
  supplier_payment_advance: 'Supplier Advance Paid',
  supplier_advance_application: 'Supplier Advance Applied',
  supplier_advance_consumption: 'Supplier Advance Consumed',
  purchase_cancellation_advance_payable_reversal: 'Supplier Advance Application Reversed',
  purchase_cancellation_advance_reinstatement: 'Supplier Advance Restored',
  purchase_return: 'Purchase Return',
  supplier_opening_payable: 'Opening Payable',
  supplier_opening_balance: 'Opening Balance',
  manual_adjustment: 'Manual Adjustment',
  customer_loan_disbursement: 'Customer Loan Disbursed',
  customer_loan_repayment: 'Loan Repayment',
  customer_loan_repayment_reversal: 'Loan Repayment Reversed',
  customer_loan_reversal: 'Customer Loan Reversed',
  customer_trade_receivable_adjustment: 'Trade Receivable Adjustment',
  customer_advance_adjustment: 'Customer Advance Adjustment',
  customer_loan_adjustment: 'Loan Balance Adjustment',
  customer_balance_adjustment_reversal: 'Balance Adjustment Reversed',
};

const KNOWN_SOURCE_TYPES: Record<string, string> = {
  customer_payment_advance: 'Customer Advance',
  customer_advance_consumption: 'Advance Consumption',
  customer_advance_application: 'Advance Application',
  customer_payment_allocation: 'Payment Allocation',
  sale_receivable: 'Sale',
  sale_cancellation: 'Sale Cancellation',
  sale_cancellation_advance_reinstatement: 'Sale Cancellation',
  sale_cancellation_advance_receivable_reversal: 'Sale Cancellation',
  sale_cancellation_allocation_reversal: 'Sale Cancellation',
  customer_opening_balance: 'Opening Balance',
  customer_opening_receivable: 'Opening Balance',
  opening_balance: 'Opening Balance',
  customer_opening_balance_correction_reversal: 'Opening Correction',
  sales_return: 'Sales Return',
  sales_return_receivable: 'Sales Return',
  sales_return_refund: 'Sales Return',
  purchase_payable: 'Purchase',
  purchase_cancellation: 'Purchase Cancellation',
  supplier_payment_allocation: 'Payment Allocation',
  supplier_payment_advance: 'Supplier Advance',
  supplier_advance_application: 'Advance Application',
  supplier_advance_consumption: 'Advance Consumption',
  purchase_cancellation_advance_payable_reversal: 'Purchase Cancellation',
  purchase_cancellation_advance_reinstatement: 'Purchase Cancellation',
  purchase_return: 'Purchase Return',
  supplier_opening_payable: 'Opening Balance',
  supplier_opening_balance: 'Opening Balance',
  manual_adjustment: 'Manual Adjustment',
  customer_loan_disbursement: 'Customer Loan Disbursed',
  customer_loan_repayment: 'Loan Repayment',
  customer_loan_repayment_reversal: 'Loan Repayment Reversed',
  customer_loan_reversal: 'Customer Loan Reversed',
  customer_trade_receivable_adjustment: 'Trade Receivable Adjustment',
  customer_advance_adjustment: 'Customer Advance Adjustment',
  customer_loan_adjustment: 'Loan Balance Adjustment',
  customer_balance_adjustment_reversal: 'Balance Adjustment Reversed',
};

function humanizeIdentifier(id: string | null | undefined): string {
  if (!id) return '';
  const trimmed = String(id).trim();
  if (/^[0-9a-fA-F]{24}$/.test(trimmed)) {
    return `#${trimmed.slice(-6).toUpperCase()}`;
  }
  return trimmed;
}

function humanizeFallback(sourceType: string): string {
  return sourceType
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function formatLedgerAmount(
  amount: string | number | undefined,
  currency = 'PKR',
): { formatted: string; sign: '+' | '-'; isPositive: boolean } {
  let isNeg = false;
  let raw = String(amount ?? '0').trim();

  if (raw.startsWith('-')) {
    isNeg = true;
    raw = raw.slice(1).trim();
  }

  const num = Number(raw);
  const validNum = Math.abs(isNaN(num) ? 0 : num);
  const formattedNum = validNum.toLocaleString('en-US', {
    minimumFractionDigits: validNum % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });

  const sign: '+' | '-' = isNeg ? '-' : '+';
  return {
    formatted: `${sign} ${currency} ${formattedNum}`,
    sign,
    isPositive: !isNeg,
  };
}

export interface LedgerItemLike {
  id: string;
  sourceType?: string;
  sourceId?: string;
  effectKind?: string;
  signedAmount?: { amount?: string | number };
  currency?: string;
  postedAt?: string | Date | null | undefined;
}

export function humanizeLedgerItem(item: LedgerItemLike): HumanizedLedgerEntry {
  const sourceType = item.sourceType ?? '';
  const title =
    KNOWN_SOURCE_TITLES[sourceType] ??
    humanizeFallback(sourceType || item.effectKind || 'Transaction');
  const sourceTypeLabel =
    KNOWN_SOURCE_TYPES[sourceType] ??
    humanizeFallback(sourceType || 'Ledger');

  const ref = humanizeIdentifier(item.sourceId);
  const sourceReference = ref ? `${sourceTypeLabel} ${ref}` : sourceTypeLabel;

  const date = formatAppDate(item.postedAt);
  const time = formatAppTime(item.postedAt);

  const amountInfo = formatLedgerAmount(item.signedAmount?.amount, item.currency || 'PKR');

  return {
    id: item.id,
    title,
    sourceTypeLabel,
    sourceReference,
    date,
    time,
    formattedAmount: amountInfo.formatted,
    amountSign: amountInfo.sign,
    isPositive: amountInfo.isPositive,
    effectKind: item.effectKind || '',
  };
}
