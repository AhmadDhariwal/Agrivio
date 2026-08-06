/**
 * Fixture: controller must not import mongoose directly.
 */
import mongoose from 'mongoose';

export function findSales() {
  return mongoose.connection.collection('sales').find({});
}
