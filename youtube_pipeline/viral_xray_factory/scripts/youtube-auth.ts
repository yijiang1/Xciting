// One-time helper to mint YOUTUBE_REFRESH_TOKEN. Requires YOUTUBE_CLIENT_ID
// and YOUTUBE_CLIENT_SECRET already in .env.local (from a Google Cloud
// Console OAuth client of type "Desktop app" -- that type accepts any
// localhost port as a redirect URI without pre-registering it).
//
// Opens a browser consent screen, catches the redirect on a local server,
// exchanges the code for tokens, and prints the refresh token to paste into
// .env.local.
//
// Usage: npm run youtube-auth

import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import dotenv from 'dotenv';
import {execa} from 'execa';
import {google} from 'googleapis';

const root = process.cwd();
dotenv.config({path: path.resolve(root, '../.env.local')});
dotenv.config({path: path.resolve(root, '.env.local')});

const PORT = 53682;
const redirectUri = `http://localhost:${PORT}`;

const SCOPES = ['https://www.googleapis.com/auth/youtube', 'https://www.googleapis.com/auth/yt-analytics.readonly'];

const run = async () => {
  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error(
      'Missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET in .env.local.\n' +
        'Get them from Google Cloud Console -> APIs & Services -> Credentials -> Create OAuth client ID (type "Desktop app"), then add both to .env.local and re-run this.',
    );
    process.exit(1);
  }

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  const authUrl = oauth2Client.generateAuthUrl({access_type: 'offline', prompt: 'consent', scope: SCOPES});

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', redirectUri);
    const code = url.searchParams.get('code');
    const error = url.searchParams.get('error');

    if (error) {
      res.end(`Consent denied (${error}). Close this tab and check the terminal.`);
      console.error(`Google returned an error: ${error}`);
      server.close();
      process.exit(1);
    }
    if (!code) {
      res.end('No authorization code received. Close this tab and check the terminal.');
      return;
    }

    res.end('Success! You can close this tab and go back to the terminal.');
    server.close();

    try {
      const {tokens} = await oauth2Client.getToken(code);
      if (!tokens.refresh_token) {
        console.error(
          'Google did not return a refresh_token (it only issues one on first consent).\n' +
            'Revoke prior access at https://myaccount.google.com/permissions and re-run this script.',
        );
        process.exit(1);
      }
      console.log('\nAdd this line to .env.local:\n');
      console.log(`YOUTUBE_REFRESH_TOKEN=${tokens.refresh_token}`);
      process.exit(0);
    } catch (err) {
      console.error('Token exchange failed:', err instanceof Error ? err.message : err);
      process.exit(1);
    }
  });

  server.listen(PORT, async () => {
    console.log(`Log in with the Google account that owns your YouTube channel.\n`);
    console.log(`If a browser tab does not open automatically, visit:\n${authUrl}\n`);
    await execa('open', [authUrl]).catch(() => {});
  });
};

run();
