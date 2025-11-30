const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');
const Store = require('electron-store');

const store = new Store();

let mainWindow;
let statsWindow;

function createWindow() {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    mainWindow = new BrowserWindow({
        width: width,
        height: height,
        transparent: true,
        frame: false,
        alwaysOnTop: true,
        hasShadow: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    mainWindow.setIgnoreMouseEvents(true, { forward: true });
    mainWindow.loadFile('index.html');

    // Open the DevTools.
    // mainWindow.webContents.openDevTools({ mode: 'detach' });

    mainWindow.on('closed', function () {
        mainWindow = null;
    });
}

function createStatsWindow() {
    if (statsWindow) {
        statsWindow.focus();
        return;
    }

    statsWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    statsWindow.loadFile('stats.html');

    statsWindow.on('closed', () => {
        statsWindow = null;
    });
}

app.on('ready', createWindow);

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

app.on('activate', function () {
    if (mainWindow === null) createWindow();
});

// IPC Handlers
ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.setIgnoreMouseEvents(ignore, options);
});

ipcMain.on('open-stats', () => {
    createStatsWindow();
});

ipcMain.on('get-cookies', (event) => {
    event.returnValue = store.get('cookies', []);
});

ipcMain.on('save-cookie', (event, cookieData) => {
    const cookies = store.get('cookies', []);
    cookies.push(cookieData);
    store.set('cookies', cookies);
});
