import nodemailer from 'nodemailer';
import { existsSync, statSync } from 'fs';
import { getGmailClient, getHeader, getMessageBody } from './gmail.js';
import ora from 'ora';

const MAX_MESSAGE_SIZE = 35 * 1024 * 1024; // 35MB

/**
 * Validate file before attaching
 */
function validateAttachment(filePath) {
  if (!existsSync(filePath)) {
    throw new Error(`File not found: ${filePath}\n  → Check that the file path is correct`);
  }

  const stats = statSync(filePath);
  if (stats.size > MAX_MESSAGE_SIZE) {
    throw new Error(
      `File too large: ${filePath}\n  → Size: ${Math.round(stats.size / 1024 / 1024)}MB\n  → Gmail limit: 35MB per message`
    );
  }

  return stats.size;
}

/**
 * Build MIME message using nodemailer
 */
async function buildMimeMessage(options) {
  const { to, from = 'me', subject, bodyTxt, bodyHtml, cc, bcc, attachments = [], headers = {} } = options;

  // Build message config
  const messageConfig = {
    from,
    to,
    subject,
    headers,
  };

  // Add CC/BCC if provided
  if (cc && cc.length > 0) {
    messageConfig.cc = Array.isArray(cc) ? cc.join(', ') : cc;
  }
  if (bcc && bcc.length > 0) {
    messageConfig.bcc = Array.isArray(bcc) ? bcc.join(', ') : bcc;
  }

  // Add body
  if (bodyTxt) {
    messageConfig.text = bodyTxt;
  }
  if (bodyHtml) {
    messageConfig.html = bodyHtml;
  }

  // Add attachments
  if (attachments && attachments.length > 0) {
    let totalSize = 0;
    messageConfig.attachments = attachments.map(filePath => {
      const size = validateAttachment(filePath);
      totalSize += size;
      return { path: filePath };
    });

    if (totalSize > MAX_MESSAGE_SIZE) {
      throw new Error(
        `Message size exceeds Gmail limit (35MB)\n  → Current size: ${Math.round(totalSize / 1024 / 1024)}MB\n  → Remove or compress attachments`
      );
    }
  }

  // Create transport and build message
  const transport = nodemailer.createTransport({ streamTransport: true });
  const info = await transport.sendMail(messageConfig);

  // Get the raw RFC 2822 message from the stream
  const chunks = [];
  for await (const chunk of info.message) {
    chunks.push(chunk);
  }
  const rawMessage = Buffer.concat(chunks).toString();

  // Encode as base64url
  const encodedMessage = Buffer.from(rawMessage)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return encodedMessage;
}

/**
 * Create a draft email
 */
async function createDraft(gmail, encodedMessage, threadId = null) {
  const requestBody = {
    message: {
      raw: encodedMessage,
    },
  };

  if (threadId) {
    requestBody.message.threadId = threadId;
  }

  const response = await gmail.users.drafts.create({
    userId: 'me',
    requestBody,
  });

  return response.data;
}

/**
 * Generate Gmail URL for a draft
 */
function getDraftGmailUrl(draftId) {
  return `https://mail.google.com/mail/u/0/#drafts?compose=${draftId}`;
}

/**
 * Send email
 */
export async function sendEmail(options) {
  const { draft } = options;
  const spinner = ora(draft ? 'Creating draft...' : 'Sending email...').start();

  try {
    const gmail = await getGmailClient();
    const encodedMessage = await buildMimeMessage(options);

    if (draft) {
      const draftData = await createDraft(gmail, encodedMessage);
      spinner.succeed('Draft created');
      return {
        ...draftData,
        gmailUrl: getDraftGmailUrl(draftData.id),
      };
    }

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
      },
    });

    spinner.succeed('Email sent');
    return response.data;
  } catch (error) {
    spinner.fail(draft ? 'Failed to create draft' : 'Failed to send email');
    throw error;
  }
}

/**
 * Reply to email
 */
export async function replyToEmail(options) {
  const { messageId, bodyTxt, bodyHtml, attachments, quote, draft } = options;

  const spinner = ora('Fetching original message...').start();

  try {
    const gmail = await getGmailClient();

    // Fetch original message
    const originalMessage = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    });

    spinner.text = 'Building reply...';

    // Extract threading headers
    const originalMessageId = getHeader(originalMessage, 'Message-ID');
    const originalReferences = getHeader(originalMessage, 'References');
    const originalSubject = getHeader(originalMessage, 'Subject');
    const originalFrom = getHeader(originalMessage, 'From');
    const originalTo = getHeader(originalMessage, 'To');

    if (!originalMessageId) {
      throw new Error('Original message does not have a Message-ID header');
    }

    // Build References header (chain of Message-IDs)
    const references = originalReferences
      ? `${originalReferences} ${originalMessageId}`
      : originalMessageId;

    // Build subject with Re: prefix if not present
    const subject = originalSubject?.startsWith('Re:')
      ? originalSubject
      : `Re: ${originalSubject || ''}`;

    // Extract recipient (reply to sender)
    // Parse email from "Name <email@example.com>" format
    const toMatch = originalFrom?.match(/<(.+?)>/) || [null, originalFrom];
    const to = toMatch[1] || originalFrom;

    // Build body with quote if requested
    let replyBodyTxt = bodyTxt;
    let replyBodyHtml = bodyHtml;

    if (quote) {
      const originalBody = getMessageBody(originalMessage);

      if (bodyTxt && originalBody.text) {
        const quotedText = originalBody.text
          .split('\n')
          .map(line => `> ${line}`)
          .join('\n');
        replyBodyTxt = `${bodyTxt}\n\nOn ${getHeader(originalMessage, 'Date')}, ${originalFrom} wrote:\n${quotedText}`;
      }

      if (bodyHtml && originalBody.html) {
        replyBodyHtml = `${bodyHtml}<br><br><blockquote>${originalBody.html}</blockquote>`;
      }
    }

    spinner.text = draft ? 'Creating reply draft...' : 'Sending reply...';

    // Build reply with threading headers
    const encodedMessage = await buildMimeMessage({
      to,
      subject,
      bodyTxt: replyBodyTxt,
      bodyHtml: replyBodyHtml,
      attachments,
      headers: {
        'In-Reply-To': originalMessageId,
        'References': references,
      },
    });

    const threadId = originalMessage.data.threadId;

    if (draft) {
      const draftData = await createDraft(gmail, encodedMessage, threadId);
      spinner.succeed('Reply draft created');
      return {
        ...draftData,
        gmailUrl: getDraftGmailUrl(draftData.id),
      };
    }

    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId,
      },
    });

    spinner.succeed('Reply sent');
    return response.data;
  } catch (error) {
    spinner.fail(draft ? 'Failed to create reply draft' : 'Failed to send reply');
    throw error;
  }
}
