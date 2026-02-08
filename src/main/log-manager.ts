import log from 'electron-log';
import path from 'path';
import { app } from 'electron';

// Configure logging
log.transports.file.level = 'info';
log.transports.console.level = 'debug';

// Log file location:
// Windows: %USERPROFILE%\AppData\Roaming\<app-name>\logs\main.log
// Linux: ~/.config/<app-name>/logs/main.log
// macOS: ~/Library/Logs/<app-name>/main.log

export const logger = log;

export function setupLogging() {
  logger.info('Logger initialized');
  logger.info(`App Version: ${app.getVersion()}`);
  logger.info(`User Data Path: ${app.getPath('userData')}`);
}
