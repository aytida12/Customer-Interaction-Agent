require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const { google } = require('googleapis');

// Import custom modules
const LLMManager = require('./utils/llmManager');
const CalendarManager = require('./tools/calendarManager');
const SheetsManager = require('./tools/sheetsManager');
const MessagingManager = require('./tools/messagingManager');
const conversationStore = require('./utils/conversationStore');
const logger = require('./utils/logger');
const { validateTwilioRequest } = require('./middleware/twilioValidator');

// Initialize Express
const app = express();
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Initialize managers
const oAuth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });

// OAuth callback handler (for token refresh flow)
app.get('/auth/callback', async (req, res) => {
  const code = req.query.code;
  const error = req.query.error;

  if (error) {
    return res.status(400).json({ error, error_description: req.query.error_description });
  }

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    logger.info('OAuth tokens received', { hasRefreshToken: !!tokens.refresh_token });

    // Return tokens in JSON and also as HTML for easy viewing
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>OAuth Token - Customer Interaction Agent</title>
        <style>
          body { font-family: monospace; margin: 40px; }
          .token { background: #f0f0f0; padding: 15px; border-radius: 5px; margin: 10px 0; }
          .refresh-token { background: #e8f5e9; padding: 15px; border-radius: 5px; margin: 10px 0; word-break: break-all; }
          h2 { color: #333; }
          .warning { color: #ff9800; font-weight: bold; }
          button { padding: 10px 20px; cursor: pointer; }
        </style>
      </head>
      <body>
        <h1>✅ OAuth Authorization Successful</h1>
        <p>Copy the <strong>refresh_token</strong> value below into your <code>.env</code> file:</p>
        
        <h2>Tokens Received:</h2>
        <div class="token">
          <strong>access_token:</strong><br/>
          ${tokens.access_token.substring(0, 50)}...
        </div>
        
        ${tokens.refresh_token ? `
        <div class="refresh-token">
          <strong>refresh_token:</strong><br/>
          <code>${tokens.refresh_token}</code>
          <br/><br/>
          <button onclick="navigator.clipboard.writeText('${tokens.refresh_token}'); alert('Copied to clipboard!');">📋 Copy refresh_token</button>
        </div>
        ` : `
        <div style="background: #ffebee; padding: 15px; border-radius: 5px; color: #c62828;">
          <strong>⚠️ No refresh_token returned.</strong><br/>
          This usually means you previously authorized this app for the same account.
          <br/><br/>
          <strong>Fix:</strong> Revoke access at <a href="https://myaccount.google.com/security" target="_blank">myaccount.google.com/security</a>
          (Third-party apps → find your app → Remove Access), then re-run the auth flow.
        </div>
        `}
        
        <h2>Next Steps:</h2>
        <ol>
          <li>Copy the <code>refresh_token</code> value</li>
          <li>Paste it into your <code>.env</code> as <code>GOOGLE_REFRESH_TOKEN=&lt;value&gt;</code></li>
          <li>Restart your server: <code>npm run dev</code></li>
          <li>Test with: <code>curl http://localhost:3000/init</code></li>
        </ol>
      </body>
      </html>
    `;
    res.set('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    logger.error('Error exchanging code for tokens', { error: error.message });
    const errorHtml = `
      <!DOCTYPE html>
      <html>
      <head><title>OAuth Error</title><style>body { font-family: monospace; margin: 40px; color: #c62828; }</style></head>
      <body>
        <h1>❌ OAuth Error</h1>
        <p><strong>Error:</strong> ${error.message}</p>
        <p><strong>Details:</strong> ${error.response?.data?.error_description || error.response?.data?.error || 'Unknown error'}</p>
        <p><a href="javascript:history.back()">Go back and try again</a></p>
      </body>
      </html>
    `;
    res.status(400).set('Content-Type', 'text/html').send(errorHtml);
  }
});

const llmManager = new LLMManager(process.env.OPENAI_API_KEY);
const calendarManager = new CalendarManager(
  oAuth2Client,
  process.env.BUSINESS_CALENDAR_ID,
  process.env.CALENDAR_TIMEZONE
);
const sheetsManager = new SheetsManager(oAuth2Client, process.env.GOOGLE_SHEETS_ID, process.env.GOOGLE_SHEET_NAME);
const messagingManager = new MessagingManager(
  process.env.TWILIO_SID,
  process.env.TWILIO_AUTH_TOKEN,
  process.env.TWILIO_PHONE_NUMBER
);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Initialize sheets on startup
app.get('/init', async (req, res) => {
  try {
    await sheetsManager.initializeSheet();
    res.json({ success: true, message: 'Sheet initialized' });
  } catch (error) {
    // Log full error for debugging
    logger.error('Error initializing sheet', { message: error.message, stack: error.stack });
    // Return helpful error details in development to aid debugging
    const payload = { error: 'Failed to initialize sheet' };
    if (process.env.NODE_ENV !== 'production') {
      payload.details = error.message;
      payload.stack = error.stack;
    }
    res.status(500).json(payload);
  }
});

/**
 * Main Twilio SMS webhook handler
 */
app.post('/webhook/sms', validateTwilioRequest, async (req, res) => {
  const customerPhone = req.body.From;
  const incomingMessage = req.body.Body;

  logger.info('Incoming SMS', { phone: customerPhone, message: incomingMessage });

  try {
    // Get conversation history
    const conversationHistory = conversationStore.getConversation(customerPhone);

    // Process message with LLM
    const llmResponse = await llmManager.processMessage(incomingMessage, conversationHistory);

    // Add to conversation history
    conversationStore.addMessage(customerPhone, 'user', incomingMessage);

    let replyText = '';
    let bookingConfirmed = false;

    // Handle function call
    if (llmResponse.type === 'function_call') {
      const funcName = llmResponse.function_name;
      const args = llmResponse.arguments;

      logger.info('Function call requested', { phone: customerPhone, function: funcName, args });

      try {
        if (funcName === 'lookup_availability') {
          // Look up available slots
          const availability = await calendarManager.lookupAvailability(args);
          const slots = availability.slots;

          if (slots.length === 0) {
            replyText = `Sorry, no slots available in that timeframe. Can you try different dates?`;
          } else {
            // Store slots for later confirmation
            conversationStore.setPendingSlots(customerPhone, slots);

            // Format slots for user
            const slotOptions = slots
              .slice(0, 2)
              .map((slot, idx) => `${idx + 1}) ${slot.formatted}`)
              .join('\n');

            replyText = `Great! I found these times:\n${slotOptions}\nReply with "Book 1" or "Book 2" to confirm.`;
          }

          conversationStore.addMessage(customerPhone, 'assistant', replyText);
        } else if (funcName === 'book_appointment') {
          // Book the appointment
          const bookingResult = await calendarManager.bookAppointment(args);

          // Save lead to CRM
          await sheetsManager.saveLead({
            customer_name: args.customer_name,
            phone: customerPhone,
            email: args.email,
            service_type: args.service_type,
            address: args.address,
            message: incomingMessage,
            source: 'sms',
            agent_notes: `Appointment booked: ${args.service_type}`,
            appointment_id: bookingResult.eventId
          });

          // Update status in sheet
          await sheetsManager.updateLeadStatus(customerPhone, 'booked');

          replyText = `Booked! Your ${args.service_type} is scheduled. Event: ${bookingResult.htmlLink || 'Calendar confirmed'}. We'll remind you 24 hours before.`;
          bookingConfirmed = true;

          // Send confirmation SMS
          await messagingManager.sendBookingConfirmation(customerPhone, {
            service_type: args.service_type,
            start_time: args.start_time,
            eventLink: bookingResult.htmlLink
          });

          // Clear pending slots after booking
          conversationStore.clearPendingSlots(customerPhone);
          conversationStore.addMessage(customerPhone, 'assistant', replyText);
        } else if (funcName === 'save_lead') {
          // Save lead directly
          await sheetsManager.saveLead({
            ...args,
            source: args.source || 'sms'
          });

          replyText = `Thanks! I've saved your info. A specialist will follow up soon.`;
          conversationStore.addMessage(customerPhone, 'assistant', replyText);
        } else if (funcName === 'send_message') {
          // Echo message send request
          replyText = args.body;
          conversationStore.addMessage(customerPhone, 'assistant', replyText);
        } else {
          replyText = `I'm not sure how to handle that. Let me connect you with a specialist.`;
          conversationStore.addMessage(customerPhone, 'assistant', replyText);
        }
      } catch (toolError) {
        logger.error('Tool execution error', { phone: customerPhone, function: funcName, error: toolError.message });
        replyText = `Sorry, something went wrong. I'm connecting you with our team.`;
        conversationStore.addMessage(customerPhone, 'assistant', replyText);

        // Notify about escalation
        await messagingManager.sendEscalationMessage(customerPhone);
      }
    } else {
      // Text response from LLM
      replyText = llmResponse.text || 'How can I help you today?';
      conversationStore.addMessage(customerPhone, 'assistant', replyText);
    }

    // Send SMS reply
    if (replyText && !bookingConfirmed) {
      await messagingManager.sendMessage(customerPhone, replyText);
    }

    // Respond to Twilio with 200 OK
    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');

    logger.info('SMS processed successfully', { phone: customerPhone, replied: replyText });
  } catch (error) {
    logger.error('Webhook error', { phone: customerPhone, error: error.message });

    // Send error message to customer
    await messagingManager.sendEscalationMessage(customerPhone).catch(err => {
      logger.error('Failed to send escalation message', { error: err.message });
    });

    res.set('Content-Type', 'text/xml');
    res.send('<Response></Response>');
  }
});

/**
 * Admin endpoint to view conversation history
 */
app.get('/admin/conversation/:phone', (req, res) => {
  const phone = req.params.phone;
  // In production, add authentication here
  const history = conversationStore.getConversation(phone);
  res.json({ phone, history });
});

/**
 * Admin endpoint to view all leads (requires auth in production)
 */
app.get('/admin/leads', async (req, res) => {
  try {
    // In production, add authentication
    const leads = await sheetsManager.getAllLeads();
    res.json({ count: leads.length, leads });
  } catch (error) {
    logger.error('Error fetching leads', { error: error.message });
    res.status(500).json({ error: 'Failed to fetch leads' });
  }
});

/**
 * Cleanup task (run periodically)
 */
setInterval(() => {
  conversationStore.cleanup();
  logger.debug('Conversation store cleanup completed');
}, 5 * 60 * 1000); // Every 5 minutes

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message });
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server listening on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Twilio phone: ${process.env.TWILIO_PHONE_NUMBER}`);
});
