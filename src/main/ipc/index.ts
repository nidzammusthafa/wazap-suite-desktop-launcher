import { ipcMain, BrowserWindow, shell, dialog, IpcMainInvokeEvent } from 'electron';
import { serverManager } from '../server-manager';
import { licenseManager } from '../license-manager';
import { tunnelManager } from '../tunnel-manager';
import { configStore } from '../config-store';
import { logger } from '../log-manager';

// Flag to ensure handlers are registered only once
let handlersRegistered = false;

function broadcastToWindows(channel: string, ...args: any[]) {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  });
}

export function setupIpcHandlers() {
  if (handlersRegistered) {
    logger.info('IPC handlers already registered, skipping.');
    return;
  }

  logger.info('Registering IPC handlers...');

  // --- Server IPC ---
  ipcMain.handle('server:start', async () => {
    return serverManager.start();
  });

  ipcMain.handle('server:stop', async () => {
    return serverManager.stop();
  });

  ipcMain.handle('server:restart', async () => {
    await serverManager.stop();
    // Small delay to ensure port release
    return new Promise<void>((resolve) => {
        setTimeout(async () => {
            await serverManager.start();
            resolve();
        }, 1000);
    });
  });

  ipcMain.handle('server:status', () => {
    return serverManager.getStatus();
  });

  ipcMain.handle('server:get-port', () => {
    return configStore.get('serverPort') || 4000;
  });

  ipcMain.handle('server:set-port', async (_, port: number) => {
    if (port < 1 || port > 65535) {
      throw new Error('Invalid port number');
    }
    configStore.set('serverPort', port);
    logger.info(`Server port changed to ${port}`);
    return true;
  });

  // Global listeners for server events
  serverManager.on('log', (msg) => {
    broadcastToWindows('server:log', msg);
  });

  serverManager.on('status-change', (status) => {
    broadcastToWindows('server:status', status);
  });

  // --- Tunnel IPC ---
  ipcMain.handle('tunnel:start', async () => {
    const port = configStore.get('serverPort') || 4000;
    return tunnelManager.start(port);
  });

  ipcMain.handle('tunnel:stop', async () => {
    return tunnelManager.stop();
  });

  ipcMain.handle('tunnel:status', () => {
    return {
      status: tunnelManager.getStatus(),
      url: tunnelManager.getTunnelUrl(),
    };
  });

  ipcMain.handle('tunnel:is-available', () => {
    return tunnelManager.isCloudflaredAvailable();
  });

  ipcMain.handle('tunnel:set-token', (_, token: string) => {
    const tunneling = configStore.get('tunneling') || { enabled: false, provider: 'cloudflare' as const };
    configStore.set('tunneling', { ...tunneling, tunnelToken: token });
    return true;
  });

  ipcMain.handle('tunnel:get-token', () => {
    return configStore.get('tunneling')?.tunnelToken || '';
  });

  // Tunnel event listeners
  tunnelManager.on('log', (msg) => {
    broadcastToWindows('server:log', msg); // Reuse server log channel
  });

  tunnelManager.on('status-change', (status) => {
    broadcastToWindows('tunnel:status', status);
  });

  tunnelManager.on('url-change', (url) => {
    broadcastToWindows('tunnel:url', url);
  });

  // --- License IPC ---
  ipcMain.handle('license:validate', async (_, key) => {
    return licenseManager.validateLicense(key);
  });

  ipcMain.handle('license:check-saved', async () => {
    return licenseManager.checkSavedLicense();
  });

  ipcMain.handle('license:clear', async () => {
    configStore.delete('licenseKey');
    return true;
  });

  ipcMain.handle('license:get-hwid', async () => {
    return licenseManager.getHWID();
  });

  // --- Config IPC ---
  ipcMain.handle('config:get', (_, key) => {
    return configStore.get(key);
  });

  ipcMain.handle('config:set', (_, key, value) => {
    configStore.set(key, value);
    return true;
  });
  
  ipcMain.handle('config:select-chrome', async (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return null;

    const result = await dialog.showOpenDialog(win, {
      properties: ['openFile'],
      filters: [{ name: 'Executables', extensions: ['exe'] }]
    });
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0];
    }
    return null;
  });

  ipcMain.handle('config:get-hosted-url', () => {
    return configStore.get('hostedClientUrl') || 'https://wazap-suite.vercel.app';
  });

  ipcMain.handle('config:set-hosted-url', (_, url: string) => {
    configStore.set('hostedClientUrl', url);
    return true;
  });

  // --- Window IPC ---
  ipcMain.handle('window:minimize', (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.minimize();
  });

  ipcMain.handle('window:close', (event: IpcMainInvokeEvent) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win?.close();
  });
  
  ipcMain.handle('app:version', () => {
    return require('electron').app.getVersion();
  });

  ipcMain.handle('app:renderer-ready', () => {
    logger.info('Renderer reported ready. Waiting for license check...');
    return true; // Explicitly resolve promise
  });

  ipcMain.handle('shell:open', (_, url) => {
      shell.openExternal(url);
  });

  handlersRegistered = true;
}
