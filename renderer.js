const { ipcRenderer } = require('electron');
const Matter = require('matter-js');

// Module aliases
const Engine = Matter.Engine,
    Render = Matter.Render,
    Runner = Matter.Runner,
    Bodies = Matter.Bodies,
    Composite = Matter.Composite,
    Mouse = Matter.Mouse,
    MouseConstraint = Matter.MouseConstraint,
    Events = Matter.Events,
    Query = Matter.Query;

// Texture Generator
function generateCookieTexture(level, radius, isRaw = false) {
    const size = radius * 2;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    const cx = size / 2;
    const cy = size / 2;

    // Clear
    ctx.clearRect(0, 0, size, size);

    // Base Circle
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2); // -2 for border space
    ctx.closePath();

    // Clip to circle
    ctx.save();
    ctx.clip();

    if (isRaw) {
        // Raw Dough (New Cookie)
        const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, radius);
        grad.addColorStop(0, '#f0e68c');
        grad.addColorStop(1, '#bdb76b');
        ctx.fillStyle = grad;
        ctx.fill();

        addNoise(ctx, size, size);
    } else {
        // Baked & Leveled Cookies
        const grad = ctx.createRadialGradient(cx, cy, radius * 0.2, cx, cy, radius);

        if (level === 1) {
            // Level 1: Classic Chocolate Chip
            grad.addColorStop(0, '#eac086');
            grad.addColorStop(1, '#c69c6d');
            ctx.fillStyle = grad;
            ctx.fill();

            addNoise(ctx, size, size);

            // Chips
            for (let i = 0; i < 8; i++) {
                drawChip(ctx, cx, cy, radius, '#3e2723');
            }
        } else if (level === 2) {
            // Level 2: White Chocolate Macadamia
            grad.addColorStop(0, '#f5deb3');
            grad.addColorStop(1, '#e0c090');
            ctx.fillStyle = grad;
            ctx.fill();

            addNoise(ctx, size, size);

            // White chunks
            for (let i = 0; i < 6; i++) {
                drawChip(ctx, cx, cy, radius, '#fffdd0');
            }
        } else if (level === 3) {
            // Level 3: Golden Cookie
            grad.addColorStop(0, '#ffd700');
            grad.addColorStop(1, '#daa520');
            ctx.fillStyle = grad;
            ctx.fill();

            // Shine
            ctx.beginPath();
            ctx.arc(cx - radius * 0.3, cy - radius * 0.3, radius * 0.25, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255,255,255,0.4)';
            ctx.fill();

            addNoise(ctx, size, size);
        } else if (level === 4) {
            // Level 4: Red Velvet
            grad.addColorStop(0, '#a52a2a');
            grad.addColorStop(1, '#800000');
            ctx.fillStyle = grad;
            ctx.fill();

            addNoise(ctx, size, size);

            // Crinkles
            ctx.strokeStyle = 'rgba(255,255,255,0.3)';
            ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) {
                ctx.beginPath();
                const x1 = cx + (Math.random() - 0.5) * radius;
                const y1 = cy + (Math.random() - 0.5) * radius;
                ctx.moveTo(x1, y1);
                ctx.lineTo(x1 + (Math.random() - 0.5) * 20, y1 + (Math.random() - 0.5) * 20);
                ctx.stroke();
            }
            // White Chips
            for (let i = 0; i < 5; i++) {
                drawChip(ctx, cx, cy, radius, '#fffdd0');
            }
        }
    }

    ctx.restore();

    // Subtle outline
    ctx.beginPath();
    ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = 1;
    ctx.stroke();

    return canvas.toDataURL();
}

function addNoise(ctx, w, h) {
    ctx.save();
    ctx.globalCompositeOperation = 'overlay';
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = Math.random() * 2;
        ctx.fillStyle = 'rgba(0,0,0,0.1)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    for (let i = 0; i < 50; i++) {
        const x = Math.random() * w;
        const y = Math.random() * h;
        const r = Math.random() * 2;
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();
}

function drawChip(ctx, cx, cy, radius, color) {
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * (radius * 0.7);
    const x = cx + Math.cos(angle) * dist;
    const y = cy + Math.sin(angle) * dist;
    const r = Math.random() * (radius * 0.15) + 2;

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();

    // Chip shadow
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(x + 1, y + 1, r * 0.8, 0, Math.PI * 2);
    ctx.fill();
}

// Level Definitions
const COOKIE_LEVELS = [
    { radius: 16 }, // Level 1
    { radius: 19 }, // Level 2
    { radius: 22 }, // Level 3
    { radius: 25 }, // Level 4
    { radius: 28 }  // Level 5
];

// Pre-generate textures
COOKIE_LEVELS.forEach((lvl, index) => {
    lvl.texture = generateCookieTexture(index + 1, lvl.radius);
});

// Raw Cookie Texture
const RAW_COOKIE_TEXTURE = generateCookieTexture(0, 16, true);

// Create engine
const engine = Engine.create();
const world = engine.world;

// Create renderer
const render = Render.create({
    element: document.getElementById('app'),
    engine: engine,
    options:
    {
        width: window.innerWidth,
        height: window.innerHeight,
        wireframes: false,
        background: 'transparent'
    }
});

// Jar Parameters
const jarX = window.innerWidth - 200; // Position on the right
const jarY = window.innerHeight - 50;
const jarWidth = 200;
const jarHeight = 250;
const wallThickness = 20;

// Plate Parameters
const plateX = jarX - 200;
const plateY = jarY;
const plateWidth = 120;

// Create Jar Walls
const ground = Bodies.rectangle(jarX, jarY, jarWidth, wallThickness, {
    isStatic: true,
    render: { visible: false },
    label: 'jar'
});
const leftWall = Bodies.rectangle(jarX - jarWidth / 2 + wallThickness / 2, jarY - jarHeight / 2, wallThickness, jarHeight, {
    isStatic: true,
    render: { visible: false },
    label: 'jar'
});
const rightWall = Bodies.rectangle(jarX + jarWidth / 2 - wallThickness / 2, jarY - jarHeight / 2, wallThickness, jarHeight, {
    isStatic: true,
    render: { visible: false },
    label: 'jar'
});

// Create Plate
const plate = Bodies.rectangle(plateX, plateY, plateWidth, wallThickness, {
    isStatic: true,
    render: { visible: false },
    label: 'plate'
});

Composite.add(world, [ground, leftWall, rightWall, plate]);

// Update HTML Elements positions
function updateUiPositions() {
    const jarBack = document.getElementById('jar-back');
    const jarFront = document.getElementById('jar-front');
    const plateEl = document.getElementById('plate');

    // Jar Position
    // Physics body center is jarX, jarY (ground). 
    // Walls go up by jarHeight.
    // Visual Jar should cover the area.
    const jLeft = jarX - jarWidth / 2;
    const jTop = jarY - jarHeight;

    const style = `left: ${jLeft}px; top: ${jTop}px; width: ${jarWidth}px; height: ${jarHeight}px;`;
    jarBack.style.cssText = style;
    jarFront.style.cssText = style;

    // Plate Position
    // Plate physics is a rectangle at plateX, plateY
    const pLeft = plateX - plateWidth / 2;
    const pTop = plateY - wallThickness / 2; // Center to top-ish
    // Make visual plate a bit wider and flatter
    plateEl.style.left = (pLeft - 10) + 'px';
    plateEl.style.top = (pTop) + 'px';
    plateEl.style.width = (plateWidth + 20) + 'px';
    plateEl.style.height = '20px'; // Visual height
}
updateUiPositions();

function refreshJar() {
    // Remove all saved cookies
    const bodies = Composite.allBodies(world);
    const savedBodies = bodies.filter(b => b.label === 'cookie-saved');
    Composite.remove(world, savedBodies);

    // Load existing cookies (visual only, simplified for now)
    const savedCookies = ipcRenderer.sendSync('get-cookies');
    const totalSaved = savedCookies.length;

    // Calculate breakdown and spawn
    let remaining = totalSaved;
    let currentLevel = 1;

    while (remaining > 0) {
        const count = remaining % 5; // How many of this level
        const nextRemaining = Math.floor(remaining / 5); // How many carry over to next level

        // Spawn 'count' cookies of 'currentLevel'
        for (let i = 0; i < count; i++) {
            const padding = 30;
            const randX = jarX - jarWidth / 2 + wallThickness + padding + Math.random() * (jarWidth - 2 * wallThickness - 2 * padding);
            const randY = jarY - wallThickness - padding - Math.random() * (jarHeight - 100);
            spawnCookie(randX, randY, true, currentLevel);
        }

        remaining = nextRemaining;
        currentLevel++;
    }
}

// Initial load
refreshJar();


// Mouse control
const mouse = Mouse.create(render.canvas);
const mouseConstraint = MouseConstraint.create(engine, {
    mouse: mouse,
    constraint: {
        stiffness: 0.2,
        render: {
            visible: false
        }
    }
});

Composite.add(world, mouseConstraint);

// Keep the mouse in sync with rendering
render.mouse = mouse;

// Run the engine
Render.run(render);
const runner = Runner.create();
Runner.run(runner, engine);

// --- Interaction Logic ---

// 1. Mouse Passthrough
function isMouseInJar(x, y) {
    const inJar = x > jarX - jarWidth / 2 &&
        x < jarX + jarWidth / 2 &&
        y > jarY - jarHeight &&
        y < jarY + wallThickness;

    const inPlate = x > plateX - plateWidth / 2 &&
        x < plateX + plateWidth / 2 &&
        y > plateY - 50 &&
        y < plateY + wallThickness;

    return inJar || inPlate;
}

setInterval(() => {
    const mousePos = mouse.position;
    const bodies = Composite.allBodies(world);
    const hovered = Query.point(bodies, mousePos);

    // If hovering over something, or if the modal is open (handled by CSS pointer-events), capture mouse.
    // Also capture if mouse is inside the Jar area (so we can click to spawn)

    const inJar = isMouseInJar(mousePos.x, mousePos.y);

    // Visual Feedback: Change Jar color when mouse is inside
    const jarFront = document.getElementById('jar-front');
    if (inJar) {
        jarFront.style.borderColor = 'rgba(255, 255, 255, 0.9)';
        jarFront.style.boxShadow = '0 0 15px rgba(255, 255, 255, 0.3)';
    } else {
        jarFront.style.borderColor = '';
        jarFront.style.boxShadow = '';
    }

    if (isModalOpen || hovered.length > 0 || inJar) {
        ipcRenderer.send('set-ignore-mouse-events', false);
        // document.getElementById('app').style.pointerEvents = 'auto'; // No longer needed as we removed 'none' from CSS
    } else {
        ipcRenderer.send('set-ignore-mouse-events', true, { forward: true });
        // document.getElementById('app').style.pointerEvents = 'none'; // No longer needed
    }
}, 100);

// 2. Spawn Cookie on Click (if clicking Jar)
Events.on(mouseConstraint, 'mousedown', function (event) {
    const mousePos = event.mouse.position;

    // Check if click is within Jar bounds
    if (isMouseInJar(mousePos.x, mousePos.y)) {
        // Spawn a cookie ABOVE THE PLATE
        spawnCookie(plateX, plateY - 100);
    }
});

// 3. Double Click to Open Stats
// Matter.js doesn't have a native double click, so we implement it.
let lastClickTime = 0;
Events.on(mouseConstraint, 'mousedown', function (event) {
    const now = Date.now();
    if (now - lastClickTime < 300) {
        // Double click detected
        const mousePos = event.mouse.position;
        if (isMouseInJar(mousePos.x, mousePos.y)) {
            ipcRenderer.send('open-stats');
        }
    }
    lastClickTime = now;
});


// 4. Cookie Logic
function spawnCookie(x, y, isSaved = false, level = 1) {
    // Prevent multiple active cookies
    if (!isSaved) {
        const bodies = Composite.allBodies(world);
        const activeCookie = bodies.find(b => b.label === 'cookie-new' || b.label === 'cookie-settled');
        if (activeCookie) return;
    }

    const levelConfig = COOKIE_LEVELS[level - 1] || COOKIE_LEVELS[COOKIE_LEVELS.length - 1];

    // Determine texture and radius
    let texture, radius;
    if (!isSaved) {
        texture = RAW_COOKIE_TEXTURE;
        radius = 16; // Raw size
    } else {
        texture = levelConfig.texture;
        radius = levelConfig.radius;
    }

    const cookie = Bodies.circle(x, y, radius, {
        restitution: 0.5,
        render: {
            sprite: {
                texture: texture,
                xScale: 1,
                yScale: 1
            }
        },
        label: isSaved ? 'cookie-saved' : 'cookie-new'
    });
    cookie.level = level; // Store level property

    Composite.add(world, cookie);
    return cookie;
}

// Cleanup fallen cookies (if they fall off screen)
setInterval(() => {
    const bodies = Composite.allBodies(world);
    bodies.forEach(body => {
        if (body.position.y > window.innerHeight + 100) {
            Composite.remove(world, body);

            // If it was a saved cookie, respawn it back in the jar!
            if (body.label === 'cookie-saved') {
                const padding = 30;
                const randX = jarX - jarWidth / 2 + wallThickness + padding + Math.random() * (jarWidth - 2 * wallThickness - 2 * padding);
                const randY = jarY - wallThickness - padding - Math.random() * (jarHeight - 100);
                spawnCookie(randX, randY, true, body.level || 1);
            }
        }
    });
}, 2000);

// Check for "Settled" cookies inside the jar
// A simple check: is it inside the jar bounds and moving slowly?
setInterval(() => {
    const bodies = Composite.allBodies(world);
    bodies.forEach(body => {
        // STRICTLY check for 'cookie-new'. Saved cookies must NEVER trigger this.
        if (body.label === 'cookie-new') {
            // Check bounds
            if (body.position.x > jarX - jarWidth / 2 &&
                body.position.x < jarX + jarWidth / 2 &&
                body.position.y > jarY - jarHeight &&
                body.position.y < jarY) {

                // Check speed
                if (body.speed < 0.5) {
                    // It's settled!
                    body.label = 'cookie-settled'; // Prevent re-triggering
                    showNoteModal(body);
                }
            }
        }
    });
}, 1000);


// Listen for cookie deletion
ipcRenderer.on('cookie-deleted', (event, cookie) => {
    refreshJar();
});

ipcRenderer.on('refresh-jar', () => {
    refreshJar();
});

// --- UI Logic ---
const modal = document.getElementById('note-modal');
const noteInput = document.getElementById('note-input');
const projectSelect = document.getElementById('project-select');
const saveBtn = document.getElementById('save-btn');
const noProjectsMsg = document.getElementById('no-projects-msg');
const openManagerLink = document.getElementById('open-manager-link');

let currentCookieBody = null;
let isModalOpen = false;

function showNoteModal(body) {
    currentCookieBody = body;

    // Fetch active projects
    const projects = ipcRenderer.sendSync('get-projects');
    const activeProjects = projects.filter(p => p.status === 'active');

    projectSelect.innerHTML = '';

    if (activeProjects.length === 0) {
        projectSelect.style.display = 'none';
        noProjectsMsg.classList.remove('hidden');
        saveBtn.disabled = true;
        saveBtn.style.opacity = 0.5;
    } else {
        projectSelect.style.display = 'block';
        noProjectsMsg.classList.add('hidden');
        saveBtn.disabled = false;
        saveBtn.style.opacity = 1;

        activeProjects.forEach(p => {
            const option = document.createElement('option');
            option.value = p.id;
            option.text = p.name;
            projectSelect.appendChild(option);
        });
    }

    modal.classList.remove('hidden');
    noteInput.value = '';
    noteInput.focus();
    isModalOpen = true;

    // Ensure we can click the modal
    ipcRenderer.send('set-ignore-mouse-events', false);
}

openManagerLink.addEventListener('click', (e) => {
    e.preventDefault();
    ipcRenderer.send('open-stats');
    modal.classList.add('hidden');
    isModalOpen = false;
    if (currentCookieBody) {
        currentCookieBody.label = 'cookie-new'; // Reset so it triggers again
    }
});

saveBtn.addEventListener('click', () => {
    if (currentCookieBody && !saveBtn.disabled) {
        const note = noteInput.value;
        const projectId = projectSelect.value;

        ipcRenderer.sendSync('save-cookie', {
            projectId,
            note,
            timestamp: Date.now(),
            level: 1
        });

        currentCookieBody.label = 'cookie-saved';
        currentCookieBody.level = 1; // Ensure it has a level

        // Update visual style for saved cookie (Level 1)
        const levelConfig = COOKIE_LEVELS[0];

        // We need to update the body radius and texture
        currentCookieBody.render.sprite.texture = levelConfig.texture;

        modal.classList.add('hidden');
        currentCookieBody = null;
        isModalOpen = false;

        // Check for merges
        checkForMerges();
    }
});

// Handle window resize
window.addEventListener('resize', () => {
    render.canvas.width = window.innerWidth;
    render.canvas.height = window.innerHeight;
    // Note: Physics bodies don't auto-update position on resize in this simple demo
    // But we should update UI positions if we did
    updateUiPositions();
});

function checkForMerges() {
    refreshJar();
}
