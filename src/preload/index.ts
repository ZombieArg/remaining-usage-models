import { contextBridge, ipcRenderer } from 'electron';
import type { AvailabilityRestoredEvent, UsageBridge, UsageSnapshot } from '../shared/usage';

const bridge: UsageBridge = {
  getSnapshots: () => ipcRenderer.invoke('usage:get'),
  refresh: () => ipcRenderer.invoke('usage:refresh'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setRefreshMinutes: (minutes) => ipcRenderer.invoke('settings:set-refresh-minutes', minutes),
  setCompactMode: (compact) => ipcRenderer.invoke('settings:set-compact-mode', compact),
  selectClaudeWorkspace: () => ipcRenderer.invoke('settings:select-claude-workspace'),
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
  onAvailabilityRestored: (listener) => {
    const callback = (_event: Electron.IpcRendererEvent, events: AvailabilityRestoredEvent[]) => listener(events);
    ipcRenderer.on('usage:availability-restored', callback);
    return () => ipcRenderer.removeListener('usage:availability-restored', callback);
  },
};

contextBridge.exposeInMainWorld('usage', bridge);
