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

module.exports = { getEmailTemplate };