import { contextBridge, ipcRenderer } from 'electron';
import type { ProviderId, UsageAlertEvent, UsageBridge, UsageSnapshot } from '../shared/usage';

const bridge: UsageBridge = {
  getSnapshots: () => ipcRenderer.invoke('usage:get'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  refreshingProviders: () => ipcRenderer.invoke('usage:refreshing-providers'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setRefreshMinutes: (minutes) => ipcRenderer.invoke('settings:set-refresh-minutes', minutes),
  setCompactMode: (compact) => ipcRenderer.invoke('settings:set-compact-mode', compact),
  selectClaudeWorkspace: () => ipcRenderer.invoke('settings:select-claude-workspace'),
  setStartWithWindows: (start) => ipcRenderer.invoke('settings:set-start-with-windows', start),
  findCliCandidates: (provider) => ipcRenderer.invoke('cli:find-candidates', provider),
  setCliPath: (provider, path) => ipcRenderer.invoke('settings:set-cli-path', provider, path),
  selectCliPath: (provider) => ipcRenderer.invoke('settings:select-cli-path', provider),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  getSystemLocale: () => ipcRenderer.invoke('system:locale'),
  onSnapshots: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, snapshots: UsageSnapshot[]) => listener(snapshots);
    ipcRenderer.on('usage:snapshots', callback);
    return () => ipcRenderer.removeListener('usage:snapshots', callback);
  },
  onRefreshState: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, providers: ProviderId[]) => listener(providers);
    ipcRenderer.on('usage:refresh-state', callback);
    return () => ipcRenderer.removeListener('usage:refresh-state', callback);
  },
  onUsageAlerts: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, events: UsageAlertEvent[]) => listener(events);
    ipcRenderer.on('usage:alerts', callback);
    return () => ipcRenderer.removeListener('usage:alerts', callback);
  },
};

contextBridge.exposeInMainWorld('usage', bridge);
