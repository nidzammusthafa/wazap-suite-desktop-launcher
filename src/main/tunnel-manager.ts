import path from 'path';
import fs from 'fs';
import { app } from 'electron';
import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { logger } from './log-manager';
import { configStore } from './config-store';

export type TunnelStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error';

export class TunnelManager extends EventEmitter {
  private tunnelProcess: ChildProcess | null = null;
  private status: TunnelStatus = 'idle';
  private tunnelUrl: string | null = null;

  getStatus(): TunnelStatus {
    return this.status;
  }

  getTunnelUrl(): string | null {
    return this.tunnelUrl;
  }

  private setStatus(status: TunnelStatus) {
    this.status = status;
    this.emit('status-change', status);
    logger.info(`Tunnel status changed to: ${status}`);
  }

  private getCloudflaredPath(): string {
    const userDataPath = app.getPath('userData');
    // cloudflared is extracted alongside server files
    const serverPath = path.join(userDataPath, 'server', 'cloudflared');
    const executableName = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
    return path.join(serverPath, executableName);
  }

  isCloudflaredAvailable(): boolean {
    const cloudflaredPath = this.getCloudflaredPath();
    return fs.existsSync(cloudflaredPath);
  }

  async start(port: number): Promise<void> {
    if (this.status === 'running' || this.status === 'starting') {
      this.emit('log', 'Tunnel already running or starting.');
      return;
    }

    const cloudflaredPath = this.getCloudflaredPath();
    
    if (!fs.existsSync(cloudflaredPath)) {
      this.emit('log', 'ERROR: cloudflared executable not found.');
      this.emit('log', 'Please ensure cloudflared.exe is bundled with the application.');
      this.setStatus('error');
      throw new Error('cloudflared executable not found');
    }

    this.setStatus('starting');
    this.emit('log', 'Starting Cloudflare Tunnel...');
    
    try {
      // Use quick tunnel (no account required)
      // Format: cloudflared tunnel --url http://localhost:PORT
      const tunnelToken = configStore.get('tunneling')?.tunnelToken;
      
      let args: string[];
      
      if (tunnelToken) {
        // Named tunnel with token
        args = ['tunnel', 'run', '--token', tunnelToken];
        this.emit('log', 'Using named tunnel with token...');
      } else {
        // Quick tunnel (trycloudflare.com)
        args = ['tunnel', '--url', `http://localhost:${port}`];
        this.emit('log', 'Using quick tunnel (trycloudflare.com)...');
      }

      this.tunnelProcess = spawn(cloudflaredPath, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true
      });

      this.tunnelProcess.stdout?.on('data', (data) => {
        const msg = data.toString().trim();
        logger.debug(`[TUNNEL] ${msg}`);
        this.emit('log', `[Tunnel] ${msg}`);
        this.parseTunnelOutput(msg);
      });

      this.tunnelProcess.stderr?.on('data', (data) => {
        const msg = data.toString().trim();
        logger.debug(`[TUNNEL] ${msg}`);
        // cloudflared outputs most info to stderr
        this.emit('log', `[Tunnel] ${msg}`);
        this.parseTunnelOutput(msg);
      });

      this.tunnelProcess.on('error', (err) => {
        logger.error('Tunnel process failed:', err);
        this.emit('log', `Tunnel error: ${err.message}`);
        this.setStatus('error');
        this.emit('error', err);
      });

      this.tunnelProcess.on('close', (code) => {
        logger.info(`Tunnel process exited with code ${code}`);
        this.tunnelUrl = null;
        this.emit('url-change', null);
        if (this.status !== 'stopping') {
          this.setStatus('idle');
        }
        this.tunnelProcess = null;
      });

    } catch (error: any) {
      logger.error('Failed to start tunnel:', error);
      this.emit('log', `Failed to start tunnel: ${error.message}`);
      this.setStatus('error');
      throw error;
    }
  }

  private parseTunnelOutput(msg: string) {
    // Quick tunnel URL pattern: https://xxx-xxx-xxx.trycloudflare.com
    // Named tunnel: Connection xxx registered
    
    const quickTunnelMatch = msg.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
    if (quickTunnelMatch) {
      this.tunnelUrl = quickTunnelMatch[0];
      this.emit('log', `Tunnel URL: ${this.tunnelUrl}`);
      this.emit('url-change', this.tunnelUrl);
      
      // Save to config
      const tunneling = configStore.get('tunneling') || { enabled: false, provider: 'cloudflare' as const };
      configStore.set('tunneling', { ...tunneling, tunnelUrl: this.tunnelUrl });
      
      this.setStatus('running');
    }
    
    // Check for named tunnel connection
    if (msg.includes('Connection') && msg.includes('registered')) {
      // For named tunnels, we need to get the URL from config or show generic message
      const savedUrl = configStore.get('tunneling')?.tunnelUrl;
      if (savedUrl && !savedUrl.includes('trycloudflare')) {
        this.tunnelUrl = savedUrl;
        this.emit('url-change', this.tunnelUrl);
      }
      this.setStatus('running');
    }
    
    // Check for errors
    if (msg.includes('failed') || msg.includes('error')) {
      if (!this.tunnelUrl) {
        // Only set error if we haven't successfully connected
        this.setStatus('error');
      }
    }
  }

  async stop(): Promise<void> {
    if (!this.tunnelProcess) {
      return;
    }

    this.setStatus('stopping');
    this.emit('log', 'Stopping tunnel...');

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        if (this.tunnelProcess) {
          logger.warn('Tunnel did not stop gracefully, force killing...');
          this.emit('log', 'Force killing tunnel process...');
          this.tunnelProcess.kill('SIGKILL');
          this.tunnelProcess = null;
          this.tunnelUrl = null;
          this.emit('url-change', null);
          this.setStatus('idle');
          resolve();
        }
      }, 5000);

      this.tunnelProcess?.on('exit', () => {
        clearTimeout(timeout);
        this.tunnelProcess = null;
        this.tunnelUrl = null;
        this.emit('url-change', null);
        this.emit('log', 'Tunnel stopped.');
        this.setStatus('idle');
        resolve();
      });

      this.tunnelProcess?.kill('SIGTERM');
    });
  }
}

export const tunnelManager = new TunnelManager();
