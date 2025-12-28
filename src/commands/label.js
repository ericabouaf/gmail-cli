import { Command } from 'commander';
import { getLabels } from '../lib/gmail.js';
import chalk from 'chalk';

export const labelCommand = new Command('label')
  .description('Manage labels');

labelCommand
  .command('list')
  .description('List all labels')
  .option('--json', 'Output in JSON format')
  .action(async (options) => {
    try {
      const labels = await getLabels(true); // Force refresh

      if (options.json) {
        console.log(JSON.stringify(labels, null, 2));
        return;
      }

      if (labels.length === 0) {
        console.log('No labels found');
        return;
      }

      console.log(`Found ${labels.length} label(s):\n`);

      // Separate system and user labels
      const systemLabels = labels.filter(l => l.type === 'system');
      const userLabels = labels.filter(l => l.type === 'user');

      if (userLabels.length > 0) {
        console.log(chalk.bold('User Labels:'));
        userLabels.forEach(label => {
          console.log(`  ${chalk.green('●')} ${label.name} ${chalk.dim(`(${label.id})`)}`);
        });
        console.log('');
      }

      if (systemLabels.length > 0) {
        console.log(chalk.bold('System Labels:'));
        systemLabels.forEach(label => {
          console.log(`  ${chalk.blue('●')} ${label.name} ${chalk.dim(`(${label.id})`)}`);
        });
      }
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });
