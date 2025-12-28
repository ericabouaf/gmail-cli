import { OAuth2Client } from 'google-auth-library';
import { google } from 'googleapis';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';
import http from 'http';
import { URL } from 'url';

const CONFIG_DIR = join(homedir(), '.config', 'gmail');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/gmail.modify',
];

// Current active profile
let currentProfile = 'default';

/**
 * Set the active profile
 */
export function setProfile(profileName) {
  currentProfile = profileName;
}

/**
 * Get the current profile name
 */
export function getProfile() {
  return currentProfile;
}

/**
 * Get token file path for current profile
 */
function getTokenFile() {
  return join(CONFIG_DIR, `${currentProfile}.token.json`);
}

/**
 * Load configuration from ~/.config/gmail/config.json
 */
export function loadConfig() {
  if (!existsSync(CONFIG_FILE)) {
    throw new Error(`Config file not found at ${CONFIG_FILE}\nPlease create it with a profiles section`);
  }

  try {
    const config = JSON.parse(readFileSync(CONFIG_FILE, 'utf8'));

    if (!config.profiles) {
      throw new Error('No "profiles" section found in config.json');
    }

    const profileConfig = config.profiles[currentProfile];
    if (!profileConfig) {
      const availableProfiles = Object.keys(config.profiles).join(', ');
      throw new Error(`Profile "${currentProfile}" not found in config.json\nAvailable profiles: ${availableProfiles}`);
    }

    if (!profileConfig.GMAIL_OAUTH_PATH) {
      throw new Error(`GMAIL_OAUTH_PATH not found in profile "${currentProfile}"`);
    }

    return profileConfig;
  } catch (error) {
    if (error.message.includes('profiles') || error.message.includes('Profile')) {
      throw error;
    }
    throw new Error(`Failed to parse config file: ${error.message}`);
  }
}

/**
 * Load OAuth credentials
 */
export function loadCredentials() {
  const config = loadConfig();

  if (!existsSync(config.GMAIL_OAUTH_PATH)) {
    throw new Error(`OAuth credentials file not found at ${config.GMAIL_OAUTH_PATH}`);
  }

  try {
    const credentials = JSON.parse(readFileSync(config.GMAIL_OAUTH_PATH, 'utf8'));

    // Support both installed and web application credentials
    const creds = credentials.installed || credentials.web;
    if (!creds) {
      throw new Error('Invalid credentials format. Expected "installed" or "web" object.');
    }

    return creds;
  } catch (error) {
    throw new Error(`Failed to load OAuth credentials: ${error.message}`);
  }
}

const REDIRECT_PORT = 3000;
const REDIRECT_URI = `http://localhost:${REDIRECT_PORT}`;

/**
 * Create OAuth2 client
 */
export function createOAuth2Client() {
  const credentials = loadCredentials();
  return new OAuth2Client(
    credentials.client_id,
    credentials.client_secret,
    REDIRECT_URI
  );
}

/**
 * Load saved token if it exists
 */
export function loadToken() {
  const tokenFile = getTokenFile();
  if (!existsSync(tokenFile)) {
    return null;
  }

  try {
    return JSON.parse(readFileSync(tokenFile, 'utf8'));
  } catch (error) {
    return null;
  }
}

/**
 * Save token to disk
 */
export function saveToken(token) {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(getTokenFile(), JSON.stringify(token, null, 2));
}

/**
 * Get authenticated OAuth2 client
 */
export async function getAuthClient() {
  const oauth2Client = createOAuth2Client();
  const token = loadToken();

  if (!token) {
    throw new Error('Not authenticated. Please run: gmail auth login');
  }

  oauth2Client.setCredentials(token);

  // Check if token needs refresh
  if (token.expiry_date && token.expiry_date < Date.now()) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      saveToken(credentials);
      oauth2Client.setCredentials(credentials);
    } catch (error) {
      throw new Error('Token expired and refresh failed. Please run: gmail auth login');
    }
  }

  return oauth2Client;
}

/**
 * Perform OAuth login flow
 */
export async function login() {
  const oauth2Client = createOAuth2Client();

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
  });

  console.log('Authorize this app by visiting this url:');
  console.log(authUrl);
  console.log('\nWaiting for authorization...');

  // Start local server to capture redirect
  const code = await new Promise((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      try {
        const url = new URL(req.url, REDIRECT_URI);
        if (url.pathname === '/') {
          const code = url.searchParams.get('code');
          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html', 'Connection': 'close' });
            res.end('<h1>Authentication successful!</h1><p>You can close this window.</p>');
            resolve(code);
          } else {
            res.writeHead(400, { 'Content-Type': 'text/html', 'Connection': 'close' });
            res.end('<h1>Authentication failed</h1><p>No code received.</p>');
            reject(new Error('No code received'));
          }
          // Close server and all connections
          server.closeAllConnections();
          server.close();
        }
      } catch (error) {
        server.closeAllConnections();
        server.close();
        reject(error);
      }
    });

    server.listen(REDIRECT_PORT, () => {
      console.log(`Local server started on ${REDIRECT_URI}`);
    });
  });

  // Exchange code for token
  const { tokens } = await oauth2Client.getToken(code);
  saveToken(tokens);
  oauth2Client.setCredentials(tokens);

  // Display authentication status
  console.log('\n✓ Authentication successful!');

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
  const profile = await gmail.users.getProfile({ userId: 'me' });

  console.log(`Email: ${profile.data.emailAddress}`);

  const tokenInfo = await oauth2Client.getTokenInfo(tokens.access_token);
  console.log('Scopes:');
  if (tokenInfo.scopes) {
    tokenInfo.scopes.forEach(scope => console.log(` - ${scope}`));
  } else {
    console.log(' - Unknown');
  }

  if (tokens.expiry_date) {
    const expiresAt = new Date(tokens.expiry_date);
    console.log(`Token expires: ${expiresAt.toLocaleString()}`);
  }
}

/**
 * Logout (remove token)
 */
export async function logout() {
  const tokenFile = getTokenFile();
  if (existsSync(tokenFile)) {
    const { unlinkSync } = await import('fs');
    unlinkSync(tokenFile);
    console.log('✓ Logged out successfully');
  } else {
    console.log('Not currently logged in');
  }
}

/**
 * Check authentication status
 */
export async function checkStatus() {
  const initialToken = loadToken();

  if (!initialToken) {
    console.log('Status: Not authenticated');
    console.log('Run "gmail auth login" to authenticate');
    return;
  }

  try {
    // Use getAuthClient which handles token refresh automatically
    const oauth2Client = await getAuthClient();

    // Use Gmail API to get user profile (includes email address)
    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });
    const profile = await gmail.users.getProfile({ userId: 'me' });

    console.log('Status: Authenticated');
    console.log(`Email: ${profile.data.emailAddress}`);

    // Reload token to get potentially refreshed expiry date
    const token = loadToken();

    // Get token info for scopes
    const tokenInfo = await oauth2Client.getTokenInfo(token.access_token);
    console.log('Scopes:');
    if (tokenInfo.scopes) {
      tokenInfo.scopes.forEach(scope => console.log(` - ${scope}`));
    } else {
      console.log(' - Unknown');
    }

    if (token.expiry_date) {
      const expiresAt = new Date(token.expiry_date);
      console.log(`Token expires: ${expiresAt.toLocaleString()}`);
    }
  } catch (error) {
    console.log('Status: Token expired or invalid');
    console.log('Run "gmail auth login" to re-authenticate');
  }
}
