#!/usr/bin/env node

import { Command } from 'commander';
import { authCommand } from './commands/auth.js';
import { emailCommand } from './commands/email.js';
import { labelCommand } from './commands/label.js';
import { attachmentCommand } from './commands/attachment.js';
import { setProfile } from './lib/auth.js';

const program = new Command();

program
  .name('gmail')
  .description('Gmail CLI tool')
  .version('1.2.0')
  .option('--profile <name>', 'Profile to use', 'default');

// Set profile before any command runs
program.hook('preAction', () => {
  setProfile(program.opts().profile);
});

// Add subcommands
program.addCommand(authCommand);
program.addCommand(emailCommand);
program.addCommand(labelCommand);
program.addCommand(attachmentCommand);

program.parse();
