import { app, BrowserWindow, screen } from 'electron';
import path from 'path';
import { setupLogging, logger } from './log-manager';
import { setupIpcHandlers } from './ipc';
import { serverManager } from './server-manager';
import { tunnelManager } from './tunnel-manager';
import { updateManager } from './update-manager';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

let mainWindow: BrowserWindow | null = null;
let isQuitting = false;

// 1. Setup Logging early
setupLogging();

// 2. Register IPC Handlers once globally
// Moved to app.on('ready')

const createWindow = () => {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true // Enabled for debugging
    },
    frame: false, // Use custom titlebar
    backgroundColor: '#1e1e1e',
    show: false,
    title: 'WazapSuite Launcher',
    icon: app.isPackaged ? undefined : path.join(__dirname, '../../resources/icon.ico')
  });

  // Load the index.html of the app.
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
    
    // Check for updates
    updateManager.checkForUpdates();
  });

  // Open DevTools in dev mode
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }
};

app.on('ready', () => {
  setupIpcHandlers();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

// Ensure graceful shutdown
app.on('before-quit', async (event) => {
    if (isQuitting) return;

    const serverStatus = serverManager.getStatus();
    const tunnelStatus = tunnelManager.getStatus();
    
    // If server or tunnel is active, we must stop them first
    if (['running', 'starting', 'extracting', 'migrating'].includes(serverStatus) || 
        ['running', 'starting'].includes(tunnelStatus)) {
        event.preventDefault();
        logger.info('Gracefully stopping services before quit...');
        
        try {
            // Stop tunnel first
            if (['running', 'starting'].includes(tunnelStatus)) {
                await tunnelManager.stop();
            }
            // Then stop server
            if (['running', 'starting', 'extracting', 'migrating'].includes(serverStatus)) {
                await serverManager.stop();
            }
        } catch (err) {
            logger.error('Error stopping services:', err);
        } finally {
            isQuitting = true;
            app.quit();
        }
    } else {
        isQuitting = true;
    }
});
