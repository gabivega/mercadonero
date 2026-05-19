// utils/orderHelpers.js
export const transitionToStatus = async (order, newStatus, comment = "") => {
  order.status = newStatus;
  order.statusHistory.push({
    status: newStatus,
    changedAt: new Date(),
    comment: comment
  });
  return await order.save();
};