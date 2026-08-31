import { app, BrowserWindow, dialog, ipcMain, Menu, powerMonitor, Tray } from 'electron';
import { statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { PROVIDERS, lowestRemainingPercent, type ProviderId, type UsageSnapshot } from '../shared/usage';
import { findCliCandidates } from './cli-locator';
import { ProviderService } from './provider-service';
import { SettingsStore } from './settings-store';
import { UsageAlertTracker } from './usage-alerts';
import { createTrayIcon, usageLevel } from './tray-icon';
import { trayTooltip } from './tray-tooltip';

let mainWindow: BrowserWindow | undefined;
let tray: Tray | undefined;
let quitting = false;
let refreshTimer: NodeJS.Timeout | undefined;
let lastRefreshAt = 0;
let refreshInFlight: Promise<ReturnType<ProviderService['getSnapshots']>> | undefined;
const refreshingProviders = new Set<ProviderId>();
let store: SettingsStore;
let providers: ProviderService;
const usageAlerts = new UsageAlertTracker();

// The availability tone is app audio, not a Windows toast sound. This lets it
// play even when the user has silenced operating-system notifications.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

// A second copy would mean a second always-on-top overlay, a second tray icon,
// and a second set of CLI probes every few minutes. Launching again reveals the
// window that already exists instead.
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
app.on('second-instance', () => {
  if (!mainWindow) return;
  mainWindow.showInactive();
  mainWindow.focus();
});

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

/**
 * A read can take several seconds per CLI, and the timer and the tray start
 * them too. Announcing which providers are still being read lets any open
 * window show progress per card, no matter who asked for the refresh.
 */
function announceRefreshState() {
  mainWindow?.webContents.send('usage:refresh-state', [...refreshingProviders]);
}

function refresh() {
  if (refreshInFlight) return refreshInFlight;
  for (const provider of PROVIDERS) refreshingProviders.add(provider);
  announceRefreshState();
  refreshInFlight = (async () => providers.refreshAll((snapshot) => {
    // Publishing each provider as it settles keeps Codex, which answers in
    // seconds, from waiting on a Claude terminal session that can take half a minute.
    refreshingProviders.delete(snapshot.provider);
    mainWindow?.webContents.send('usage:snapshots', providers.getSnapshots());
    updateTray(providers.getSnapshots());
    announceRefreshState();
    const alerts = usageAlerts.observe([snapshot]);
    if (alerts.length) mainWindow?.webContents.send('usage:alerts', alerts);
  }))().finally(() => {
    refreshInFlight = undefined;
    refreshingProviders.clear();
    lastRefreshAt = Date.now();
    announceRefreshState();
    configureRefreshTimer();
  });
  return refreshInFlight;
}

/**
 * Windows owns the login item, so it is asked rather than trusted from the
 * settings file. A portable build is skipped on purpose: it would register the
 * temporary unpack path, which is gone by the next boot.
 */
function applyStartWithWindows(start: boolean): boolean {
  if (!app.isPackaged) return start;
  app.setLoginItemSettings({ openAtLogin: start, path: app.getPath('exe') });
  return app.getLoginItemSettings().openAtLogin;
}

/**
 * Each completed read schedules the next one, rather than a fixed interval that
 * a suspended machine silently skips. The delay is measured from the last read
 * that actually happened, so waking up late shortens the wait instead of
 * hiding it.
 */
function configureRefreshTimer() {
  if (refreshTimer) clearTimeout(refreshTimer);
  const intervalMs = store.get().refreshMinutes * 60_000;
  const waited = lastRefreshAt ? Date.now() - lastRefreshAt : 0;
  refreshTimer = setTimeout(() => void refresh(), Math.max(1_000, intervalMs - waited));
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

/** Keeps the tray answering "how much is left" without opening the window. */
function updateTray(snapshots: UsageSnapshot[]) {
  if (!tray) return;
  tray.setToolTip(trayTooltip(snapshots, isSpanish() ? 'sin dato' : 'no data'));
  tray.setImage(createTrayIcon(usageLevel(lowestRemainingPercent(snapshots))));
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
  // The losing instance is already quitting; building a window and tray here
  // would flash a second overlay before it goes.
  if (!hasSingleInstanceLock) return;
  store = new SettingsStore();
  // Windows may have dropped the login item since last run, so reconcile the
  // stored preference against what the operating system actually reports.
  store.update({ startWithWindows: applyStartWithWindows(store.get().startWithWindows) });
  providers = new ProviderService(() => store.get());
  createWindow();
  createTray();
  configureRefreshTimer();
  void refresh();

  // Timers do not fire while the machine is asleep, and coming back to a
  // days-old number is exactly when the user is about to trust it.
  powerMonitor.on('resume', () => void refresh());

  ipcMain.handle('usage:get', () => providers.getSnapshots());
  // The first refresh starts before the window finishes loading, so a fresh
  // renderer asks for the state instead of waiting for an event it missed.
  ipcMain.handle('usage:refreshing-providers', () => [...refreshingProviders]);
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
  ipcMain.handle('settings:set-start-with-windows', (_event, start: unknown) => {
    if (typeof start !== 'boolean') throw new Error('Start with Windows must be boolean.');
    return store.update({ startWithWindows: applyStartWithWindows(start) });
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
