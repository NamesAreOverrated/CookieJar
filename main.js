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
        alwaysOnTop: false,
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
        frame: false, // Hide native border
        show: false, // Don't show until ready to avoid blank screen
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    statsWindow.loadFile('stats.html');

    statsWindow.once('ready-to-show', () => {
        statsWindow.show();
    });

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
    let cookies = store.get('cookies', []);
    let changed = false;
    cookies = cookies.map((c, i) => {
        if (!c.id) {
            c.id = Date.now().toString() + '-' + i + '-' + Math.random().toString(36).substr(2, 5);
            changed = true;
        } else if (typeof c.id !== 'string') {
            c.id = String(c.id);
            changed = true;
        }
        return c;
    });
    if (changed) {
        store.set('cookies', cookies);
    }
    event.returnValue = cookies;
});

ipcMain.on('save-cookie', (event, cookieData) => {
    const cookies = store.get('cookies', []);
    // Ensure unique ID
    cookieData.id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    cookies.push(cookieData);
    store.set('cookies', cookies);
    if (statsWindow) statsWindow.webContents.send('data-changed');
    event.returnValue = true;
});

ipcMain.on('update-cookie', (event, updatedCookie) => {
    const cookies = store.get('cookies', []);
    // Use loose comparison or string conversion to be safe
    const index = cookies.findIndex(c => String(c.id) === String(updatedCookie.id));
    if (index !== -1) {
        cookies[index] = { ...cookies[index], ...updatedCookie };
        store.set('cookies', cookies);
        if (statsWindow) statsWindow.webContents.send('data-changed');
        event.returnValue = true;
    } else {
        event.returnValue = false;
    }
});

ipcMain.on('delete-cookie', (event, cookieId) => {
    let cookies = store.get('cookies', []);
    const cookieToDelete = cookies.find(c => String(c.id) === String(cookieId));
    if (cookieToDelete) {
        cookies = cookies.filter(c => String(c.id) !== String(cookieId));
        store.set('cookies', cookies);

        // Notify renderer to remove a visual cookie
        if (mainWindow) {
            mainWindow.webContents.send('cookie-deleted', cookieToDelete);
        }
        if (statsWindow) statsWindow.webContents.send('data-changed');
        event.returnValue = true;
    } else {
        event.returnValue = false;
    }
});

// Project Management IPC
ipcMain.on('get-projects', (event) => {
    event.returnValue = store.get('projects', []);
});

ipcMain.on('update-project', (event, updatedProject) => {
    const projects = store.get('projects', []);
    // Check uniqueness (excluding self)
    const exists = projects.some(p => p.name === updatedProject.name && p.id !== updatedProject.id);
    if (exists) {
        event.returnValue = { success: false, error: 'Project name already exists' };
        return;
    }

    const index = projects.findIndex(p => p.id === updatedProject.id);
    if (index !== -1) {
        projects[index] = { ...projects[index], ...updatedProject };
        store.set('projects', projects);
        if (statsWindow) statsWindow.webContents.send('data-changed');
        event.returnValue = { success: true };
    } else {
        event.returnValue = { success: false, error: 'Project not found' };
    }
});

ipcMain.on('save-project', (event, project) => {
    const projects = store.get('projects', []);

    if (project.id) {
        // Update existing
        const index = projects.findIndex(p => p.id === project.id);
        if (index !== -1) {
            // Check uniqueness excluding self
            const nameExists = projects.some(p => p.name === project.name && p.id !== project.id);
            if (nameExists) {
                event.returnValue = { success: false, error: 'Project name already exists' };
                return;
            }
            projects[index] = { ...projects[index], ...project };
        } else {
            event.returnValue = { success: false, error: 'Project not found' };
            return;
        }
    } else {
        // Create new
        // Check uniqueness
        const exists = projects.some(p => p.name === project.name);
        if (exists) {
            event.returnValue = { success: false, error: 'Project name already exists' };
            return;
        }

        project.id = Date.now().toString();
        project.status = 'active';
        project.createdAt = Date.now();
        projects.push(project);
    }
    store.set('projects', projects);
    if (statsWindow) statsWindow.webContents.send('data-changed');
    event.returnValue = { success: true, project };
}); ipcMain.on('archive-project', (event, projectId) => {
    const projects = store.get('projects', []);
    const index = projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
        projects[index].status = 'archived';
        store.set('projects', projects);
        if (statsWindow) statsWindow.webContents.send('data-changed');
    }
    event.returnValue = true;
});

ipcMain.on('activate-project', (event, projectId) => {
    const projects = store.get('projects', []);
    const index = projects.findIndex(p => p.id === projectId);
    if (index !== -1) {
        projects[index].status = 'active';
        store.set('projects', projects);
        if (statsWindow) statsWindow.webContents.send('data-changed');
    }
    event.returnValue = true;
});

ipcMain.on('delete-project', (event, projectId) => {
    let projects = store.get('projects', []);
    const projectIndex = projects.findIndex(p => p.id === projectId);

    if (projectIndex !== -1) {
        // Remove project
        projects.splice(projectIndex, 1);
        store.set('projects', projects);

        // Remove associated cookies
        let cookies = store.get('cookies', []);
        const initialCount = cookies.length;
        cookies = cookies.filter(c => c.projectId !== projectId);

        if (cookies.length !== initialCount) {
            store.set('cookies', cookies);
            // Notify renderer to refresh if needed (though stats window usually reloads data)
            if (mainWindow) {
                // We might want to trigger a refresh of the jar, but since cookies are removed from store,
                // the next refreshJar() call or app restart will clear them.
                // To be immediate, we can send a signal.
                mainWindow.webContents.send('refresh-jar');
            }
        }
        if (statsWindow) statsWindow.webContents.send('data-changed');
        event.returnValue = true;
    } else {
        event.returnValue = false;
    }
});

ipcMain.on('import-data', (event, data) => {
    try {
        if (data.projects && Array.isArray(data.projects)) {
            store.set('projects', data.projects);
        }
        if (data.cookies && Array.isArray(data.cookies)) {
            store.set('cookies', data.cookies);
        }
        if (statsWindow) statsWindow.webContents.send('data-changed');
        if (mainWindow) mainWindow.webContents.send('refresh-jar');
        event.returnValue = { success: true };
    } catch (error) {
        event.returnValue = { success: false, error: error.message };
    }
});