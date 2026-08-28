import { app, BrowserWindow, dialog, ipcMain, Menu, Tray } from 'electron';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROVIDERS, type ProviderId } from '../shared/usage';
import { findCliCandidates } from './cli-locator';
import { ProviderService } from './provider-service';
import { SettingsStore } from './settings-store';
import { AvailabilityAlertTracker } from './availability-alert';
import { createTrayIcon } from './tray-icon';

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let quitting = false;
let refreshTimer: NodeJS.Timeout | undefined;
let refreshInFlight: Promise<ReturnType<ProviderService['getSnapshots']>> | undefined;
let store: SettingsStore;
let providers: ProviderService;
const availabilityAlerts = new AvailabilityAlertTracker();

// The availability tone is app audio, not a Windows toast sound. This lets it
// play even when the user has silenced operating-system notifications.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

function isSpanish() {
  return app.getLocale().toLocaleLowerCase().startsWith('es');
}

process.on('uncaughtException', (error) => console.error('Fatal main-process error:', error));
process.on('unhandledRejection', (reason) => console.error('Unhandled main-process rejection:', reason));

function assertProvider(value: unknown): ProviderId {
  if (!PROVIDERS.includes(value as ProviderId)) throw new Error('Unknown provider.');
  return value as ProviderId;
}

/** Pins a CLI path and invalidates discovery so the next read uses it immediately. */
function pinCliPath(provider: ProviderId, cliPath: unknown) {
  if (typeof cliPath !== 'string' || !cliPath.trim()) throw new Error('CLI path must be a string.');
  if (!statSync(cliPath).isFile()) throw new Error('Selected CLI path is not a file.');
  const settings = store.update({ cliPaths: { [provider]: cliPath } });
  providers.forgetResolvedCommand(provider);
  return settings;
}

function refresh() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    await providers.refreshAll();
    const snapshots = providers.getSnapshots();
    mainWindow?.webContents.send('usage:snapshots', snapshots);
    const restored = availabilityAlerts.observe(snapshots);
    if (restored.length) mainWindow?.webContents.send('usage:availability-restored', restored);
    return snapshots;
  })().finally(() => { refreshInFlight = undefined; });
  return refreshInFlight;
}

function configureRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => void refresh(), store.get().refreshMinutes * 60_000);
}

function applyCompactMode(compactMode: boolean) {
  if (!mainWindow) return;
  mainWindow.setMinimumSize(340, compactMode ? 150 : 280);
  mainWindow.setSize(compactMode ? 380 : 420, compactMode ? 190 : 475);
}

function createWindow() {
  const settings = store.get();
  mainWindow = new BrowserWindow({
    width: settings.compactMode ? 380 : 420,
    height: settings.compactMode ? 190 : 475,
    minWidth: 340,
    minHeight: settings.compactMode ? 150 : 280,
    show: false,
    frame: false,
    transparent: false,
    resizable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    x: settings.windowBounds?.x,
    y: settings.windowBounds?.y,
    backgroundColor: '#10131d',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false,
    },
  });
  mainWindow.setAlwaysOnTop(true, 'floating');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  mainWindow.loadFile(join(__dirname, '../../renderer/index.html'));
  mainWindow.once('ready-to-show', () => mainWindow?.showInactive());
  mainWindow.on('move', () => {
    const [x, y] = mainWindow?.getPosition() ?? [];
    if (Number.isInteger(x) && Number.isInteger(y)) store.update({ windowBounds: { x, y } });
  });
  mainWindow.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      mainWindow?.hide();
    }
  });
}

function createTray() {
  tray = new Tray(createTrayIcon());
  tray.setToolTip('Remaining Usage');
  tray.on('click', () => {
    if (mainWindow?.isVisible()) mainWindow.hide();
    else mainWindow?.showInactive();
  });
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: isSpanish() ? 'Mostrar monitor' : 'Show monitor', click: () => mainWindow?.showInactive() },
    { label: isSpanish() ? 'Actualizar ahora' : 'Refresh now', click: () => void refresh() },
    { type: 'separator' },
    { label: isSpanish() ? 'Salir' : 'Quit', click: () => { quitting = true; app.quit(); } },
  ]));
}

app.whenReady().then(() => {
  store = new SettingsStore();
  providers = new ProviderService(() => store.get());
  createWindow();
  createTray();
  configureRefreshTimer();
  void refresh();

  ipcMain.handle('usage:get', () => providers.getSnapshots());
  ipcMain.handle('usage:refresh', () => refresh());
  ipcMain.handle('settings:get', () => store.get());
  ipcMain.handle('settings:set-refresh-minutes', (_event, minutes: unknown) => {
    if (!Number.isInteger(minutes) || (minutes as number) < 1 || (minutes as number) > 60) {
      throw new Error('El intervalo debe estar entre 1 y 60 minutos.');
    }
    const settings = store.update({ refreshMinutes: minutes as number });
    configureRefreshTimer();
    return settings;
  });
  ipcMain.handle('settings:set-compact-mode', (_event, compact: unknown) => {
    if (typeof compact !== 'boolean') throw new Error('Compact mode must be boolean.');
    const settings = store.update({ compactMode: compact });
    applyCompactMode(settings.compactMode);
    return settings;
  });
  ipcMain.handle('settings:select-claude-workspace', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: isSpanish() ? 'Elegí la carpeta de trabajo de Claude' : 'Choose Claude workspace',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return store.get();
    const folder = result.filePaths[0];
    if (!statSync(folder).isDirectory()) throw new Error('Selected Claude workspace is not a directory.');
    return store.update({ claudeWorkspace: folder });
  });
  ipcMain.handle('cli:find-candidates', (_event, provider: unknown) => findCliCandidates(assertProvider(provider)));
  ipcMain.handle('settings:set-cli-path', async (_event, provider: unknown, cliPath: unknown) => {
    const settings = pinCliPath(assertProvider(provider), cliPath);
    await refresh();
    return settings;
  });
  ipcMain.handle('settings:select-cli-path', async (_event, provider: unknown) => {
    const id = assertProvider(provider);
    const [suggestion] = await findCliCandidates(id);
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: isSpanish() ? `Elegí el ejecutable de ${id}` : `Choose the ${id} executable`,
      defaultPath: suggestion ? dirname(suggestion) : app.getPath('home'),
      properties: ['openFile'],
      filters: [{ name: isSpanish() ? 'Ejecutables' : 'Executables', extensions: ['exe'] }],
    });
    if (result.canceled || !result.filePaths[0]) return store.get();
    const settings = pinCliPath(id, result.filePaths[0]);
    await refresh();
    return settings;
  });
  ipcMain.handle('window:minimize', () => mainWindow?.minimize());
  ipcMain.handle('system:locale', () => app.getLocale());
}).catch((error) => {
  console.error('Unable to initialize Remaining Usage:', error);
  app.quit();
});

app.on('window-all-closed', () => undefined);
app.on('before-quit', () => { quitting = true; });
