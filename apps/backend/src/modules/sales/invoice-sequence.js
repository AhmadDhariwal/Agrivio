function formatInvoiceNumber(invoicePrefix, sequenceNumber) {
  const prefix = String(invoicePrefix ?? '').trim();
  const sequence = Number(sequenceNumber);
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error('Invoice sequence number must be a positive integer');
  }
  return `${prefix}-${String(sequence).padStart(6, '0')}`;
}

module.exports = {
  formatInvoiceNumber,
};
