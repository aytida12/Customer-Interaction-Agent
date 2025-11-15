const { google } = require('googleapis');

class SheetsManager {
  constructor(auth, spreadsheetId, sheetName = 'Leads') {
    this.sheets = google.sheets({ version: 'v4', auth });
    this.spreadsheetId = spreadsheetId;
    this.sheetName = sheetName;
  }

  /**
   * Append a lead row to the spreadsheet
   */
  async saveLead(lead) {
    try {
      const {
        customer_name,
        phone,
        email,
        service_type,
        address,
        message,
        source,
        agent_notes,
        appointment_id
      } = lead;

      const timestamp = new Date().toISOString();
      const row = [
        timestamp,
        customer_name || '',
        phone || '',
        email || '',
        service_type || '',
        address || '',
        message || '',
        source || 'unknown',
        agent_notes || '',
        appointment_id || '',
        'new' // status
      ];

      const response = await this.sheets.spreadsheets.values.append({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A:K`,
        valueInputOption: 'RAW',
        requestBody: {
          values: [row]
        }
      });

      return {
        success: true,
        updatedRows: response.data.updates?.updatedRows || 1,
        updatedRange: response.data.updates?.updatedRange
      };
    } catch (error) {
      console.error('Error saving lead to sheet:', error);
      throw error;
    }
  }

  /**
   * Update lead status
   */
  async updateLeadStatus(phone, newStatus) {
    try {
      // Find the row with this phone number
      const range = `${this.sheetName}!A:K`;
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range
      });

      const rows = response.data.values || [];
      let rowIndex = -1;

      for (let i = 0; i < rows.length; i++) {
        if (rows[i][2] === phone) {
          rowIndex = i;
          break;
        }
      }

      if (rowIndex === -1) {
        throw new Error(`Lead with phone ${phone} not found`);
      }

      // Update the status column (K)
      const updateRange = `${this.sheetName}!K${rowIndex + 1}`;
      await this.sheets.spreadsheets.values.update({
        spreadsheetId: this.spreadsheetId,
        range: updateRange,
        valueInputOption: 'RAW',
        requestBody: {
          values: [[newStatus]]
        }
      });

      return { success: true, rowUpdated: rowIndex + 1 };
    } catch (error) {
      console.error('Error updating lead status:', error);
      throw error;
    }
  }

  /**
   * Get all leads (for admin dashboard)
   */
  async getAllLeads() {
    try {
      const range = `${this.sheetName}!A:K`;
      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range
      });

      return response.data.values || [];
    } catch (error) {
      console.error('Error fetching leads:', error);
      throw error;
    }
  }

  /**
   * Initialize sheet with headers if empty
   */
  async initializeSheet() {
    try {
      const headers = [
        'Timestamp',
        'Customer Name',
        'Phone',
        'Email',
        'Service Type',
        'Address',
        'Message',
        'Source',
        'Agent Notes',
        'Appointment ID',
        'Status'
      ];

      const response = await this.sheets.spreadsheets.values.get({
        spreadsheetId: this.spreadsheetId,
        range: `${this.sheetName}!A1`
      });

      // If empty, add headers
      if (!response.data.values || response.data.values.length === 0) {
        await this.sheets.spreadsheets.values.append({
          spreadsheetId: this.spreadsheetId,
          range: `${this.sheetName}!A:K`,
          valueInputOption: 'RAW',
          requestBody: {
            values: [headers]
          }
        });
      }

      return { initialized: true };
    } catch (error) {
      console.error('Error initializing sheet:', error);
      throw error;
    }
  }
}

module.exports = SheetsManager;
