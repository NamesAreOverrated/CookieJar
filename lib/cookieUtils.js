const Store = require('electron-store');
const store = new Store();

// Utilities for cookie handling and validation
function ensureId(c, idx) {
    if (!c.id) return Date.now().toString() + '-' + idx + '-' + Math.random().toString(36).substr(2, 6);
    return String(c.id);
}

function normalizeCookie(raw, idx = 0) {
    const c = Object.assign({}, raw);
    c.id = ensureId(c, idx);
    // timestamps may be strings or numbers
    c.timestamp = c.timestamp ? Number(c.timestamp) : Date.now();
    if (isNaN(c.timestamp)) c.timestamp = Date.now();
    c.createdAt = c.createdAt ? Number(c.createdAt) : c.timestamp;
    c.level = Number(c.level) || 1;
    c.projectId = c.projectId ? String(c.projectId) : null;
    c.note = c.note ? String(c.note) : '';
    // no expiry field — app no longer uses expiresAt
    return c;
}

function getRawStoreCookies() {
    return store.get('cookies', []);
}

function getCookies() {
    const raw = getRawStoreCookies();
    const normalized = raw.map((c, i) => normalizeCookie(c, i));
    // persist normalization if any mutation happened (ids changed types etc.)
    if (JSON.stringify(raw) !== JSON.stringify(normalized)) {
        store.set('cookies', normalized);
    }
    return normalized;
}

function saveCookie(data) {
    const cookies = getCookies();
    const idx = cookies.length;
    const c = normalizeCookie(data, idx);
    c.id = Date.now().toString() + '-' + Math.random().toString(36).substr(2, 9);
    c.createdAt = Date.now();
    cookies.push(c);
    store.set('cookies', cookies);
    return c;
}

function updateCookie(updated) {
    const cookies = getCookies();
    const id = String(updated.id);
    const index = cookies.findIndex(c => String(c.id) === id);
    if (index === -1) return false;
    const merged = Object.assign({}, cookies[index], updated);
    cookies[index] = normalizeCookie(merged, index);
    cookies[index].updatedAt = Date.now();
    store.set('cookies', cookies);
    return true;
}

function deleteCookie(id) {
    const cookies = getCookies();
    const sid = String(id);
    const index = cookies.findIndex(c => String(c.id) === sid);
    if (index === -1) return null;
    const removed = cookies.splice(index, 1)[0];
    store.set('cookies', cookies);
    return removed;
}

// expiry removed: no cleanup function

function importData(data) {
    if (!data) return { success: false, error: 'No data' };
    try {
        if (Array.isArray(data.cookies)) {
            const normalized = data.cookies.map((c, i) => normalizeCookie(c, i));
            store.set('cookies', normalized);
        }
        if (Array.isArray(data.projects)) {
            store.set('projects', data.projects);
        }
        return { success: true };
    } catch (err) {
        return { success: false, error: err.message };
    }
}

module.exports = {
    getCookies,
    saveCookie,
    updateCookie,
    deleteCookie,
    importData,
};
