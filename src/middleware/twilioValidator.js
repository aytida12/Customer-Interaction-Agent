/**
 * Twilio signature validation middleware
 */
function validateTwilioRequest(req, res, next) {
  const twilio = require('twilio');
  const signature = req.headers['x-twilio-signature'];
  const url = process.env.TWILIO_WEBHOOK_URL;

  if (!signature || !url) {
    console.warn('Missing Twilio signature or webhook URL in validation');
    // In development, you might skip validation; in production, enforce it
    if (process.env.NODE_ENV === 'production') {
      return res.status(403).json({ error: 'Invalid signature' });
    }
  }

  const params = req.body;
  const isValid = twilio.validateRequest(process.env.TWILIO_AUTH_TOKEN, signature, url, params);

  if (!isValid) {
    console.error('Invalid Twilio signature');
    return res.status(403).json({ error: 'Invalid signature' });
  }

  next();
}

module.exports = { validateTwilioRequest };
