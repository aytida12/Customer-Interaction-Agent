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
    logger.error('Error initializing sheet:', error);
    res.status(500).json({ error: 'Failed to initialize sheet' });
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
