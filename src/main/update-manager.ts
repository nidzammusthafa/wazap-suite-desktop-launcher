import { autoUpdater } from 'electron-updater';
import { app, ipcMain } from 'electron';
import { logger } from './log-manager';

export class UpdateManager {
  constructor() {
    autoUpdater.logger = logger;
    autoUpdater.autoDownload = false; // We want manual control or at least user consent logic usually, but let's stick to simple logic first
    
    // For this implementation, we'll auto download but ask to install? 
    // Or stick to the PRD: "Download di background, install on quit"
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = true;

    this.setupListeners();
  }

  private setupListeners() {
    autoUpdater.on('checking-for-update', () => {
      logger.info('Checking for update...');
    });

    autoUpdater.on('update-available', (info) => {
      logger.info('Update available.', info);
      // Notify renderer
    });

    autoUpdater.on('update-not-available', (info) => {
      logger.info('Update not available.', info);
    });

    autoUpdater.on('error', (err) => {
      logger.error('Error in auto-updater.', err);
    });

    autoUpdater.on('download-progress', (progressObj) => {
      let log_message = "Download speed: " + progressObj.bytesPerSecond;
      log_message = log_message + ' - Downloaded ' + progressObj.percent + '%';
      log_message = log_message + ' (' + progressObj.transferred + "/" + progressObj.total + ')';
      logger.debug(log_message);
    });

    autoUpdater.on('update-downloaded', (info) => {
      logger.info('Update downloaded', info);
      // Could notify user here to restart
    });
  }

  checkForUpdates() {
    if (!app.isPackaged) {
      logger.info('Skipping update check in dev mode');
      return;
    }
    try {
      autoUpdater.checkForUpdatesAndNotify();
    } catch (e) {
      logger.error('Failed to check for updates:', e);
    }
  }
}

export const updateManager = new UpdateManager();
