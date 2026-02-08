import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import { logger } from './log-manager';
import { configStore } from './config-store';
import { EventEmitter } from 'events';

export type ServerStatus = 'idle' | 'extracting' | 'migrating' | 'starting' | 'running' | 'stopping' | 'error';

export class ServerManager extends EventEmitter {
  private serverProcess: ChildProcess | null = null;
  private status: ServerStatus = 'idle';
  private port = 4000;

  constructor() {
    super();
    this.port = configStore.get('serverPort') || 4000;
  }

  getStatus(): ServerStatus {
    return this.status;
  }

  getPort(): number {
    return this.port;
  }

  private setStatus(status: ServerStatus) {
    this.status = status;
    this.emit('status-change', status);
    // Also emit log for status change to ensure visibility
    this.emit('log', `Status changed to: ${status.toUpperCase()}`);
    logger.info(`Server status changed to: ${status}`);
  }

  async start() {
    if (this.status === 'running' || this.status === 'starting') {
      this.emit('log', 'Server start requested but already running/starting.');
      return;
    }

    // Re-read port from config in case it was changed
    this.port = configStore.get('serverPort') || 4000;

    try {
      this.emit('log', 'Starting initialization sequence...');
      await this.extractServerIfNeeded();
      await this.ensureDatabase();
      await this.spawnServer();
    } catch (error: any) {
      const errorMsg = error.message || String(error);
      logger.error('Failed to start server:', error);
      this.emit('log', `CRITICAL ERROR: ${errorMsg}`);
      this.setStatus('error');
      this.emit('error', error);
    }
  }

  async stop() {
    if (!this.serverProcess) return;

    this.setStatus('stopping');
    this.emit('log', 'Stopping server process...');
    logger.info('Stopping server...');

    return new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        if (this.serverProcess) {
          logger.warn('Server did not stop gracefully, force killing...');
          this.emit('log', 'Server unresponsive, force killing...');
          this.serverProcess.kill('SIGKILL');
          this.serverProcess = null;
          this.setStatus('idle');
          resolve();
        }
      }, 5000);

      this.serverProcess?.on('exit', () => {
        clearTimeout(timeout);
        this.serverProcess = null;
        this.emit('log', 'Server stopped gracefully.');
        this.setStatus('idle');
        resolve();
      });

      this.serverProcess?.kill('SIGTERM');
    });
  }

  private async extractServerIfNeeded() {
    const userDataPath = app.getPath('userData');
    const serverExtractPath = path.join(userDataPath, 'server');
    const serverZipPath = app.isPackaged
      ? path.join(process.resourcesPath, 'server.zip')
      : path.join(app.getAppPath(), 'resources', 'server.zip');

    const currentAppVersion = app.getVersion();
    const lastExtractedVersion = configStore.get('serverVersion');

    this.emit('log', `Checking server resources (App Ver: ${currentAppVersion}, Extracted: ${lastExtractedVersion})...`);
    
    // Check main executable
    const exeName = process.platform === 'win32' ? 'main.exe' : 'main';
    const exePath = path.join(serverExtractPath, exeName);
    
    // Check cloudflared executable
    const cloudflaredName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    const cloudflaredPath = path.join(serverExtractPath, 'cloudflared', cloudflaredName);

    // Force extract if files missing or version changed
    const needsExtraction = 
        !fs.existsSync(exePath) || 
        !fs.existsSync(cloudflaredPath) || 
        currentAppVersion !== lastExtractedVersion;

    if (needsExtraction) {
      logger.info(`Extracting server from ${serverZipPath} to ${serverExtractPath}...`);
      this.emit('log', `Extracting server resources... This may take a moment.`);
      this.setStatus('extracting');

      if (!fs.existsSync(serverZipPath)) {
        throw new Error(`Server zip not found at: ${serverZipPath}`);
      }

      // Cleanup old extraction
      if (fs.existsSync(serverExtractPath)) {
        this.emit('log', 'Cleaning up old server files...');
        try {
            fs.rmSync(serverExtractPath, { recursive: true, force: true });
        } catch (e) {
            this.emit('log', `Warning: Failed to clean old files: ${e}`);
        }
      }
      
      fs.mkdirSync(serverExtractPath, { recursive: true });

      this.emit('log', 'Unzipping archive...');
      const zip = new AdmZip(serverZipPath);
      zip.extractAllTo(serverExtractPath, true);

      configStore.set('serverVersion', currentAppVersion);
      logger.info('Server extraction complete.');
      this.emit('log', 'Extraction complete.');
    } else {
      logger.info('Server already extracted and up to date.');
      this.emit('log', 'Server resources are up to date.');
    }
  }

  private async ensureDatabase() {
    this.setStatus('migrating');
    this.emit('log', 'Checking database integrity...');
    const userDataPath = app.getPath('userData');
    const dbPath = path.join(userDataPath, 'data.db');
    const initialDbPath = path.join(userDataPath, 'server', 'initial.db');

    // Copy initial.db if data.db doesn't exist
    if (!fs.existsSync(dbPath)) {
        if (fs.existsSync(initialDbPath)) {
            logger.info('Initializing new database from template...');
            this.emit('log', 'Creating new database from template...');
            fs.copyFileSync(initialDbPath, dbPath);
        } else {
            logger.warn('initial.db not found, skipping database initialization. Server might create it.');
            this.emit('log', 'Warning: Initial database template not found.');
        }
    }

    // Run migrations using better-sqlite3
    try {
      this.emit('log', 'Verifying database connection...');
      const db = new Database(dbPath);
      
      // Enable WAL mode for better concurrency
      db.pragma('journal_mode = WAL');
      
      db.close();
      logger.info('Database check complete.');
      this.emit('log', 'Database check passed.');
    } catch (error) {
      logger.error('Database migration failed:', error);
      throw error;
    }
  }

  private async spawnServer() {
    this.setStatus('starting');
    const userDataPath = app.getPath('userData');
    const serverPath = path.join(userDataPath, 'server');
    const executableName = process.platform === 'win32' ? 'main.exe' : 'main';
    const executablePath = path.join(serverPath, executableName);

    if (!fs.existsSync(executablePath)) {
      throw new Error(`Server executable not found at: ${executablePath}`);
    }

    const env = {
      ...process.env,
      PORT: this.port.toString(),
      DATABASE_URL: `file:${path.join(userDataPath, 'data.db')}`,
      CHROME_PATH: configStore.get('chromePath') || '',
      // Add other necessary env vars
      NODE_ENV: 'production',
      PUPPETEER_SKIP_DOWNLOAD: 'true'
    };

    logger.info(`Spawning server: ${executablePath}`);
    
    this.serverProcess = spawn(executablePath, [], {
      cwd: serverPath, // Important: so it finds node_modules in the same dir
      env: env as NodeJS.ProcessEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    });

    this.serverProcess.stdout?.on('data', (data) => {
      const msg = data.toString().trim();
      logger.debug(`[SERVER] ${msg}`);
      this.emit('log', msg);
      
      // Check for ready signal
      if (msg.includes('Nest application successfully started') || msg.includes(`listening on port ${this.port}`)) {
        this.setStatus('running');
      }
    });

    this.serverProcess.stderr?.on('data', (data) => {
      const msg = data.toString().trim();
      logger.error(`[SERVER ERR] ${msg}`);
      this.emit('log', `ERROR: ${msg}`);
    });

    this.serverProcess.on('error', (err) => {
      logger.error('Server process failed to spawn:', err);
      this.setStatus('error');
      this.emit('error', err);
    });

    this.serverProcess.on('close', (code) => {
      logger.info(`Server process exited with code ${code}`);
      if (this.status !== 'stopping') {
        this.setStatus('idle');
      }
      this.serverProcess = null;
    });
  }
}

export const serverManager = new ServerManager();
