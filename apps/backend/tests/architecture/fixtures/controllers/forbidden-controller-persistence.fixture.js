/**
 * Fixture: controller must not import mongoose directly.
 */
const mongoose = require('mongoose');
function findSales() {
  return mongoose.connection.collection('sales').find({});
}

module.exports = {
  findSales,
};
