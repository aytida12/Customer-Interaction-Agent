# Example Conversation Flows

## Flow 1: Initial Inquiry → Availability Lookup → Booking

```
Customer SMS: "I need my gutters cleaned next week."

[Agent receives message via Twilio webhook]
[LLM identifies: inquiry message, needs clarification]

Agent SMS: "Thanks for reaching out! Can I get your zip code and preferred day next week?"

Customer SMS: "90210, Thursday or Friday morning"

[Agent calls lookup_availability: 
  - service_type: gutter cleaning
  - start_date: 2024-01-18 (Thursday)
  - end_date: 2024-01-19 (Friday)
  - time_of_day: morning
  - duration: 60 minutes
]

[Calendar API returns two free slots:
  1. Thu Jan 18, 10:00-11:00 AM
  2. Fri Jan 19, 9:00-10:00 AM
]

Agent SMS: "Perfect! I found two times:
1) Thursday 10-11 AM
2) Friday 9-10 AM
Reply with 1 or 2 to book."

Customer SMS: "Book 1"

[Agent calls book_appointment:
  - service_type: gutter cleaning
  - customer_name: John Doe
  - phone: +15551234567
  - start_time: 2024-01-18T10:00:00
  - end_time: 2024-01-18T11:00:00
  - address: 123 Main St, Beverly Hills CA 90210
]

[Calendar event created]
[Lead saved to Google Sheets with status: "booked"]

Agent SMS: "Booked! Your gutter cleaning is Thursday Jan 18 at 10 AM. 
Calendar: [link]. We'll send a reminder 24 hours before. Thanks!"
```

---

## Flow 2: Lead Qualification with Missing Info

```
Customer SMS: "Need electrical work"

Agent SMS: "Sure! Can I get your zip code?"

Customer SMS: "Not ready yet, just getting quotes"

[LLM identifies: exploratory inquiry]

Agent SMS: "No problem! I've saved your info. A specialist will contact you soon with a quote."

[Lead saved to Sheets with status: "prospect" / "pending_callback"]
```

---

## Flow 3: Out-of-Service Area (Escalation)

```
Customer SMS: "Plumbing needed in Seattle"

[Agent determines: service area check → out of coverage]

Agent SMS: "Thanks for asking! We currently service Los Angeles area only. 
I'm connecting you with a team member who can help with referrals."

[Lead saved with requires_human = true]
[Slack notification sent to owner]
[Lead status: "escalated"]
```

---

## Flow 4: Complex Request (Human Takeover)

```
Customer SMS: "I want to file a complaint about last month's invoice"

[LLM determines: billing issue, outside agent scope]

Agent SMS: "I understand your concern. I'm connecting you with our billing team now.
They'll follow up within 2 hours."

[Conversation flagged: requires_human = true]
[Lead saved with issue type: "billing_complaint"]
[Support ticket created in backend]
```

---

## Flow 5: Concurrent Booking (Soft-Hold Pattern)

```
[Customer A] SMS: "Book 1"  ← Thu 10-11 AM
[Customer B] SMS: "Book 1"  ← Thu 10-11 AM (same slot, received 2 min later)

[Agent A: slot held for 10 min, tries to book]
[Calendar: event inserted ✓]
[Customer A: booking confirmed]

[Agent B: soft-hold expired after 10 min]
[Calendar: insert fails (conflict) OR slot already marked busy]

Agent SMS to B: "Sorry, that slot was just booked. Let me find another:
1) Thu 11-12 PM
2) Fri 10-11 AM
Reply with 1 or 2."

Customer B SMS: "1"

[Booking succeeded for second customer]
```

---

## Flow 6: Payment Required (Future Feature)

```
Customer SMS: "Book cleaning for $150"

[LLM identifies: requires payment]

Agent SMS: "Great! Before I confirm, I need a $50 deposit. 
Click here to pay: [Stripe link]"

Customer: [Clicks link, pays on Stripe]

[Webhook confirms payment]

Agent SMS: "Payment received! Your appointment is confirmed for Thu 2 PM.
Thanks!"

[Lead status: "booked_paid"]
```

---

## Flow 7: Reminder (Automated)

```
[System runs cron job: 24 hours before appointment]

[Reads event from Calendar]
[Finds customer phone in event description]

Agent SMS: "Reminder: Your plumbing service is tomorrow at 10 AM. 
Reply STOP to cancel."

---

## Flow 8: Cancellation

```
Customer SMS: "Cancel my appointment Thursday"

[LLM identifies: cancellation request]

Agent SMS: "I can help with that. Can I confirm you want to cancel 
plumbing service on Thu Jan 18 at 10 AM?"

Customer SMS: "Yes"

[Agent calls cancelAppointment(eventId)]
[Lead status updated: "cancelled"]

Agent SMS: "Done! Your appointment has been cancelled. 
We'll follow up with a callback offer soon."
```

---

## Flow 9: Rescheduling

```
Customer SMS: "Can I reschedule my appointment?"

Agent SMS: "Of course! What day/time works better?"

Customer SMS: "Next Tuesday afternoon"

[Agent calls cancelAppointment (old)]
[Agent calls lookupAvailability (Tue afternoon)]
[Agent proposes new slots]

[Same booking flow as Flow 1]
```

---

## Flow 10: Follow-up After Booking (24 hours later)

```
[System sends reminder SMS to customer]

Customer SMS: "Thanks, we're all set"

Agent SMS: "Great! See you soon!"

---

[After appointment, AI should ideally ask for feedback]
Agent SMS (next day): "How was your service? Reply 1-5 stars or feedback."

Customer SMS: "5 stars, very professional"

[Lead status: "completed_satisfied"]
[Feedback logged in Sheets]
```

---

## LLM Prompt Adjustments per Industry

### Plumbing/HVAC
```
"You are Aiden, an AI receptionist for a plumbing and HVAC company.
Common services: emergency repairs, maintenance plans, new installations.
Always ask for location and describe the issue (leak, no hot water, etc.)."
```

### Home Cleaning
```
"You are Aiden, an AI receptionist for a home cleaning company.
Services: regular cleaning, deep cleaning, move-in/out.
Ask: square footage, pet-friendly?, preferred day/frequency."
```

### Fitness / Tutoring
```
"You are Aiden, an AI receptionist for a fitness coaching service.
Ask: fitness level, goals, availability.
NOTE: No appointment booking needed — schedule 1-on-1 consultation instead."
```

---

## Error Scenarios

### Scenario: Calendar API Timeout
```
[lookup_availability times out after 5 seconds]

Agent SMS: "Sorry, I couldn't check availability right now. 
Try again in a moment or I can have someone call you."
```

### Scenario: Sheet Write Failure
```
[sheetsManager.saveLead fails due to quota/permission]

Agent SMS: "Booking confirmed! [details sent]
(Note: lead save failed — logged in backend for retry)"

[Backend: store in failed_leads queue, retry with exponential backoff]
```

### Scenario: Invalid Timezone
```
[Time conversion fails due to unsupported timezone]

Agent SMS: "Got it. Can you confirm your time zone? (e.g., EST, PST)"
```
