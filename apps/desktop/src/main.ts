import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  shell,
  type HandlerDetails,
  type MenuItemConstructorOptions,
  type MessageBoxOptions,
} from 'electron';
import fs from 'node:fs/promises';
import path from 'node:path';

const packagedWebDistPath = path.resolve(process.resourcesPath, 'web-dist/index.html');
const packagedWebDistIconPath = path.resolve(process.resourcesPath, 'web-dist/icon.ico');
const webDistPath = app.isPackaged
  ? packagedWebDistPath
  : path.resolve(__dirname, '../../web/dist/index.html');
const webDistIconPath = app.isPackaged
  ? packagedWebDistIconPath
  : path.resolve(__dirname, '../../web/dist/icon.ico');
const webAssetsIconPath = path.resolve(__dirname, '../../web/assets/icon.ico');
const preloadPath = path.resolve(__dirname, './preload.js');
const supportedLogExtensions = new Set(['.log']);
const devServerUrl = getDevServerUrl();

type WindowContext = {
  window: BrowserWindow;
  rendererReady: boolean;
  queuedLogs: OpenLogPayload[];
  openedLogPath?: string;
};

const windowContexts = new Map<number, WindowContext>();
const startupQueuedLogPaths: string[] = [];

type DesktopPreferences = {
  suppressLogAssociationPrompt?: boolean;
};

type OpenLogPayload = {
  fileName: string;
  rawText: string;
};

queueOpenLogsFromArgv(process.argv, startupQueuedLogPaths);

async function createWindow(initialLogPath?: string) {
  const normalizedInitialLogPath = initialLogPath
    ? normalizeLogPath(initialLogPath)
    : undefined;

  if (normalizedInitialLogPath) {
    const existingContext = getWindowContextForLogPath(normalizedInitialLogPath);

    if (existingContext) {
      focusWindow(existingContext.window);
      return existingContext.window;
    }
  }

  const iconPath = devServerUrl ? webAssetsIconPath : webDistIconPath;

  const window = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: 'SF Profiler',
    icon: iconPath,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      preload: preloadPath,
    },
  });

  const context: WindowContext = {
    window,
    rendererReady: false,
    queuedLogs: [],
    openedLogPath: normalizedInitialLogPath,
  };

  windowContexts.set(window.id, context);

  if (initialLogPath) {
    await enqueueLogPathForWindow(window.id, initialLogPath);
  }

  window.on('closed', () => {
    windowContexts.delete(window.id);
  });

  window.webContents.on('did-finish-load', () => {
    void flushQueuedLogsForWindow(window.id);
  });

  window.webContents.setWindowOpenHandler(({ url }: HandlerDetails) => {
    if (isExternalUrlAllowed(url)) {
      void shell.openExternal(url);
    }

    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (devServerUrl && isSameOrigin(url, devServerUrl)) {
      return;
    }

    event.preventDefault();

    if (isExternalUrlAllowed(url)) {
      void shell.openExternal(url);
    }
  });

  if (devServerUrl) {
    await window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    await window.loadFile(webDistPath);
  }

  return window;
}

app.on('open-file', (event, filePath) => {
  event.preventDefault();

  if (!isSupportedLogPath(filePath)) {
    return;
  }

  if (app.isReady()) {
    void createWindow(filePath);
    return;
  }

  queueOpenLogPath(filePath, startupQueuedLogPaths);
});

app.whenReady().then(async () => {
  ipcMain.on('sfdc-profiler:renderer-ready', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);

    if (!window) {
      return;
    }

    const context = windowContexts.get(window.id);

    if (!context) {
      return;
    }

    context.rendererReady = true;
    void flushQueuedLogsForWindow(window.id);
  });

  setAppMenu();

  const initialPaths = dedupePaths(startupQueuedLogPaths);

  if (initialPaths.length > 0) {
    for (const logPath of initialPaths) {
      await createWindow(logPath);
    }
  } else {
    await createWindow();
  }

  await maybePromptForLogAssociation();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createWindow();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

function queueOpenLogPath(filePath: string, targetQueue: string[]) {
  if (!isSupportedLogPath(filePath)) {
    return;
  }

  const normalizedPath = normalizeLogPath(filePath);

  if (!targetQueue.includes(normalizedPath)) {
    targetQueue.push(normalizedPath);
  }
}

function queueOpenLogsFromArgv(argv: string[], targetQueue: string[]) {
  for (const argument of argv) {
    queueOpenLogPath(argument, targetQueue);
  }
}

function dedupePaths(filePaths: string[]): string[] {
  return [...new Set(filePaths)];
}

function isSupportedLogPath(filePath: string): boolean {
  if (!filePath) {
    return false;
  }

  const extension = path.extname(filePath).toLowerCase();

  return supportedLogExtensions.has(extension);
}

function getDevServerUrl(): string | undefined {
  if (app.isPackaged || !process.env.VITE_DEV_SERVER_URL) {
    return undefined;
  }

  try {
    const parsedUrl = new URL(process.env.VITE_DEV_SERVER_URL);

    if (
      parsedUrl.protocol === 'http:' &&
      ['127.0.0.1', 'localhost', '[::1]'].includes(parsedUrl.hostname)
    ) {
      return parsedUrl.toString();
    }
  } catch {
    // Ignore invalid development URLs and fall back to bundled assets.
  }

  return undefined;
}

function isSameOrigin(candidateUrl: string, allowedOriginUrl: string): boolean {
  try {
    return new URL(candidateUrl).origin === new URL(allowedOriginUrl).origin;
  } catch {
    return false;
  }
}

function isExternalUrlAllowed(candidateUrl: string): boolean {
  try {
    const { protocol } = new URL(candidateUrl);
    return protocol === 'https:' || protocol === 'mailto:';
  } catch {
    return false;
  }
}

function normalizeLogPath(filePath: string): string {
  return path.resolve(filePath);
}

function getWindowContextForLogPath(normalizedLogPath: string): WindowContext | undefined {
  for (const context of windowContexts.values()) {
    if (context.window.isDestroyed()) {
      continue;
    }

    if (context.openedLogPath === normalizedLogPath) {
      return context;
    }
  }

  return undefined;
}

function focusWindow(window: BrowserWindow) {
  if (window.isMinimized()) {
    window.restore();
  }

  window.focus();
}

async function enqueueLogPathForWindow(windowId: number, filePath: string) {
  const context = windowContexts.get(windowId);

  if (!context) {
    return;
  }

  try {
    const rawText = await fs.readFile(filePath, 'utf8');
    const payload: OpenLogPayload = {
      fileName: path.basename(filePath),
      rawText,
    };

    context.queuedLogs.push(payload);
    await flushQueuedLogsForWindow(windowId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(
      'Unable to open log file',
      `Could not read ${filePath}.\n\n${message}`
    );
  }
}

async function flushQueuedLogsForWindow(windowId: number) {
  const context = windowContexts.get(windowId);

  if (!context || !context.rendererReady || context.window.isDestroyed()) {
    return;
  }

  while (context.queuedLogs.length > 0 && !context.window.isDestroyed()) {
    const payload = context.queuedLogs.shift();

    if (!payload) {
      continue;
    }

    context.window.webContents.send('sfdc-profiler:open-log', payload);
  }
}

async function maybePromptForLogAssociation() {
  const preferences = await readDesktopPreferences();

  if (preferences.suppressLogAssociationPrompt) {
    return;
  }

  const promptOptions: MessageBoxOptions = {
    type: 'question',
    buttons: ['Not now', 'Show setup steps'],
    defaultId: 1,
    cancelId: 0,
    checkboxLabel: "Don't ask again",
    message: 'Open .log files in SF Profiler?',
    detail:
      'Set SF Profiler as the recommended app for .log files so double-clicking a log opens it directly here.',
  };
  const mainWindowForDialog = getMainWindowForDialog();
  const response = mainWindowForDialog
    ? await dialog.showMessageBox(mainWindowForDialog, promptOptions)
    : await dialog.showMessageBox(promptOptions);

  if (response.checkboxChecked) {
    await writeDesktopPreferences({
      ...preferences,
      suppressLogAssociationPrompt: true,
    });
  }

  if (response.response !== 1) {
    return;
  }

  const platformSteps =
    process.platform === 'darwin'
      ? 'Finder: right-click a .log file -> Get Info -> Open with: SF Profiler -> Change All...'
      : process.platform === 'win32'
        ? 'Windows: right-click a .log file -> Open with -> Choose another app -> SF Profiler -> Always use this app'
        : 'Linux: right-click a .log file -> Properties -> Open With -> SF Profiler -> Set as default';

  const setupOptions: MessageBoxOptions = {
    type: 'info',
    buttons: ['OK'],
    message: 'Set up .log file association',
    detail: platformSteps,
  };

  if (mainWindowForDialog) {
    await dialog.showMessageBox(mainWindowForDialog, setupOptions);
  } else {
    await dialog.showMessageBox(setupOptions);
  }
}

function setAppMenu() {
  const template: MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Window',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            void createWindow();
          },
        },
        { type: 'separator' },
        process.platform === 'darwin' ? { role: 'close' } : { role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        ...(process.platform === 'darwin'
          ? [{ role: 'pasteAndMatchStyle' as const }, { role: 'selectAll' as const }]
          : [{ role: 'selectAll' as const }]),
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      role: 'window',
      submenu: [{ role: 'minimize' }, { role: 'zoom' }],
    },
    {
      role: 'help',
      submenu: [],
    },
  ];

  if (process.platform === 'darwin') {
    template.unshift({ role: 'appMenu' });
  }

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function getMainWindowForDialog() {
  const [firstContext] = windowContexts.values();
  return firstContext?.window;
}

async function readDesktopPreferences(): Promise<DesktopPreferences> {
  try {
    const preferencesPath = getDesktopPreferencesPath();
    const preferencesText = await fs.readFile(preferencesPath, 'utf8');

    return JSON.parse(preferencesText) as DesktopPreferences;
  } catch {
    return {};
  }
}

async function writeDesktopPreferences(preferences: DesktopPreferences) {
  const preferencesPath = getDesktopPreferencesPath();

  await fs.mkdir(path.dirname(preferencesPath), { recursive: true });
  await fs.writeFile(preferencesPath, JSON.stringify(preferences, null, 2), 'utf8');
}

function getDesktopPreferencesPath() {
  return path.join(app.getPath('userData'), 'desktop-preferences.json');
}
