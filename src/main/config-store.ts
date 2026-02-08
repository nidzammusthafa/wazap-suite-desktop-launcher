import Store from 'electron-store';

interface AppConfig {
  chromePath: string;
  serverPort: number;
  serverVersion: string;
  tunneling: {
    enabled: boolean;
    provider: 'cloudflare';
    tunnelToken?: string;
    tunnelUrl?: string;
  };
  licenseKey?: string;
  hostedClientUrl: string;
}

const schema = {
  chromePath: {
    type: 'string',
    default: '',
  },
  serverPort: {
    type: 'number',
    default: 4000,
  },
  serverVersion: {
    type: 'string',
    default: '0.0.0',
  },
  tunneling: {
    type: 'object',
    properties: {
      enabled: { type: 'boolean', default: false },
      provider: { type: 'string', default: 'cloudflare' },
      tunnelToken: { type: 'string' },
      tunnelUrl: { type: 'string' },
    },
    default: {
      enabled: false,
      provider: 'cloudflare',
    },
  },
  licenseKey: {
    type: 'string',
  },
  hostedClientUrl: {
    type: 'string',
    default: 'https://wazap-suite.vercel.app',
  },
} as const;

export const configStore = new Store<AppConfig>({ schema: schema as any });
