const { ipcRenderer, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');

// State
let projects = [];
let cookies = [];
let projectStats = {};
let editingId = null;
let currentView = 'dashboard';
let activeTagFilter = null;

// DOM Elements
const pages = {
    dashboard: document.getElementById('dashboard'),
    projects: document.getElementById('projects'),
    data: document.getElementById('data'),
    projectDetails: document.getElementById('project-details')
};

const navItems = {
    dashboard: document.getElementById('nav-dashboard'),
    projects: document.getElementById('nav-projects'),
    data: document.getElementById('nav-data')
};

// Initialization
function init() {
    loadData();
    setupEventListeners();
    showPage('dashboard');
}

// Listen for data changes from main process
ipcRenderer.on('data-changed', () => {
    loadData();
    // If we are in project details, we might need to refresh that specific view
    if (currentView === 'projectDetails') {
        const currentProjectName = document.getElementById('pd-name').innerText;
        const p = projects.find(p => p.name === currentProjectName);
        if (p) openProjectDetails(p);
    }
});

function loadData() {
    projects = ipcRenderer.sendSync('get-projects');
    cookies = ipcRenderer.sendSync('get-cookies');

    // Compute project stats for performance
    projectStats = {};
    cookies.forEach(c => {
        if (!projectStats[c.projectId]) {
            projectStats[c.projectId] = { cookieCount: 0, lastActive: 0 };
        }
        projectStats[c.projectId].cookieCount++;
        if (c.timestamp > projectStats[c.projectId].lastActive) {
            projectStats[c.projectId].lastActive = c.timestamp;
        }
    });

    if (currentView === 'dashboard') renderDashboard();
    if (currentView === 'projects') renderProjects(activeTagFilter);
}

function setupEventListeners() {
    // Navigation
    navItems.dashboard.addEventListener('click', () => showPage('dashboard'));
    navItems.projects.addEventListener('click', () => {
        // Don't reset filter immediately if we want to keep state, but usually nav click means "reset"
        // activeTagFilter = null; 
        showPage('projects');
    });
    navItems.data.addEventListener('click', () => showPage('data'));

    // Data Management
    const btnExportJson = document.getElementById('btn-export-json');
    if (btnExportJson) btnExportJson.addEventListener('click', exportJSON);

    const btnImportJson = document.getElementById('btn-import-json');
    if (btnImportJson) btnImportJson.addEventListener('click', () => {
        document.getElementById('file-import-json').click();
    });

    const fileImportJson = document.getElementById('file-import-json');
    if (fileImportJson) fileImportJson.addEventListener('change', handleImportJSON);

    const btnExportLogseq = document.getElementById('btn-export-logseq');
    if (btnExportLogseq) btnExportLogseq.addEventListener('click', exportLogseq);

    // Search & Filter
    const searchInput = document.getElementById('project-search');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            renderProjects(activeTagFilter, e.target.value);
        });
    }

    // Modals
    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('modal-save-btn').addEventListener('click', handleSave);

    // Window Controls
    const closeBtn = document.getElementById('win-close-btn');
    if (closeBtn) {
        closeBtn.addEventListener('click', () => {
            window.close();
        });
    }
}

function showPage(pageId) {
    currentView = pageId;

    // Hide all pages
    Object.values(pages).forEach(p => {
        if (p) p.classList.remove('active');
    });

    // Deactivate nav items
    Object.values(navItems).forEach(n => {
        if (n) n.classList.remove('active');
    });

    // Show selected page
    if (pages[pageId]) pages[pageId].classList.add('active');
    if (navItems[pageId]) navItems[pageId].classList.add('active');

    // Refresh data if needed
    if (pageId === 'dashboard') renderDashboard();
    if (pageId === 'projects') renderProjects(activeTagFilter);
}

// --- Dashboard ---
function renderDashboard() {
    // Summary Cards
    document.getElementById('total-cookies').innerText = cookies.length;
    document.getElementById('active-projects').innerText = projects.filter(p => p.status === 'active').length;

    // Calculate Days Active
    const uniqueDays = new Set(cookies.map(c => new Date(c.timestamp).toDateString())).size;
    document.getElementById('total-days').innerText = uniqueDays;

    renderHeatmap();
    renderRecentActivity();
}

function renderHeatmap() {
    const container = document.getElementById('heatmap-grid');
    container.innerHTML = '';

    // 1. Prepare Data Map
    const activityMap = {};
    cookies.forEach(c => {
        const dateStr = new Date(c.timestamp).toDateString(); // "Mon Dec 01 2025"
        activityMap[dateStr] = (activityMap[dateStr] || 0) + 1;
    });

    // 2. Determine Date Range (Last 52 weeks, ending today)
    const today = new Date();
    const endDate = today;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - 365);

    // Adjust start date to the previous Sunday to align grid
    while (startDate.getDay() !== 0) {
        startDate.setDate(startDate.getDate() - 1);
    }

    // 3. Render Grid
    // We iterate day by day from startDate to endDate
    const msPerDay = 24 * 60 * 60 * 1000;
    const totalDays = Math.ceil((endDate - startDate) / msPerDay) + 1;

    for (let i = 0; i < totalDays; i++) {
        const current = new Date(startDate.getTime() + i * msPerDay);
        const dateStr = current.toDateString();
        const count = activityMap[dateStr] || 0;

        let level = 0;
        if (count > 0) level = 1;
        if (count > 2) level = 2;
        if (count > 5) level = 3;
        if (count > 8) level = 4;

        const cell = document.createElement('div');
        cell.className = 'heatmap-cell';
        cell.dataset.level = level;

        // Tooltip
        const niceDate = current.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
        cell.title = `${niceDate}: ${count} cookies`;

        container.appendChild(cell);
    }
}

function renderRecentActivity() {
    const list = document.getElementById('recent-activity-list');
    list.innerHTML = '';

    const recent = [...cookies].sort((a, b) => b.timestamp - a.timestamp).slice(0, 10);

    recent.forEach(c => {
        const project = projects.find(p => p.id === c.projectId);
        const li = createCookieListItem(c, project);
        list.appendChild(li);
    });
}

// --- Projects ---
function renderProjects(filterTag = null, searchQuery = '') {
    const grid = document.getElementById('projects-grid');
    grid.innerHTML = '';

    // Render Tag Filter Bar
    const tagFilterContainer = document.getElementById('project-tags-filter');
    if (tagFilterContainer) {
        tagFilterContainer.innerHTML = '';

        // "All" chip
        const allChip = document.createElement('div');
        allChip.className = `tag-chip ${!filterTag ? 'active' : ''}`;
        allChip.style.padding = '4px 12px';
        allChip.style.fontSize = '0.85rem';
        allChip.innerText = 'All';
        allChip.onclick = () => {
            activeTagFilter = null;
            renderProjects(null, searchQuery);
        };
        tagFilterContainer.appendChild(allChip);

        // Get all unique tags
        const allTags = new Set();
        projects.forEach(p => (p.tags || []).forEach(t => allTags.add(t)));

        Array.from(allTags).sort().forEach(tag => {
            const chip = document.createElement('div');
            chip.className = `tag-chip ${filterTag === tag ? 'active' : ''}`;
            chip.style.padding = '4px 12px';
            chip.style.fontSize = '0.85rem';
            chip.innerText = `#${tag}`;
            chip.onclick = () => {
                activeTagFilter = (activeTagFilter === tag) ? null : tag;
                renderProjects(activeTagFilter, searchQuery);
            };
            tagFilterContainer.appendChild(chip);
        });
    }

    // Filter Logic
    let displayProjects = projects;

    // 1. Tag Filter
    if (filterTag) {
        displayProjects = displayProjects.filter(p => p.tags && p.tags.includes(filterTag));
    }

    // 2. Search Query
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        displayProjects = displayProjects.filter(p =>
            p.name.toLowerCase().includes(q) ||
            (p.tags && p.tags.some(t => t.toLowerCase().includes(q)))
        );
    }

    // Sort: Active first, then by name
    displayProjects.sort((a, b) => {
        if (a.status === b.status) return a.name.localeCompare(b.name);
        return a.status === 'active' ? -1 : 1;
    });

    displayProjects.forEach(p => {
        const card = document.createElement('div');
        card.className = 'project-card';
        if (p.status === 'archived') card.style.opacity = 0.6;

        const stats = projectStats[p.id] || { cookieCount: 0, lastActive: 0 };
        const lastActive = stats.lastActive ? new Date(stats.lastActive).toLocaleDateString() : 'Never';

        // Stop propagation for buttons
        const tagsHtml = (p.tags || []).map(t => `<span class="tag-pill">#${t}</span>`).join('');

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <h3>${p.name} ${p.status === 'archived' ? '(Archived)' : ''}</h3>
            </div>
            <div style="margin-bottom:10px;">
                ${tagsHtml}
            </div>
            <div class="project-stats">
                <span>🍪 ${stats.cookieCount}</span>
                <span>🕒 ${lastActive}</span>
            </div>
        `;

        // Card click -> Details
        card.onclick = (e) => {
            openProjectDetails(p);
        };

        grid.appendChild(card);
    });

    // Add "New Project" card (only if not filtering)
    if (!filterTag && !searchQuery) {
        const newCard = document.createElement('div');
        newCard.className = 'project-card';
        newCard.style.border = '2px dashed #b2bec3';
        newCard.style.display = 'flex';
        newCard.style.alignItems = 'center';
        newCard.style.justifyContent = 'center';
        newCard.style.minHeight = '150px';
        newCard.innerHTML = '<h3 style="margin:0; color:#b2bec3">+ New Project</h3>';
        newCard.onclick = (e) => { e.stopPropagation(); showProjectForm(); };
        grid.appendChild(newCard);
    } else if (displayProjects.length === 0) {
        grid.innerHTML = '<div class="empty-state">No projects found.</div>';
    }
}

function clearTagFilter() {
    activeTagFilter = null;
    document.getElementById('project-search').value = ''; // Clear search too
    renderProjects();
}

function openProjectDetails(project) {
    currentView = 'projectDetails';
    // Hide other pages
    Object.values(pages).forEach(p => { if (p) p.classList.remove('active'); });

    const detailsPage = pages.projectDetails;
    detailsPage.classList.add('active');

    document.getElementById('pd-name').innerText = project.name;
    document.getElementById('pd-tags').innerHTML = (project.tags || []).map(t => `<span class="tag-pill">#${t}</span>`).join('');

    // Stats
    const stats = projectStats[project.id] || { cookieCount: 0, lastActive: 0 };
    document.getElementById('pd-count').innerText = stats.cookieCount;

    // Actions
    const editBtn = document.getElementById('pd-edit-btn');
    editBtn.onclick = () => showProjectForm(project);

    const archiveBtn = document.getElementById('pd-archive-btn');
    archiveBtn.innerText = project.status === 'active' ? 'Archive Project' : 'Restore Project';
    archiveBtn.onclick = () => toggleArchive(project.id, project.status === 'archived');

    const deleteBtn = document.getElementById('pd-delete-btn');
    deleteBtn.onclick = () => deleteProject(project.id);

    // List
    const projectCookies = cookies.filter(c => c.projectId === project.id).sort((a, b) => b.timestamp - a.timestamp);
    const list = document.getElementById('pd-cookie-list');
    list.innerHTML = '';
    projectCookies.forEach(c => {
        list.appendChild(createCookieListItem(c, project));
    });
}

function backToProjects() {
    showPage('projects');
}

// --- Helpers ---
function createCookieListItem(cookie, project) {
    const div = document.createElement('div');
    div.className = 'list-item';

    const date = new Date(cookie.timestamp).toLocaleString();
    const projectName = project ? project.name : 'Unknown';

    // Left content
    const content = document.createElement('div');
    content.className = 'list-item-content';

    const title = document.createElement('div');
    title.style.fontWeight = 600;
    title.style.marginBottom = '4px';
    title.textContent = projectName;

    const noteDiv = document.createElement('div');
    if (cookie.note && cookie.note.length) {
        // Use textContent to avoid injecting HTML
        noteDiv.textContent = cookie.note;
    } else {
        noteDiv.innerHTML = '<span style="color:#b2bec3; font-style:italic;">No note</span>';
    }

    const meta = document.createElement('div');
    meta.className = 'list-item-meta';
    meta.textContent = date;

    content.appendChild(title);
    content.appendChild(noteDiv);
    content.appendChild(meta);

    // Right actions
    const actions = document.createElement('div');

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-sm btn-secondary';
    editBtn.type = 'button';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showCookieForm(cookie.id);
    });

    const delBtn = document.createElement('button');
    delBtn.className = 'btn btn-sm btn-danger';
    delBtn.type = 'button';
    delBtn.textContent = '×';
    delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        deleteCookie(cookie.id);
    });

    actions.appendChild(editBtn);
    actions.appendChild(delBtn);

    div.appendChild(content);
    div.appendChild(actions);

    return div;
}

// --- Modal & Forms ---
function closeModal() {
    document.getElementById('edit-modal').style.display = 'none';
    editingId = null;
}

function showProjectForm(project = null) {
    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    editingId = project ? project.id : null;
    title.innerText = project ? 'Edit Project' : 'New Project';

    // Set type for save handler
    modal.dataset.type = 'project';

    body.innerHTML = `
        <div class="form-group">
            <label>Project Name</label>
            <input type="text" id="input-name" value="${project ? project.name : ''}" placeholder="e.g. Learn Piano">
        </div>
        <div class="form-group">
            <label>Tags (comma separated)</label>
            <input type="text" id="input-tags" value="${project ? (project.tags || []).join(', ') : ''}" placeholder="e.g. music, hobby">
        </div>
    `;

    modal.style.display = 'flex';
    document.getElementById('input-name').focus();
}

function showCookieForm(cookieId) {
    const cookie = cookies.find(c => c.id === cookieId);
    if (!cookie) return;

    const modal = document.getElementById('edit-modal');
    const title = document.getElementById('modal-title');
    const body = document.getElementById('modal-body');

    editingId = cookie.id;
    title.innerText = 'Edit Cookie';
    modal.dataset.type = 'cookie';

    const projectOptions = projects.map(p =>
        `<option value="${p.id}" ${p.id === cookie.projectId ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    // Format timestamp for datetime-local input (YYYY-MM-DDTHH:MM) in local time
    const timestamp = new Date(cookie.timestamp);
    const year = timestamp.getFullYear();
    const month = String(timestamp.getMonth() + 1).padStart(2, '0');
    const day = String(timestamp.getDate()).padStart(2, '0');
    const hours = String(timestamp.getHours()).padStart(2, '0');
    const minutes = String(timestamp.getMinutes()).padStart(2, '0');
    const formattedTimestamp = `${year}-${month}-${day}T${hours}:${minutes}`;

    body.innerHTML = `
        <div class="form-group">
            <label>Project</label>
            <select id="input-project">${projectOptions}</select>
        </div>
        <div class="form-group">
            <label>Note</label>
            <input type="text" id="input-note" value="${(cookie.note || '').replace(/"/g, '&quot;')}">
        </div>
        <div class="form-group">
            <label>Timestamp</label>
            <input type="datetime-local" id="input-timestamp" value="${formattedTimestamp}">
        </div>
    `;

    modal.style.display = 'flex';
}

function handleSave() {
    const modal = document.getElementById('edit-modal');
    const type = modal.dataset.type;

    if (type === 'project') {
        const name = document.getElementById('input-name').value;
        const tagsStr = document.getElementById('input-tags').value;

        if (!name) return alert('Name required');

        const tags = tagsStr.split(',').map(t => t.trim()).filter(t => t);
        const payload = { name, tags };
        if (editingId) payload.id = editingId;

        ipcRenderer.sendSync('save-project', payload);
    } else if (type === 'cookie') {
        const projectId = document.getElementById('input-project').value;
        const note = document.getElementById('input-note').value;
        const timestampStr = document.getElementById('input-timestamp').value;

        // Convert datetime-local to timestamp
        const timestamp = timestampStr ? new Date(timestampStr).getTime() : Date.now();

        ipcRenderer.sendSync('update-cookie', {
            id: editingId,
            projectId,
            note,
            timestamp
        });
    }

    closeModal();
    loadData();

    // Refresh current view if needed
    if (currentView === 'projectDetails') {
        if (type === 'project') {
            const p = projects.find(p => p.id === editingId);
            if (p) openProjectDetails(p);
        } else {
            const currentProjectName = document.getElementById('pd-name').innerText;
            const p = projects.find(p => p.name === currentProjectName);
            if (p) openProjectDetails(p);
        }
    }
}

function toggleArchive(id, isArchived) {
    if (isArchived) {
        ipcRenderer.sendSync('activate-project', id);
    } else {
        ipcRenderer.sendSync('archive-project', id);
    }
    loadData();
    if (currentView === 'projectDetails') {
        const p = projects.find(p => p.id === id);
        if (p) openProjectDetails(p);
    }
}

function deleteProject(id) {
    if (confirm('Are you sure? This will delete the project AND ALL its cookies forever.')) {
        ipcRenderer.sendSync('delete-project', id);
        loadData();
        if (currentView === 'projectDetails') backToProjects();
    }
}

function deleteCookie(id) {
    if (confirm('Delete this cookie?')) {
        ipcRenderer.sendSync('delete-cookie', id);
        loadData();
        // Refresh details view if open
        if (currentView === 'projectDetails') {
            const currentProjectName = document.getElementById('pd-name').innerText;
            const p = projects.find(p => p.name === currentProjectName);
            if (p) openProjectDetails(p);
        }
    }
}

// --- Data Management ---

function exportJSON() {
    const data = {
        projects: projects,
        cookies: cookies,
        exportDate: new Date().toISOString()
    };

    const jsonStr = JSON.stringify(data, null, 2);
    const blob = new Blob([jsonStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `cookiejar-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function handleImportJSON(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            if (!data.projects || !data.cookies) {
                alert('Invalid backup file format.');
                return;
            }

            if (confirm('This will overwrite all current data. Are you sure?')) {
                const result = ipcRenderer.sendSync('import-data', data);
                if (result.success) {
                    alert('Data imported successfully!');
                    loadData();
                } else {
                    alert('Import failed: ' + result.error);
                }
            }
        } catch (err) {
            alert('Error parsing JSON file: ' + err.message);
        }
        // Reset input
        event.target.value = '';
    };
    reader.readAsText(file);
}

function exportLogseq() {
    const today = new Date().toDateString();
    const todayCookies = cookies.filter(c => new Date(c.timestamp).toDateString() === today);

    if (todayCookies.length === 0) {
        showToast('No cookies found for today.', 'error');
        return;
    }

    // --- Prepare stats for achievements ---
    const totalCookies = cookies.length;

    // Project counts (total)
    const projectCounts = {};
    cookies.forEach(c => { projectCounts[c.projectId] = (projectCounts[c.projectId] || 0) + 1; });

    // Tag counts (map tags to cookie counts)
    const tagCounts = {};
    cookies.forEach(c => {
        const proj = projects.find(p => p.id === c.projectId);
        if (proj && proj.tags && proj.tags.length) {
            proj.tags.forEach(t => { tagCounts[t] = (tagCounts[t] || 0) + 1; });
        }
    });

    // Daily counts (for record checks)
    const dailyCounts = {};
    cookies.forEach(c => {
        const d = new Date(c.timestamp).toDateString();
        dailyCounts[d] = (dailyCounts[d] || 0) + 1;
    });

    const todayCount = todayCookies.length;
    let prevBest = 0;
    Object.keys(dailyCounts).forEach(d => { if (d !== today) prevBest = Math.max(prevBest, dailyCounts[d]); });
    const isNewRecord = todayCount > prevBest;

    // Top project today
    const todayProjectCounts = {};
    todayCookies.forEach(c => { todayProjectCounts[c.projectId] = (todayProjectCounts[c.projectId] || 0) + 1; });
    let topProjectTodayId = null;
    let topProjectTodayCount = 0;
    Object.keys(todayProjectCounts).forEach(pid => {
        if (todayProjectCounts[pid] > topProjectTodayCount) {
            topProjectTodayCount = todayProjectCounts[pid];
            topProjectTodayId = pid;
        }
    });

    // --- Compose export text (Logseq-friendly) ---
    // Friendly date for header
    const niceDate = new Date().toLocaleDateString(undefined, { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

    let text = '';
    // Top-level bullet heading (Logseq-friendly) with friendly date
    text += `- 📓 Daily Cookie Log — ${niceDate}\n`;

    // TODAY section as nested bullet under heading (with separator)
    text += `  - ---\n`;
    text += `  - 📅 **Today (${todayCount} cookies)**\n`;

    // Sort today's cookies by timestamp
    todayCookies.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    todayCookies.forEach(c => {
        const project = projects.find(p => p.id === c.projectId);
        const projectName = project ? project.name : 'Unknown Project';

        // Format time HH:MM
        const date = new Date(c.timestamp);
        const timeStr = date.getHours().toString().padStart(2, '0') + ':' + date.getMinutes().toString().padStart(2, '0');

        // Format tags
        let tagsStr = '';
        if (project && project.tags && project.tags.length > 0) {
            tagsStr = ' ' + project.tags.map(t => `#${t}`).join(' ');
        }

        const content = c.note || c.content || '';
        text += `    - ${timeStr} [[${projectName}]]${tagsStr} ${content}\n`;
    });

    text += '\n';

    // ACHIEVEMENTS section as nested bullet under heading (below Today, with separator)
    text += `  - ---\n`;
    text += `  - 🏆 **Notable Achievements**\n`;
    text += `    - **Total cookies:** ${totalCookies}\n`;

    if (isNewRecord) {
        text += `    - 🎉 **New daily record:** ${todayCount} cookies (previous best: ${prevBest})\n`;
    } else if (prevBest > 0) {
        text += `    - **Today:** ${todayCount} cookies (best: ${prevBest})\n`;
    }

    // --- Milestones ---
    // Trigger milestones based only on today's triggered projects/tags.
    // If a project's or tag's total (including today) is a milestone count,
    // report it. We no longer need to compute "before today" counts.

    // Helper
    const isMilestoneCount = (n) => (n === 1) || (n % 5 === 0 && n > 0);

    // Project & Tag milestones: collect unique projects and tags from today's cookies
    // then separately check milestone condition for each.
    const triggeredProjectIds = new Set();
    const triggeredTags = new Set();
    todayCookies.forEach(c => {
        triggeredProjectIds.add(c.projectId);
        const proj = projects.find(p => p.id === c.projectId);
        if (proj && proj.tags && proj.tags.length) {
            proj.tags.forEach(t => triggeredTags.add(t));
        }
    });

    // Project milestones
    triggeredProjectIds.forEach(pid => {
        const total = projectCounts[pid] || 0;
        if (isMilestoneCount(total)) {
            const proj = projects.find(p => p.id === pid);
            const name = proj ? proj.name : pid;
            text += `    - 🏁 [[${name}]] reached ${total} cookies\n`;
        }
    });

    // Tag milestones
    Array.from(triggeredTags).sort().forEach(tag => {
        const total = tagCounts[tag] || 0;
        if (isMilestoneCount(total)) {
            text += `    - ✨ #${tag} reached ${total} cookies\n`;
        }
    });

    // Top project today
    if (topProjectTodayId) {
        const topProject = projects.find(p => p.id === topProjectTodayId);
        const topName = topProject ? topProject.name : 'Unknown';
        text += `    - 🔝 Top project today: [[${topName}]] (${topProjectTodayCount})\n`;
    }

    // Final spacer
    text += '\n';

    clipboard.writeText(text);
    showToast(`Copied ${todayCookies.length} cookies + achievements to clipboard for Logseq!`, 'success');
}

function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerText = message;

    container.appendChild(toast);

    // Remove after 3 seconds
    setTimeout(() => {
        toast.style.animation = 'fadeOut 0.3s ease-out forwards';
        setTimeout(() => {
            if (container.contains(toast)) {
                container.removeChild(toast);
            }
        }, 300);
    }, 3000);
}

// Start
window.addEventListener('DOMContentLoaded', () => {
    init();
    // Force a layout update just in case
    setTimeout(() => {
        document.body.style.display = 'none';
        document.body.offsetHeight; // trigger reflow
        document.body.style.display = 'flex';
    }, 50);
});
