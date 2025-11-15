const { OpenAI } = require('openai');
const functionDefinitions = require('../../config/functions.json');

const SYSTEM_PROMPT = `You are "Aiden", a friendly and professional AI receptionist for a home-service business.

Your primary responsibilities:
1. Understand customer requests and extract key information
2. Ask clarifying questions to gather missing details (one question at a time)
3. Never make up information or decisions without checking availability first
4. Propose concrete appointment slots based on customer preferences
5. Only book appointments after explicit customer confirmation
6. Keep responses concise (max 3 short sentences for SMS)
7. Redirect complex issues to human specialists

Key rules:
- Always collect: service_type, address/zip, preferred_date_range, time_of_day, contact_name, phone
- Use lookup_availability BEFORE suggesting any specific time slots
- Use book_appointment ONLY after customer explicitly confirms a slot
- After successful booking, send a friendly confirmation
- For billing, refunds, or complaints: set requires_human flag and apologize
- Format dates as YYYY-MM-DD and times in ISO 8601 format

Be warm, helpful, and concise. Ask clarifying questions naturally.`;

class LLMManager {
  constructor(apiKey) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Process incoming message and determine action
   */
  async processMessage(incomingMessage, conversationHistory = []) {
    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...conversationHistory,
        { role: 'user', content: incomingMessage }
      ];

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        functions: functionDefinitions,
        function_call: 'auto',
        max_tokens: 500,
        temperature: 0.7
      });

      const choice = response.choices[0];

      if (choice.finish_reason === 'function_call' && choice.message.function_call) {
        return {
          type: 'function_call',
          function_name: choice.message.function_call.name,
          arguments: JSON.parse(choice.message.function_call.arguments || '{}'),
          raw_message: choice.message
        };
      } else {
        return {
          type: 'text_response',
          text: choice.message.content,
          raw_message: choice.message
        };
      }
    } catch (error) {
      console.error('Error processing message with LLM:', error);
      throw error;
    }
  }

  /**
   * Get function definitions (for debugging/logging)
   */
  getFunctionDefinitions() {
    return functionDefinitions;
  }

  /**
   * Build a follow-up message after a function result
   */
  async buildFollowUpMessage(functionName, functionResult, originalUserMessage) {
    try {
      const messages = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: originalUserMessage },
        {
          role: 'assistant',
          content: `I'm calling ${functionName}`,
          function_call: {
            name: functionName,
            arguments: JSON.stringify(functionResult)
          }
        },
        {
          role: 'function',
          name: functionName,
          content: JSON.stringify(functionResult)
        }
      ];

      const response = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages,
        max_tokens: 300,
        temperature: 0.7
      });

      return response.choices[0].message.content;
    } catch (error) {
      console.error('Error building follow-up message:', error);
      return 'Thanks! Let me process that for you.';
    }
  }
}

module.exports = LLMManager;
