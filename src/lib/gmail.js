import { google } from 'googleapis';
import { getAuthClient } from './auth.js';

let gmailClient = null;
let labelCache = null;

/**
 * Get authenticated Gmail client
 */
export async function getGmailClient() {
  if (!gmailClient) {
    const auth = await getAuthClient();
    gmailClient = google.gmail({ version: 'v1', auth });
  }
  return gmailClient;
}

/**
 * Reset Gmail client (useful for testing)
 */
export function resetGmailClient() {
  gmailClient = null;
  labelCache = null;
}

/**
 * Get all labels (with caching)
 */
export async function getLabels(refresh = false) {
  if (!labelCache || refresh) {
    const gmail = await getGmailClient();
    const response = await gmail.users.labels.list({ userId: 'me' });
    labelCache = response.data.labels || [];
  }
  return labelCache;
}

/**
 * Get label ID by display name
 */
export async function getLabelIdByName(labelName) {
  const labels = await getLabels();
  const label = labels.find(l => l.name === labelName);

  if (!label) {
    // Show available labels for better error message
    const availableLabels = labels.map(l => l.name).join(', ');
    throw new Error(
      `Label "${labelName}" not found\nAvailable labels: ${availableLabels}\nUse 'gmail label list' to see all labels`
    );
  }

  return label.id;
}

/**
 * Get header value from message
 */
export function getHeader(message, headerName) {
  const header = message.data.payload.headers.find(
    h => h.name.toLowerCase() === headerName.toLowerCase()
  );
  return header ? header.value : null;
}

/**
 * Decode base64url string
 */
export function decodeBase64Url(str) {
  if (!str) return '';
  // Replace URL-safe characters
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  // Decode
  return Buffer.from(base64, 'base64').toString('utf8');
}

/**
 * Get message body (text or HTML)
 */
export function getMessageBody(message) {
  const payload = message.data.payload;
  let textBody = '';
  let htmlBody = '';

  function extractBody(part) {
    if (part.mimeType === 'text/plain' && part.body.data) {
      textBody = decodeBase64Url(part.body.data);
    } else if (part.mimeType === 'text/html' && part.body.data) {
      htmlBody = decodeBase64Url(part.body.data);
    }

    if (part.parts) {
      part.parts.forEach(extractBody);
    }
  }

  // Check for simple body
  if (payload.body && payload.body.data) {
    if (payload.mimeType === 'text/plain') {
      textBody = decodeBase64Url(payload.body.data);
    } else if (payload.mimeType === 'text/html') {
      htmlBody = decodeBase64Url(payload.body.data);
    }
  }

  // Check for multipart
  if (payload.parts) {
    payload.parts.forEach(extractBody);
  }

  return { text: textBody, html: htmlBody };
}

/**
 * Format file size
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}
