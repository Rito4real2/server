const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html }) => {
  try {
    const info = await resend.emails.send({
      from: `"Platform Support" <${process.env.EMAIL_USER}>`,
      to: [to],
      subject: subject,
      html: html,
    });

    console.log('Email sent successfully via Resend', info);
    return true;
  } catch (error) {
    console.error('Error sending email via Resend:', error);
    return false;
  }
};

module.exports = sendEmail;