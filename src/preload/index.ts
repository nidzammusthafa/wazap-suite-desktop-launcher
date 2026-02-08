import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('wazap', {
  server: {
    start: () => ipcRenderer.invoke('server:start'),
    stop: () => ipcRenderer.invoke('server:stop'),
    getStatus: () => ipcRenderer.invoke('server:status'),
    getPort: () => ipcRenderer.invoke('server:get-port'),
    setPort: (port: number) => ipcRenderer.invoke('server:set-port', port),
    onLog: (callback: (msg: string) => void) => {
      const handler = (_: any, msg: string) => callback(msg);
      ipcRenderer.on('server:log', handler);
      return () => ipcRenderer.removeListener('server:log', handler);
    },
    onStatusChange: (callback: (status: string) => void) => {
      const handler = (_: any, status: string) => callback(status);
      ipcRenderer.on('server:status', handler);
      return () => ipcRenderer.removeListener('server:status', handler);
    }
  },
  tunnel: {
    start: () => ipcRenderer.invoke('tunnel:start'),
    stop: () => ipcRenderer.invoke('tunnel:stop'),
    getStatus: () => ipcRenderer.invoke('tunnel:status'),
    isAvailable: () => ipcRenderer.invoke('tunnel:is-available'),
    setToken: (token: string) => ipcRenderer.invoke('tunnel:set-token', token),
    getToken: () => ipcRenderer.invoke('tunnel:get-token'),
    onStatusChange: (callback: (status: string) => void) => {
      const handler = (_: any, status: string) => callback(status);
      ipcRenderer.on('tunnel:status', handler);
      return () => ipcRenderer.removeListener('tunnel:status', handler);
    },
    onUrlChange: (callback: (url: string | null) => void) => {
      const handler = (_: any, url: string | null) => callback(url);
      ipcRenderer.on('tunnel:url', handler);
      return () => ipcRenderer.removeListener('tunnel:url', handler);
    }
  },
  license: {
    validate: (key: string) => ipcRenderer.invoke('license:validate', key),
    getHWID: () => ipcRenderer.invoke('license:get-hwid'),
    checkSaved: () => ipcRenderer.invoke('license:check-saved'),
    clear: () => ipcRenderer.invoke('license:clear'),
  },
  config: {
    get: (key: string) => ipcRenderer.invoke('config:get', key),
    set: (key: string, value: any) => ipcRenderer.invoke('config:set', key, value),
    selectChrome: () => ipcRenderer.invoke('config:select-chrome'),
    getHostedUrl: () => ipcRenderer.invoke('config:get-hosted-url'),
    setHostedUrl: (url: string) => ipcRenderer.invoke('config:set-hosted-url', url),
  },
  window: {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    close: () => ipcRenderer.invoke('window:close'),
  },
  app: {
    getVersion: () => ipcRenderer.invoke('app:version'),
    openExternal: (url: string) => ipcRenderer.invoke('shell:open', url),
    notifyReady: () => ipcRenderer.invoke('app:renderer-ready'),
  }
});
