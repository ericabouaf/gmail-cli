import { Command } from 'commander';
import { getGmailClient, getHeader, getMessageBody } from '../lib/gmail.js';
import { sendEmail, replyToEmail } from '../lib/email-sender.js';
import chalk from 'chalk';

export const emailCommand = new Command('email')
  .description('Manage emails');

// Search command
emailCommand
  .command('search')
  .description('Search for emails')
  .argument('<query>', 'Search query (Gmail search syntax)')
  .option('--json', 'Output in JSON format')
  .option('--max-results <number>', 'Maximum number of results', '10')
  .action(async (query, options) => {
    try {
      const gmail = await getGmailClient();
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: parseInt(options.maxResults),
      });

      const messages = response.data.messages || [];

      if (options.json) {
        console.log(JSON.stringify(messages, null, 2));
        return;
      }

      if (messages.length === 0) {
        console.log('No messages found');
        return;
      }

      console.log(`Found ${messages.length} message(s):\n`);

      // Fetch details for each message
      for (const msg of messages) {
        const detail = await gmail.users.messages.get({
          userId: 'me',
          id: msg.id,
          format: 'metadata',
          metadataHeaders: ['From', 'Subject', 'Date'],
        });

        const from = getHeader(detail, 'From');
        const subject = getHeader(detail, 'Subject');
        const date = getHeader(detail, 'Date');

        console.log(chalk.bold(`ID: ${msg.id}`));
        console.log(`From: ${from}`);
        console.log(`Subject: ${subject}`);
        console.log(`Date: ${date}`);
        console.log('');
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// View command
emailCommand
  .command('view')
  .description('View an email')
  .argument('<messageId>', 'Gmail message ID')
  .option('--json', 'Output in JSON format')
  .option('--format <format>', 'Message format (full, metadata, minimal)', 'full')
  .action(async (messageId, options) => {
    try {
      const gmail = await getGmailClient();
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: options.format,
      });

      if (options.json) {
        console.log(JSON.stringify(message.data, null, 2));
        return;
      }

      // Extract headers
      const from = getHeader(message, 'From');
      const to = getHeader(message, 'To');
      const subject = getHeader(message, 'Subject');
      const date = getHeader(message, 'Date');

      console.log(chalk.bold('\n=== Email Details ===\n'));
      console.log(`${chalk.bold('Message ID:')} ${message.data.id}`);
      console.log(`${chalk.bold('Thread ID:')} ${message.data.threadId}`);
      console.log(`${chalk.bold('From:')} ${from}`);
      console.log(`${chalk.bold('To:')} ${to}`);
      console.log(`${chalk.bold('Subject:')} ${subject}`);
      console.log(`${chalk.bold('Date:')} ${date}`);

      if (message.data.labelIds && message.data.labelIds.length > 0) {
        console.log(`${chalk.bold('Labels:')} ${message.data.labelIds.join(', ')}`);
      }

      // Get body
      const body = getMessageBody(message);

      console.log(chalk.bold('\n=== Body ===\n'));
      if (body.text) {
        console.log(body.text);
      } else if (body.html) {
        console.log('[HTML content - use --format full --json to see raw HTML]');
      } else {
        console.log('[No body content]');
      }

      console.log('');
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Send command
emailCommand
  .command('send')
  .description('Send an email')
  .argument('<to>', 'Recipient email address')
  .requiredOption('--subject <subject>', 'Email subject')
  .option('--bodyTxt <text>', 'Plain text body')
  .option('--bodyHtml <html>', 'HTML body')
  .option('--attach <file...>', 'Attach files (can be repeated)')
  .option('--cc <email...>', 'CC recipients (can be repeated)')
  .option('--bcc <email...>', 'BCC recipients (can be repeated)')
  .option('--json', 'Output in JSON format')
  .action(async (to, options) => {
    try {
      if (!options.bodyTxt && !options.bodyHtml) {
        throw new Error('Either --bodyTxt or --bodyHtml is required');
      }

      const result = await sendEmail({
        to,
        subject: options.subject,
        bodyTxt: options.bodyTxt,
        bodyHtml: options.bodyHtml,
        attachments: options.attach,
        cc: options.cc,
        bcc: options.bcc,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('✓ Email sent successfully'));
        console.log(`  Message ID: ${result.id}`);
        console.log(`  Thread ID: ${result.threadId}`);
        console.log(`  To: ${to}`);
        console.log(`  Subject: ${options.subject}`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Reply command
emailCommand
  .command('reply')
  .description('Reply to an email')
  .argument('<messageId>', 'Gmail message ID to reply to')
  .option('--bodyTxt <text>', 'Plain text reply')
  .option('--bodyHtml <html>', 'HTML reply')
  .option('--attach <file...>', 'Attach files (can be repeated)')
  .option('--quote', 'Include original message in reply')
  .option('--json', 'Output in JSON format')
  .action(async (messageId, options) => {
    try {
      if (!options.bodyTxt && !options.bodyHtml) {
        throw new Error('Either --bodyTxt or --bodyHtml is required');
      }

      const result = await replyToEmail({
        messageId,
        bodyTxt: options.bodyTxt,
        bodyHtml: options.bodyHtml,
        attachments: options.attach,
        quote: options.quote,
      });

      if (options.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(chalk.green('✓ Reply sent successfully'));
        console.log(`  Message ID: ${result.id}`);
        console.log(`  Thread ID: ${result.threadId}`);
        console.log(`  In reply to: ${messageId}`);
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// Label subcommand for emails
const labelSubCommand = emailCommand
  .command('label')
  .description('Manage email labels');

labelSubCommand
  .command('add')
  .description('Add label to an email')
  .argument('<messageId>', 'Gmail message ID')
  .argument('<labelName>', 'Label name')
  .action(async (messageId, labelName) => {
    try {
      const { getLabelIdByName } = await import('../lib/gmail.js');
      const gmail = await getGmailClient();

      const labelId = await getLabelIdByName(labelName);

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          addLabelIds: [labelId],
        },
      });

      console.log(chalk.green('✓ Label added successfully'));
      console.log(`  Message ID: ${messageId}`);
      console.log(`  Label: ${labelName}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

labelSubCommand
  .command('remove')
  .description('Remove label from an email')
  .argument('<messageId>', 'Gmail message ID')
  .argument('<labelName>', 'Label name')
  .action(async (messageId, labelName) => {
    try {
      const { getLabelIdByName } = await import('../lib/gmail.js');
      const gmail = await getGmailClient();

      const labelId = await getLabelIdByName(labelName);

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: [labelId],
        },
      });

      console.log(chalk.green('✓ Label removed successfully'));
      console.log(`  Message ID: ${messageId}`);
      console.log(`  Label: ${labelName}`);
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });
