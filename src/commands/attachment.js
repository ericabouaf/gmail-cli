import { Command } from 'commander';
import { getGmailClient, formatFileSize } from '../lib/gmail.js';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import chalk from 'chalk';
import ora from 'ora';

export const attachmentCommand = new Command('attachment')
  .description('Manage email attachments');

attachmentCommand
  .command('download')
  .description('Download an attachment')
  .argument('<attachmentId>', 'Attachment ID')
  .requiredOption('--message-id <messageId>', 'Message ID containing the attachment')
  .requiredOption('--out <path>', 'Output file path')
  .action(async (attachmentId, options) => {
    const spinner = ora('Downloading attachment...').start();

    try {
      const gmail = await getGmailClient();

      // Get attachment
      const attachment = await gmail.users.messages.attachments.get({
        userId: 'me',
        messageId: options.messageId,
        id: attachmentId,
      });

      if (!attachment.data || !attachment.data.data) {
        throw new Error('Attachment data not found');
      }

      // Decode base64url
      const data = Buffer.from(
        attachment.data.data.replace(/-/g, '+').replace(/_/g, '/'),
        'base64'
      );

      // Ensure output directory exists
      const outputDir = dirname(options.out);
      if (!existsSync(outputDir)) {
        mkdirSync(outputDir, { recursive: true });
      }

      // Write file
      writeFileSync(options.out, data);

      spinner.succeed('Attachment downloaded');
      console.log(`  File: ${options.out}`);
      console.log(`  Size: ${formatFileSize(data.length)}`);
    } catch (error) {
      spinner.fail('Failed to download attachment');
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

// List attachments in a message
attachmentCommand
  .command('list')
  .description('List attachments in a message')
  .argument('<messageId>', 'Gmail message ID')
  .option('--json', 'Output in JSON format')
  .action(async (messageId, options) => {
    try {
      const gmail = await getGmailClient();

      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const attachments = [];

      function findAttachments(part) {
        if (part.filename && part.body && part.body.attachmentId) {
          attachments.push({
            id: part.body.attachmentId,
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body.size,
          });
        }

        if (part.parts) {
          part.parts.forEach(findAttachments);
        }
      }

      if (message.data.payload) {
        findAttachments(message.data.payload);
      }

      if (options.json) {
        console.log(JSON.stringify(attachments, null, 2));
        return;
      }

      if (attachments.length === 0) {
        console.log('No attachments found');
        return;
      }

      console.log(`Found ${attachments.length} attachment(s):\n`);

      attachments.forEach((att, index) => {
        console.log(chalk.bold(`${index + 1}. ${att.filename}`));
        console.log(`   ID: ${att.id}`);
        console.log(`   Type: ${att.mimeType}`);
        console.log(`   Size: ${formatFileSize(att.size)}`);
        console.log('');
      });

      console.log(chalk.dim('To download: gmail attachment download <attachmentId> --message-id <messageId> --out <path>'));
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });
