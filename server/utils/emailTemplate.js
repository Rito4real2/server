const getEmailTemplate = (user, status, transaction) => {
  const isApproved = status === 'APPROVED';
  const statusColor = isApproved ? '#10B981' : '#EF4444';
  const txTypeLower = transaction.type.toLowerCase();

  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 600px; margin: auto;">
      <h2 style="color: #1f2937;">${transaction.type} Status Update</h2>
      <p>Hello <strong>${user.fullName || user.userName}</strong>,</p>
      <p>Your recent ${txTypeLower} request has been reviewed by administration.</p>
      
      <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Transaction ID:</strong> ${transaction._id}</p>
        <p style="margin: 5px 0;"><strong>Type:</strong> ${transaction.type}</p>
        <p style="margin: 5px 0;"><strong>Amount:</strong> $${Number(transaction.amount).toFixed(2)}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold; text-transform: uppercase;">${status}</span></p>
      </div>

      <p style="color: #4b5563; font-size: 14px;">Log in to your dashboard to view your updated account details and balance.</p>
    </div>
  `;
};

// Email template for Deposit Status Update
const getDepositEmailTemplate = (user, status, transaction) => {
  const pendingStatusColor = '#854d0e'; // Amber/yellow for PENDING
  
  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 600px; margin: auto;">
      <h2 style="color: #1f2937;">Deposit Status</h2>
      <p>Hello <strong>${user.userName}</strong>,</p>
      <p>Your recent deposit request is currently being processed. Submit your proof of payment in the receipt modal for faster processing.</p>
      
      <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Amount:</strong> $${Number(transaction.amount).toFixed(2)}</p>
        <p style="margin: 5px 0;"><strong>Reference:</strong> ${transaction._id || 'N/A'}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${pendingStatusColor}; font-weight: bold; text-transform: uppercase;">${status}</span></p>
      </div>

      <p style="color: #4b5563; font-size: 14px;">If you have any questions or did not request this, please contact support immediately.</p>
    </div>
  `;
};

// Email template for Withdrawal Status Update
const getWithdrawalEmailTemplate = (user, transaction, status) => {
  const pendingStatusColor = '#854d0e'; // Amber/yellow for PENDING
  
  return `
    <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px; max-width: 600px; margin: auto;">
      <h2 style="color: #1f2937;">Withdrawal Status</h2>
      <p>Hello <strong>${user.userName}</strong>,</p>
      <p>Your withdrawal request has been submitted sucessfully.</p>
      
      <div style="background: #f9fafb; padding: 15px; border-radius: 6px; margin: 20px 0;">
        <p style="margin: 5px 0;"><strong>Amount:</strong> $${Number(transaction.amount).toFixed(2)}</p>
        <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${pendingStatusColor}; font-weight: bold; text-transform: uppercase;">${status}</span></p>
      </div>

      <p style="color: #4b5563; font-size: 14px;">Log in to your dashboard to view your updated account balance.</p>
    </div>
  `;
};

module.exports = { getEmailTemplate, getDepositEmailTemplate, getWithdrawalEmailTemplate };