require('dotenv').config();
const { google } = require('googleapis');
const readline = require('readline');

// Ensure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET are set in your environment
const CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI || 'urn:ietf:wg:oauth:2.0:oob';

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET in environment.');
  console.error('Copy values into .env or export them, then re-run this script.');
  process.exit(1);
}

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);

const SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/calendar.events'
];

async function main() {
  try {
    const authUrl = oAuth2Client.generateAuthUrl({
      access_type: 'offline', // ensures a refresh_token is returned
      prompt: 'consent',     // force showing consent screen to get refresh token
      scope: SCOPES
    });

    console.log('\n1) Open this URL in your browser and authorize the app:\n');
    console.log(authUrl);
    console.log('\n2) After granting access, you will be given a code. Paste it below.');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('\nEnter the authorization code here: ', async (code) => {
      rl.close();
      try {
        const { tokens } = await oAuth2Client.getToken(code.trim());
        console.log('\nReceived tokens:');
        console.log(JSON.stringify(tokens, null, 2));

        if (tokens.refresh_token) {
          console.log('\n✅ Copy the value of "refresh_token" into your .env as GOOGLE_REFRESH_TOKEN');
        } else {
          console.warn('\n⚠️ No refresh_token returned. This can happen if you previously authorized this client for the same user.');
          console.warn('If no refresh token is returned, re-run the flow with a different account or revoke prior app access in your Google Account -> Security -> Third-party access and try again.');
        }

        console.log('\nExample .env line:');
        console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refresh_token || '<refresh_token_here>'}`);
        process.exit(0);
      } catch (err) {
        console.error('\nError while exchanging code for tokens:');
        console.error(err.response?.data || err.message || err);
        process.exit(1);
      }
    });
  } catch (err) {
    console.error('Unexpected error generating auth URL:', err);
    process.exit(1);
  }
}

main();
