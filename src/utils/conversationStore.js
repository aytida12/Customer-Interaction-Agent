/**
 * Simple in-memory store for conversation history and temporary state
 * In production, use Redis or a database
 */
class ConversationStore {
  constructor() {
    this.conversations = new Map();
    this.pendingSlots = new Map();
  }

  /**
   * Get conversation history for a customer
   */
  getConversation(phoneNumber) {
    if (!this.conversations.has(phoneNumber)) {
      this.conversations.set(phoneNumber, []);
    }
    return this.conversations.get(phoneNumber);
  }

  /**
   * Add message to conversation history
   */
  addMessage(phoneNumber, role, content) {
    const history = this.getConversation(phoneNumber);
    history.push({ role, content });
    // Keep last 20 messages for context
    if (history.length > 20) {
      history.shift();
    }
  }

  /**
   * Clear conversation
   */
  clearConversation(phoneNumber) {
    this.conversations.delete(phoneNumber);
  }

  /**
   * Store pending slot selections (soft-hold)
   */
  setPendingSlots(phoneNumber, slots) {
    this.pendingSlots.set(phoneNumber, {
      slots,
      timestamp: Date.now(),
      expiresAt: Date.now() + 10 * 60 * 1000 // 10 minute expiry
    });
  }

  /**
   * Get pending slots if not expired
   */
  getPendingSlots(phoneNumber) {
    const pending = this.pendingSlots.get(phoneNumber);
    if (!pending) return null;
    if (Date.now() > pending.expiresAt) {
      this.pendingSlots.delete(phoneNumber);
      return null;
    }
    return pending.slots;
  }

  /**
   * Clear pending slots
   */
  clearPendingSlots(phoneNumber) {
    this.pendingSlots.delete(phoneNumber);
  }

  /**
   * Clean up expired entries
   */
  cleanup() {
    const now = Date.now();
    for (const [phone, data] of this.pendingSlots.entries()) {
      if (now > data.expiresAt) {
        this.pendingSlots.delete(phone);
      }
    }
  }
}

module.exports = new ConversationStore();
