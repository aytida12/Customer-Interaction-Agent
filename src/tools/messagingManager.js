const twilio = require('twilio');

class MessagingManager {
  constructor(accountSid, authToken, twilioPhoneNumber) {
    this.client = twilio(accountSid, authToken);
    this.twilioPhoneNumber = twilioPhoneNumber;
  }

  /**
   * Send SMS message
   */
  async sendMessage(to, body) {
    try {
      // Ensure body is under SMS limits
      if (body.length > 1600) {
        body = body.substring(0, 1597) + '...';
      }

      const message = await this.client.messages.create({
        to,
        from: this.twilioPhoneNumber,
        body
      });

      return {
        success: true,
        messageSid: message.sid,
        status: message.status
      };
    } catch (error) {
      console.error('Error sending message:', error);
      throw error;
    }
  }

  /**
   * Send confirmation message after booking
   */
  async sendBookingConfirmation(phone, appointmentDetails) {
    const { service_type, start_time, eventLink } = appointmentDetails;
    const startDate = new Date(start_time);
    const formattedTime = startDate.toLocaleString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    });

    const message = `Booking confirmed! ${service_type} scheduled for ${formattedTime}. We'll send a reminder 24 hours before. Thank you!`;
    return this.sendMessage(phone, message);
  }

  /**
   * Send appointment reminder
   */
  async sendReminder(phone, appointmentDetails) {
    const { service_type, start_time } = appointmentDetails;
    const startDate = new Date(start_time);
    const formattedTime = startDate.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });

    const message = `Reminder: Your ${service_type} appointment is today at ${formattedTime}. Reply STOP to cancel.`;
    return this.sendMessage(phone, message);
  }

  /**
   * Send error/escalation message
   */
  async sendEscalationMessage(phone) {
    const message = `Thanks for reaching out. I'm connecting you with a team member who will follow up shortly.`;
    return this.sendMessage(phone, message);
  }
}

module.exports = MessagingManager;
