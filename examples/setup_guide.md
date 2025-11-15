# Detailed Setup Guide

## Prerequisites Checklist

- [ ] Node.js 16+ installed
- [ ] Git repository initialized
- [ ] Twilio account + phone number
- [ ] OpenAI account + API key
- [ ] Google Cloud project created
- [ ] HTTPS server/domain (for Twilio webhook)

---

## Step 1: Clone & Install

```bash
git clone https://github.com/yourusername/Customer-Interaction-Agent.git
cd Customer-Interaction-Agent
npm install
```

---

## Step 2: Create Twilio Account & Phone Number

1. Go to [twilio.com](https://twilio.com) → Sign up (free trial includes $15 credit)
2. Navigate to **Phone Numbers** → **Buy Numbers**
3. Select country/area code, buy a number (usually $1–3/mo)
4. You'll get: `ACCOUNT_SID`, `AUTH_TOKEN`, phone number

Keep these handy.

---

## Step 3: Get OpenAI API Key

1. Go to [platform.openai.com/account/api-keys](https://platform.openai.com/account/api-keys)
2. Click **Create new secret key**
3. Copy the key (save securely)
4. Choose a pricing model: Pay-as-you-go (recommended for MVP)

**Estimated cost:** ~$0.05–0.20 per SMS conversation (depends on message length & model)

---

## Step 4: Google Cloud Setup (Calendar + Sheets)

### 4a. Create Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com)
2. Click **Select a Project** → **New Project**
3. Name: `Customer-Interaction-Agent`
4. Click **Create**

### 4b. Enable APIs

1. In the left sidebar, click **APIs & Services** → **Library**
2. Search for **Google Calendar API** → Click → **Enable**
3. Search for **Google Sheets API** → Click → **Enable**

### 4c. Create OAuth2 Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth 2.0 Client ID**
3. Choose **Desktop application** (or Web if deploying)
4. Accept defaults, click **Create**
5. Download the JSON file
6. Extract:
   - `client_id`
   - `client_secret`

### 4d. Get Refresh Token

Use this script to generate a refresh token:

```bash
# Install googleapis (already in dependencies)
# Then run:
node scripts/get_google_token.js
```

If you don't have the script, use Google's [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/):

1. Go to playground
2. Authorize with your Google account
3. Request Calendar scope: `https://www.googleapis.com/auth/calendar`
4. Exchange auth code for tokens
5. Copy the **Refresh Token**

### 4e. Create Google Sheet for Leads

1. Go to [sheets.google.com](https://sheets.google.com)
2. Create a new sheet named `leads` (or similar)
3. Get the sheet ID from the URL: `https://docs.google.com/spreadsheets/d/{SHEET_ID}/...`
4. Share the sheet with your Google Cloud service account email (if using service account) OR ensure your OAuth user has access

### 4f. Create Business Calendar

1. Go to [calendar.google.com](https://calendar.google.com)
2. Create a new calendar: **+ Create** → Name it "Business" or "Appointments"
3. Get calendar ID from settings (usually `calendar_name@gmail.com` or a long ID)

---

## Step 5: Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your values:

```env
# Twilio
TWILIO_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
TWILIO_PHONE_NUMBER=+1234567890
TWILIO_WEBHOOK_URL=https://yourdomain.com/webhook/sms

# OpenAI
OPENAI_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Google OAuth
GOOGLE_CLIENT_ID=xxxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/callback
GOOGLE_REFRESH_TOKEN=1//your_refresh_token_here

# Google Services
BUSINESS_CALENDAR_ID=business@gmail.com
CALENDAR_TIMEZONE=America/New_York
GOOGLE_SHEETS_ID=your_sheet_id_from_step_4e

# Server
PORT=3000
NODE_ENV=development
LOG_LEVEL=debug
```

**⚠️ IMPORTANT:** Never commit `.env` to Git. Add to `.gitignore`:

```bash
echo ".env" >> .gitignore
```

---

## Step 6: Start Server & Initialize

```bash
npm run dev
```

You should see:

```
[2024-01-15T10:30:00.000Z] [INFO] Server listening on port 3000
[2024-01-15T10:30:00.000Z] [INFO] Environment: development
[2024-01-15T10:30:00.000Z] [INFO] Twilio phone: +1234567890
```

In another terminal, initialize the Google Sheet:

```bash
curl http://localhost:3000/init
# Should return: { "success": true, "message": "Sheet initialized" }
```

---

## Step 7: Configure Twilio Webhook

Twilio needs to POST incoming SMS to your server. You need a **publicly accessible HTTPS URL**.

### Option A: Local Development (ngrok)

```bash
npm install -g ngrok
ngrok http 3000
```

You'll get: `https://xxxx-xx-xxx-xx.ngrok.io`

### Option B: Deploy First (Recommended)

Skip to **Step 8** and come back here with your public URL.

### Configure in Twilio Console

1. Go to [console.twilio.com](https://console.twilio.com)
2. **Phone Numbers** → Select your number
3. Under **Messaging**:
   - **A MESSAGE COMES IN** webhook:
     - URL: `https://your-domain.com/webhook/sms` (or ngrok URL + `/webhook/sms`)
     - Method: `POST`
4. Save

---

## Step 8: Test Locally

### Health Check

```bash
curl http://localhost:3000/health
# { "status": "OK", "timestamp": "2024-01-15T10:35:00Z" }
```

### Send Test SMS

Send an SMS from your phone to your Twilio number:

```
"I need plumbing help"
```

You should receive an SMS reply from Aiden!

### Check Conversation History

```bash
curl http://localhost:3000/admin/conversation/+15551234567
# Returns conversation array
```

### View All Leads

```bash
curl http://localhost:3000/admin/leads
# Returns all leads saved to Google Sheets
```

---

## Step 9: Deploy to Production

### Option A: Heroku (Easiest for MVP)

```bash
heroku login
heroku create your-app-name
heroku config:set TWILIO_AUTH_TOKEN=xxx OPENAI_API_KEY=xxx ... (paste all .env vars)
git push heroku main

# Get your Heroku URL
heroku domains
# https://your-app-name.herokuapp.com
```

Then update Twilio webhook to: `https://your-app-name.herokuapp.com/webhook/sms`

### Option B: AWS Lambda + API Gateway

Use Serverless Framework:

```bash
npm install -g serverless
serverless deploy
```

### Option C: DigitalOcean / Linode / VPS

1. Deploy Node app
2. Use Nginx as reverse proxy (for HTTPS)
3. Get SSL cert from Let's Encrypt
4. Update Twilio webhook URL

---

## Step 10: Customize for Your Business

### Edit System Prompt

File: `src/utils/llmManager.js`

Change the `SYSTEM_PROMPT` to match your business:

```js
const SYSTEM_PROMPT = `You are Aiden, a receptionist for [YOUR BUSINESS NAME].
Services offered: [LIST SERVICES].
Business hours: [HOURS].
...`
```

### Update Business Hours

File: `src/tools/calendarManager.js`

```js
const BUSINESS_HOURS = {
  start: 9,  // Change to your start hour
  end: 17    // Change to your end hour
};
```

### Change Appointment Duration

File: `.env`

```env
APPOINTMENT_DURATION_MINUTES=90  # e.g., 90 min for consultations
```

---

## Step 11: Monitor & Debug

### View Logs

If running locally:
```bash
npm run dev
# Logs in terminal
```

If deployed:
```bash
# Heroku
heroku logs --tail

# AWS Lambda
aws logs tail /aws/lambda/your-function --follow

# VPS / Docker
docker logs container_name
```

### Test Function Calling

Send test messages to debug LLM function calls:

```
"Schedule me for plumbing next Thursday 10 AM"
# This should trigger lookup_availability → book_appointment
```

Check logs to see the LLM's function calls.

---

## Troubleshooting

### "Twilio webhook not firing"

- [ ] URL is HTTPS (not http://)
- [ ] Domain is publicly accessible
- [ ] No firewall blocking inbound
- [ ] Check Twilio Console for webhook logs/errors

### "Calendar API permission denied"

- [ ] Refresh token is valid (regenerate if needed)
- [ ] Calendar API is enabled in Google Cloud
- [ ] Service account has access to calendar

### "LLM not returning function calls"

- [ ] Check `OPENAI_API_KEY` is correct
- [ ] Verify `config/functions.json` is valid JSON
- [ ] Try simpler test prompt (e.g., "Book me Thursday 10 AM")

### "Google Sheets not saving leads"

- [ ] Sheet ID is correct
- [ ] OAuth user has edit access to sheet
- [ ] Sheet is not in a Trash folder

---

## Next: Running the Demo

1. **Send SMS:** Text your Twilio number with: *"I need [service] for [description]"*
2. **Follow Agent:** Reply to availability slots with *"Book 1"* or *"Book 2"*
3. **Confirm Booking:** Receive SMS confirmation + calendar event created
4. **Check CRM:** Visit `localhost:3000/admin/leads` to see saved lead

---

## Additional Resources

- [Twilio SMS API Docs](https://www.twilio.com/docs/sms)
- [OpenAI Function Calling](https://platform.openai.com/docs/guides/function-calling)
- [Google Calendar API](https://developers.google.com/calendar)
- [Google Sheets API](https://developers.google.com/sheets)
- [Express.js Guide](https://expressjs.com/)

---

## Security Checklist (Before Production)

- [ ] All secrets in environment variables (not `.env` on server)
- [ ] HTTPS enabled (SSL/TLS certificate)
- [ ] Twilio signature validation enabled
- [ ] Rate limiting on `/webhook/sms`
- [ ] Authentication on `/admin/*` endpoints
- [ ] Database backup strategy
- [ ] Logging and monitoring set up
- [ ] Data retention policy defined
- [ ] PII redaction in logs

---

## Support

For issues:
1. Check the logs
2. Review [troubleshooting](#troubleshooting) section
3. Test with `curl` (see `examples/test_curl.sh`)
4. Open an issue on GitHub

Happy deploying! 🚀
