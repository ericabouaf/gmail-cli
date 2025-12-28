import { Command } from 'commander';
import { login, logout, checkStatus } from '../lib/auth.js';

export const authCommand = new Command('auth')
  .description('Manage authentication');

authCommand
  .command('login')
  .description('Authenticate with Gmail')
  .action(async () => {
    try {
      await login();
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

authCommand
  .command('logout')
  .description('Remove authentication credentials')
  .action(async () => {
    try {
      await logout();
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });

authCommand
  .command('status')
  .description('Check authentication status')
  .action(async () => {
    try {
      await checkStatus();
    } catch (error) {
      console.error('Error:', error.message);
      process.exit(1);
    }
  });
