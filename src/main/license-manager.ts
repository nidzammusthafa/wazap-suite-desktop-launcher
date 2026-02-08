import si from 'systeminformation';
import crypto from 'crypto';
import ntpClient from 'ntp-client';
import { logger } from './log-manager';
import { configStore } from './config-store';

const LICENSE_API_URL = 'https://wazap-suite-licence.vercel.app/api/license/validate';

export interface LicenseStatus {
  valid: boolean;
  reason?: string;
  expiresAt?: string; // ISO String
  activated?: boolean;
}

export class LicenseManager {
  
  async getHWID(): Promise<string> {
    try {
      const cpu = await si.cpu();
      const uuid = await si.uuid();
      const baseboard = await si.baseboard();
      
      const rawId = `${cpu.brand}|${uuid.hardware}|${uuid.macs[0]}|${baseboard.serial}`;
      return crypto.createHash('sha256').update(rawId).digest('hex');
    } catch (error) {
      logger.error('Failed to generate HWID:', error);
      throw error;
    }
  }

  async validateLicense(licenseKey: string): Promise<LicenseStatus> {
    try {
      // 1. Check time via NTP
      const timeValid = await this.checkTime();
      if (!timeValid) {
        return { valid: false, reason: 'System time is incorrect. Please sync your clock.' };
      }

      const hwid = await this.getHWID();

      logger.info(`Validating license: ${licenseKey.substring(0, 8)}...`);

      const response = await fetch(LICENSE_API_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          apiKey: licenseKey,
          hwid: hwid,
        }),
      });

      if (!response.ok) {
        throw new Error(`License server returned ${response.status}`);
      }

      const data: LicenseStatus = await response.json();
      
      if (data.valid) {
          configStore.set('licenseKey', licenseKey);
      } else {
          // If explicitly invalid, maybe clear the stored key? 
          // configStore.delete('licenseKey'); // Let's not be too aggressive, maybe user made a typo or server glitch
      }

      return data;
    } catch (error) {
      logger.error('License validation failed:', error);
      return { valid: false, reason: 'Connection error or invalid response from server.' };
    }
  }

  async checkSavedLicense(): Promise<LicenseStatus> {
    const savedKey = configStore.get('licenseKey');
    if (!savedKey) {
      return { valid: false, reason: 'No license key found.' };
    }
    return this.validateLicense(savedKey);
  }

  private checkTime(): Promise<boolean> {
    return new Promise((resolve) => {
      ntpClient.getNetworkTime("pool.ntp.org", 123, (err, date) => {
        if (err) {
          logger.warn('NTP check failed, falling back to system time', err);
          // In strict mode, we might want to return false here
          // For now, allow fallback if NTP is blocked
          resolve(true); 
          return;
        }

        const systemTime = new Date();
        const diff = Math.abs(systemTime.getTime() - date!.getTime());
        
        // Allow 5 minutes drift
        if (diff > 5 * 60 * 1000) {
            logger.warn(`System time drift too large: ${diff}ms`);
            resolve(false);
        } else {
            resolve(true);
        }
      });
    });
  }
}

export const licenseManager = new LicenseManager();
