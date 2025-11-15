const { google } = require('googleapis');

const BUSINESS_HOURS = {
  start: 9, // 9 AM
  end: 17   // 5 PM
};

class CalendarManager {
  constructor(auth, calendarId, timezone = 'America/New_York') {
    this.calendar = google.calendar({ version: 'v3', auth });
    this.calendarId = calendarId;
    this.timezone = timezone;
  }

  /**
   * Find available appointment slots
   */
  async lookupAvailability({ service_type, start_date, end_date, time_of_day, duration_minutes }) {
    try {
      const startDate = new Date(start_date);
      const endDate = new Date(end_date);

      // Fetch busy times from calendar
      const response = await this.calendar.freebusy.query({
        requestBody: {
          timeMin: startDate.toISOString(),
          timeMax: endDate.toISOString(),
          items: [{ id: this.calendarId }]
        }
      });

      const busy = response.data.calendars[this.calendarId].busy || [];
      const slots = this._computeFreeSlots(startDate, endDate, busy, time_of_day, duration_minutes);

      return {
        slots: slots.slice(0, 3), // Return top 3 available slots
        timezone: this.timezone
      };
    } catch (error) {
      console.error('Error looking up availability:', error);
      throw error;
    }
  }

  /**
   * Compute free time slots from busy calendar data
   */
  _computeFreeSlots(startDate, endDate, busyTimes, timeOfDay, durationMinutes) {
    const slots = [];
    let current = new Date(startDate);
    current.setHours(BUSINESS_HOURS.start, 0, 0, 0);

    const endOfSearch = new Date(endDate);
    endOfSearch.setHours(BUSINESS_HOURS.end, 0, 0, 0);

    while (current < endOfSearch && slots.length < 10) {
      // Skip weekends
      if (current.getDay() === 0 || current.getDay() === 6) {
        current.setDate(current.getDate() + 1);
        current.setHours(BUSINESS_HOURS.start, 0, 0, 0);
        continue;
      }

      // Check time of day preference
      if (!this._matchesTimeOfDay(current, timeOfDay)) {
        current.setHours(current.getHours() + 1);
        continue;
      }

      // Check if slot is free
      const slotEnd = new Date(current.getTime() + durationMinutes * 60000);

      if (this._isSlotFree(current, slotEnd, busyTimes) && slotEnd.getHours() <= BUSINESS_HOURS.end) {
        slots.push({
          start_time: current.toISOString(),
          end_time: slotEnd.toISOString(),
          formatted: this._formatSlot(current, slotEnd)
        });
      }

      current.setHours(current.getHours() + 1);
    }

    return slots;
  }

  /**
   * Check if time matches preferred time of day
   */
  _matchesTimeOfDay(date, timeOfDay) {
    const hour = date.getHours();
    if (timeOfDay === 'any') return true;
    if (timeOfDay === 'morning') return hour >= 8 && hour < 12;
    if (timeOfDay === 'afternoon') return hour >= 12 && hour < 17;
    if (timeOfDay === 'evening') return hour >= 17 && hour < 20;
    return false;
  }

  /**
   * Check if slot overlaps with busy times
   */
  _isSlotFree(start, end, busyTimes) {
    return !busyTimes.some(busy => {
      const busyStart = new Date(busy.start);
      const busyEnd = new Date(busy.end);
      return start < busyEnd && end > busyStart;
    });
  }

  /**
   * Format slot for human-readable display
   */
  _formatSlot(start, end) {
    const options = { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    return `${start.toLocaleDateString('en-US', options)} - ${end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`;
  }

  /**
   * Book an appointment on the calendar
   */
  async bookAppointment({ service_type, customer_name, phone, email, start_time, end_time, address, notes }) {
    try {
      const event = {
        summary: `${service_type} — ${customer_name}`,
        description: `Phone: ${phone}\nEmail: ${email || 'N/A'}\nAddress: ${address || 'N/A'}\nNotes: ${notes || ''}`,
        start: { dateTime: start_time, timeZone: this.timezone },
        end: { dateTime: end_time, timeZone: this.timezone },
        attendees: email ? [{ email }] : [],
        conferenceData: {
          createRequest: { requestId: `aiden-${Date.now()}` }
        }
      };

      const response = await this.calendar.events.insert({
        calendarId: this.calendarId,
        requestBody: event,
        conferenceDataVersion: 1
      });

      return {
        eventId: response.data.id,
        htmlLink: response.data.htmlLink,
        conferenceLink: response.data.conferenceData?.entryPoints?.[0]?.uri || null
      };
    } catch (error) {
      console.error('Error booking appointment:', error);
      throw error;
    }
  }

  /**
   * Cancel an appointment
   */
  async cancelAppointment(eventId) {
    try {
      await this.calendar.events.delete({
        calendarId: this.calendarId,
        eventId
      });
      return true;
    } catch (error) {
      console.error('Error canceling appointment:', error);
      throw error;
    }
  }
}

module.exports = CalendarManager;
