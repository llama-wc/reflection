// --- CLOUDFLARE CONFIGURATION ---
let RAW_URL = "https://virtue-api.mac-j-wall.workers.dev";
if (!RAW_URL.startsWith('http')) RAW_URL = 'https://' + RAW_URL;
if (RAW_URL.endsWith('/')) RAW_URL = RAW_URL.slice(0, -1);
const WORKER_URL = RAW_URL;

// --- STATE & INITIALIZATION ---
const defaultVirtues = ["Temperance", "Silence", "Order", "Resolution", "Frugality", "Industry", "Sincerity", "Justice", "Moderation", "Cleanliness", "Tranquility", "Chastity", "Humility"];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let virtues = [];
let gridData = {}; 
let forcedDates = new Set(); 
let undoStack = [];
let currentTool = 1; 
let currentMonday = getMonday(new Date());
let viewMode = 'weekly'; 
let currentUserId = null;

const container = document.getElementById('grid-container');
const statusText = document.getElementById('save-status');

function setStatus(msg, duration = 3000) {
    statusText.textContent = msg;
    setTimeout(() => statusText.textContent = "", duration);
}

function generateSecureId() {
    const array = new Uint8Array(16); crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

function getMonday(d) {
    d = new Date(d);
    let day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}

function formatDate(date) { 
    const year = date.getFullYear(); 
    const month = String(date.getMonth() + 1).padStart(2, '0'); 
    const day = String(date.getDate()).padStart(2, '0'); 
    return `${year}-${month}-${day}`; 
}
function getDayOfWeek(dateString) { return (new Date(dateString.split('-')[0], dateString.split('-')[1] - 1, dateString.split('-')[2]).getDay() + 6) % 7; }

// --- CLOUD SYNC LOGIC ---
function initializeSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');

    if (id && id.length >= 12) {
        currentUserId = id; document.getElementById('sync-url-display').value = window.location.href; fetchDataFromCloud();
    } else {
        currentUserId = generateSecureId();
        const newUrl = `${window.location.origin}${window.location.pathname}?id=${currentUserId}`;
        window.history.replaceState({}, document.title, newUrl);
        document.getElementById('sync-url-display').value = newUrl;
        virtues = [...defaultVirtues]; renderGrid();
    }
}

async function fetchDataFromCloud() {
    setStatus("Syncing from cloud...");
    try {
        const res = await fetch(`${WORKER_URL}?id=${currentUserId}`);
        if (res.ok) {
            const payload = await res.json();
            if (payload.v) virtues = payload.v;
            if (payload.d) {
                gridData = {};
                payload.d.forEach(record => {
                    const vName = virtues[record[0]]; const date = record[1];
                    if (!vName) return; 
                    gridData[`${vName}_${date}`] = record[2].map(c => ({
                        type: c[0], scale: c[1] / 100, rotate: c[2], x: c[3], y: c[4],
                        shape: `${c[5]}% ${c[6]}% ${c[7]}% ${c[8]}% / ${c[9]}% ${c[10]}% ${c[11]}% ${c[12]}%`,
                        splatters: c[13] ? c[13].map(s => ({ size: s[0], x: s[1], y: s[2] })) : []
                    }));
                });
            }
            setStatus("Ledger synced successfully.");
        } else { setStatus("No cloud data found. Starting fresh."); virtues = [...defaultVirtues]; }
    } catch (err) { 
        console.error("Cloud Fetch Error:", err);
        setStatus("Cloud disconnected. Using local memory."); loadLocalFallback(); 
    }
    renderVirtuesList(); renderGrid();
}

async function saveDataToCloud() {
    setStatus("Saving to cloud..."); saveLocalFallback(); 

    try {
        const compressedData = [];
        for (const [key, drops] of Object.entries(gridData)) {
            if (!drops || drops.length === 0) continue;
            const parts = key.split('_');
            if (parts.length !== 2) continue;

            const vName = parts[0]; const date = parts[1]; 
            const vIdx = virtues.indexOf(vName);
            if (vIdx === -1) continue; 

            const flatDrops = drops.map(d => {
                const shapeStr = d.shape || "50% 50% 50% 50% / 50% 50% 50% 50%";
                const shapes = shapeStr.match(/\d+/g).map(Number);
                const sp = (d.splatters || []).map(s => [Math.round(s.size), Math.round(s.x), Math.round(s.y)]);
                return [d.type || 1, Math.round((d.scale || 1) * 100), d.rotate || 0, Math.round(d.x || 50), Math.round(d.y || 25), ...shapes, sp];
            });
            compressedData.push([vIdx, date, flatDrops]);
        }

        const payload = JSON.stringify({ v: virtues, d: compressedData });

        const res = await fetch(`${WORKER_URL}?id=${currentUserId}`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'text/plain' }, 
            body: payload 
        });

        if (!res.ok) throw new Error(`Cloudflare rejected save. Status: ${res.status}`);

        setStatus("Safely synced to Cloud!");
    } catch (err) { 
        console.error("Cloud Save Error:", err);
        setStatus("Error: Cloud connection failed. Saved locally."); 
    }
}

// Local Fallbacks
function loadLocalFallback() {
    const savedVirtues = localStorage.getItem('custom_virtues'); virtues = savedVirtues ? JSON.parse(savedVirtues) : [...defaultVirtues];
    const savedData = localStorage.getItem('reflection_ledger'); if (savedData) gridData = JSON.parse(savedData);
}
function saveLocalFallback() {
    localStorage.setItem('custom_virtues', JSON.stringify(virtues)); localStorage.setItem('reflection_ledger', JSON.stringify(gridData));
}

// --- HARD BACKUPS ---
document.getElementById('download-btn').addEventListener('click', () => {
    const backup = { v: virtues, d: gridData }; const dl = document.createElement('a');
    dl.setAttribute("href", "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup)));
    dl.setAttribute("download", "virtue_ledger_backup.json"); document.body.appendChild(dl); dl.click(); dl.remove(); setStatus("Backup downloaded safely.");
});

document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());

document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return; const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const backup = JSON.parse(event.target.result);
            if (backup.v) virtues = backup.v; if (backup.d) gridData = backup.d;
            saveLocalFallback(); saveDataToCloud(); renderVirtuesList(); renderGrid();
        } catch(err) { setStatus("Error reading backup file.", 5000); }
    }; reader.readAsText(file);
});

function getAggregateData() {
    const agg = {};
    Object.keys(gridData).sort().forEach(key => {
        const parts = key.split('_');
        if (parts.length === 2) {
            const aggKey = `${parts[0]}_${getDayOfWeek(parts[1])}`;
            if (!agg[aggKey]) agg[aggKey] = []; agg[aggKey].push(...gridData[key]);
        }
    }); return agg;
}

// --- PHYSICS ENGINE ---
function randomBlobShape() { const r = () => 40 + Math.floor(Math.random() * 20); return `${r()}% ${r()}% ${r()}% ${r()}% / ${r()}% ${r()}% ${r()}% ${r()}%`; }
function generateRandomDrop(type, clickX = null, clickY = null) {
    const drop = { type: type, scale: 0.7 + (Math.random() * 0.4), rotate: Math.floor(Math.random() * 360), x: clickX !== null ? clickX : 30 + (Math.random() * 40), y: clickY !== null ? clickY : 15 + (Math.random() * 20), shape: randomBlobShape(), splatters: [] };
    for(let i=0; i<Math.floor(Math.random() * 3) + 1; i++) drop.splatters.push({ size: 1 + Math.random() * 2, x: (Math.random() * 26) - 13, y: (Math.random() * 26) - 13 }); return drop;
}

// --- TOOL PALETTE ---
function setActiveTool(btn, toolId) { currentTool = toolId; document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active')); btn.classList.add('active'); }
document.getElementById('tool-success').addEventListener('click', (e) => setActiveTool(e.target, 1));
document.getElementById('tool-failure').addEventListener('click', (e) => setActiveTool(e.target, 2));
document.getElementById('tool-eraser').addEventListener('click', (e) => setActiveTool(e.target, 0));

// --- HISTORY ---
function saveState() { undoStack.push(JSON.stringify(gridData)); document.getElementById('undo-btn').disabled = false; }
document.getElementById('undo-btn').addEventListener('click', () => {
    if (undoStack.length > 0) { gridData = JSON.parse(undoStack.pop()); syncVisualsToData(); saveDataToCloud(); if(undoStack.length === 0) document.getElementById('undo-btn').disabled = true; }
});

// --- RENDER MAIN GRID ---
function renderGrid() {
    container.innerHTML = ''; 
    container.appendChild(createCell('', 'grid-header top-corner'));

    if (viewMode === 'weekly') {
        container.classList.remove('stack-view');
        container.style.gridTemplateColumns = `140px repeat(7, minmax(60px, 1fr))`;
        document.getElementById('calendar-nav').style.display = 'flex'; 
        document.getElementById('tool-palette').style.display = 'flex';

        for (let i = 0; i < 7; i++) {
            let d = new Date(currentMonday); d.setDate(d.getDate() + i); 
            container.appendChild(createCell(d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' }), 'grid-header sticky-top'));
        }
        document.getElementById('week-display').textContent = `Week of ${currentMonday.toLocaleDateString()}`;
    } else {
        container.classList.add('stack-view');
        container.style.gridTemplateColumns = `minmax(75px, 120px) repeat(7, minmax(25px, 1fr))`;
        document.getElementById('calendar-nav').style.display = 'none'; 
        document.getElementById('tool-palette').style.display = 'none';

        for (let i = 0; i < 7; i++) container.appendChild(createCell(days[i], 'grid-header sticky-top'));
    }

    virtues.forEach(virtue => {
        container.appendChild(createCell(virtue, 'grid-header virtue-label'));
        for (let i = 0; i < 7; i++) {
            let cellId = viewMode === 'weekly' ? `${virtue}_${formatDate(new Date(new Date(currentMonday).setDate(currentMonday.getDate() + i)))}` : `${virtue}_${i}`;
            const cell = createCell('', 'grid-cell'); cell.dataset.id = cellId;
            if (viewMode === 'weekly') {
                if (!Array.isArray(gridData[cellId])) gridData[cellId] = [];
                cell.addEventListener('click', (e) => {
                    saveState();
                    if (currentTool === 0) gridData[cellId] = []; 
                    else { const rect = cell.getBoundingClientRect(); gridData[cellId].push(generateRandomDrop(currentTool, e.clientX - rect.left, e.clientY - rect.top)); }
                    syncVisualsToData(); saveDataToCloud();
                });
            } else cell.style.cursor = 'default';
            container.appendChild(cell);
        }
    }); syncVisualsToData(); 
}

function createCell(text, className) { const div = document.createElement('div'); div.className = className; div.textContent = text; return div; }

function syncVisualsToData() {
    const dataSource = viewMode === 'aggregate' ? getAggregateData() : gridData;
    document.querySelectorAll('.grid-cell').forEach(cell => {
        const drops = dataSource[cell.dataset.id] || []; cell.innerHTML = ''; if (drops.length === 0) return;
        const canvas = document.createElement('div'); canvas.className = 'cell-ink-canvas';
        drops.forEach(drop => {
            const dropEl = document.createElement('div'); dropEl.className = `ink-drop ${drop.type === 1 ? 'ink-success' : 'ink-failure'}`;

            let posX = drop.x !== undefined ? drop.x : 50;
            let posY = drop.y !== undefined ? drop.y : 25;

            // If we are in the Stack view, we use modulo to mathematically force 
            // the coordinates into the absolute center safe-zone of the tiny cell.
            if (viewMode === 'aggregate') {
                posX = 15 + (posX % 15); 
                posY = 10 + (posY % 8);
            }

            dropEl.style.left = `${posX}px`; 
            dropEl.style.top = `${posY}px`;

            dropEl.style.transform = `translate(-50%, -50%) rotate(${drop.rotate}deg) scale(${drop.scale})`;
            const core = document.createElement('div'); core.className = 'ink-core'; core.style.borderRadius = drop.shape; dropEl.appendChild(core);
            drop.splatters.forEach(s => {
                const sp = document.createElement('div'); sp.className = 'ink-splatter'; sp.style.width = `${s.size}px`; sp.style.height = `${s.size}px`; sp.style.left = `calc(50% + ${s.x}px)`; sp.style.top = `calc(50% + ${s.y}px)`; dropEl.appendChild(sp);
            }); canvas.appendChild(dropEl);
        }); cell.appendChild(canvas);
    });
}

document.getElementById('prev-week').addEventListener('click', () => { currentMonday.setDate(currentMonday.getDate() - 7); renderGrid(); });
document.getElementById('next-week').addEventListener('click', () => { currentMonday.setDate(currentMonday.getDate() + 7); renderGrid(); });
document.getElementById('view-toggle').addEventListener('click', (e) => { viewMode = viewMode === 'weekly' ? 'aggregate' : 'weekly'; e.target.textContent = viewMode === 'weekly' ? 'VIEW: ALL-TIME STACK' : 'VIEW: RETURN TO WEEKLY'; renderGrid(); });

const modal = document.getElementById('data-modal');
function switchTab(activeId, panelId) {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active')); document.querySelectorAll('.modal-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    document.getElementById(activeId).classList.add('active'); document.getElementById(panelId).classList.add('active'); document.getElementById(panelId).classList.remove('hidden');
}
document.getElementById('tab-about').addEventListener('click', () => switchTab('tab-about', 'panel-about'));
document.getElementById('tab-virtues').addEventListener('click', () => switchTab('tab-virtues', 'panel-virtues'));
document.getElementById('tab-data').addEventListener('click', () => { switchTab('tab-data', 'panel-data'); renderDataTable(); });
document.getElementById('open-log-btn').addEventListener('click', () => { renderVirtuesList(); renderDataTable(); modal.classList.remove('hidden'); });
document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));

function renderVirtuesList() {
    const list = document.getElementById('virtues-list'); list.innerHTML = '';
    virtues.forEach((v, index) => {
        const pill = document.createElement('div'); pill.className = 'virtue-pill';
        const nameInput = document.createElement('input'); nameInput.type = 'text'; nameInput.value = v; nameInput.className = 'virtue-edit-input';
        nameInput.onblur = (e) => renameVirtue(index, e.target.value); nameInput.onkeydown = (e) => { if (e.key === 'Enter') nameInput.blur(); };
        const controls = document.createElement('div'); controls.className = 'virtue-controls';
        if (index > 0) { const upBtn = document.createElement('button'); upBtn.className = 'move-virtue'; upBtn.innerHTML = '↑'; upBtn.onclick = () => moveVirtue(index, -1); controls.appendChild(upBtn); }
        if (index < virtues.length - 1) { const downBtn = document.createElement('button'); downBtn.className = 'move-virtue'; downBtn.innerHTML = '↓'; downBtn.onclick = () => moveVirtue(index, 1); controls.appendChild(downBtn); }
        const rmBtn = document.createElement('button'); rmBtn.className = 'remove-virtue'; rmBtn.innerHTML = '×'; rmBtn.onclick = () => removeVirtue(index); controls.appendChild(rmBtn);
        pill.appendChild(nameInput); pill.appendChild(controls); list.appendChild(pill);
    });
}

function renameVirtue(index, newName) {
    const trimmed = newName.trim(); if (virtues[index] === trimmed || trimmed === '') return renderVirtuesList(); 
    const oldName = virtues[index]; virtues[index] = trimmed; const newGrid = {};
    for(const key in gridData) { if(key.startsWith(`${oldName}_`)) newGrid[`${trimmed}_${key.substring(oldName.length + 1)}`] = gridData[key]; else newGrid[key] = gridData[key]; }
    gridData = newGrid; saveDataToCloud(); renderGrid(); renderDataTable();
}
function moveVirtue(index, dir) { const temp = virtues[index + dir]; virtues[index + dir] = virtues[index]; virtues[index] = temp; saveDataToCloud(); renderVirtuesList(); renderGrid(); renderDataTable(); }
function removeVirtue(index) { virtues.splice(index, 1); saveDataToCloud(); renderVirtuesList(); renderGrid(); renderDataTable(); }
document.getElementById('add-virtue-btn').addEventListener('click', () => { const val = document.getElementById('new-virtue-input').value.trim(); if (val && !virtues.includes(val)) { virtues.push(val); document.getElementById('new-virtue-input').value = ''; saveDataToCloud(); renderVirtuesList(); renderGrid(); } });

document.getElementById('add-date-btn').addEventListener('click', () => { const newDate = document.getElementById('new-date-input').value; if (newDate) { forcedDates.add(newDate); renderDataTable(); } });
function renderDataTable() {
    const table = document.getElementById('data-table'); table.innerHTML = ''; const allDates = new Set(forcedDates);
    for (const cellId of Object.keys(gridData)) { if(gridData[cellId].length > 0 && cellId.split('_').length === 2) allDates.add(cellId.split('_')[1]); }
    allDates.add(formatDate(new Date())); const sortedDates = Array.from(allDates).sort((a,b) => b.localeCompare(a)); 
    let thead = '<thead><tr><th>Date</th>'; virtues.forEach(v => thead += `<th>${v}</th>`); table.innerHTML += thead + '</tr></thead>'; let tbody = '<tbody>';
    sortedDates.forEach(date => {
        let row = `<tr><td><strong>${date}</strong></td>`;
        virtues.forEach(v => { const drops = gridData[`${v}_${date}`] || []; const val = drops.map(d => d.type === 1 ? 'P' : 'S').join(', '); row += `<td><input type="text" class="cell-input" data-cell="${v}_${date}" value="${val}" placeholder="-"></td>`; });
        tbody += row + `</tr>`;
    }); table.innerHTML += tbody + '</tbody>';
}

function reconcileTableEdits() {
    saveState(); document.querySelectorAll('.cell-input').forEach(input => {
        const cellId = input.getAttribute('data-cell'); const parsedTypes = [];
        input.value.split(/[, ]+/).forEach(w => { const clean = w.trim().toLowerCase(); if (clean === 'p' || clean === 'practiced') parsedTypes.push(1); if (clean === 's' || clean === 'slipped') parsedTypes.push(2); });
        const existingDrops = gridData[cellId] ? [...gridData[cellId]] : []; const reconciledDrops = [];
        parsedTypes.forEach(targetType => {
            let matchIndex = existingDrops.findIndex(drop => drop.type === targetType);
            if (matchIndex !== -1) reconciledDrops.push(existingDrops.splice(matchIndex, 1)[0]);
            else if (existingDrops.length > 0) { let repurposedDrop = existingDrops.splice(0, 1)[0]; repurposedDrop.type = targetType; reconciledDrops.push(repurposedDrop); } 
            else reconciledDrops.push(generateRandomDrop(targetType, null, null));
        }); gridData[cellId] = reconciledDrops;
    }); syncVisualsToData();
}

document.getElementById('modal-sync-btn').addEventListener('click', async () => {
    reconcileTableEdits(); await saveDataToCloud();
    navigator.clipboard.writeText(document.getElementById('sync-url-display').value).then(() => { modal.classList.add('hidden'); setStatus("Cloud Saved & Link Copied!"); });
});

const themeBtn = document.getElementById('theme-toggle');
const appWrapper = document.getElementById('virtue-ledger-app');
const storedTheme = localStorage.getItem('theme') || 'dark';
if (storedTheme === 'light') { document.documentElement.setAttribute('data-theme', 'light'); appWrapper.classList.add('force-light'); themeBtn.textContent = "DARK MODE"; } else { document.documentElement.setAttribute('data-theme', 'dark'); appWrapper.classList.add('force-dark'); themeBtn.textContent = "LIGHT MODE"; }
themeBtn.addEventListener('click', () => {
    if (document.documentElement.getAttribute('data-theme') === 'dark') { document.documentElement.setAttribute('data-theme', 'light'); appWrapper.classList.remove('force-dark'); appWrapper.classList.add('force-light'); localStorage.setItem('theme', 'light'); themeBtn.textContent = "DARK MODE"; } 
    else { document.documentElement.setAttribute('data-theme', 'dark'); appWrapper.classList.remove('force-light'); appWrapper.classList.add('force-dark'); localStorage.setItem('theme', 'dark'); themeBtn.textContent = "LIGHT MODE"; }
});

initializeSession();


// ==========================================
// --- FLUID BLEED VISUALIZATION ENGINE ---
// ==========================================

// 1. Setup the Overlay Canvas
const bleedCanvas = document.createElement('canvas');
bleedCanvas.id = 'ink-canvas';
bleedCanvas.style.position = 'absolute';
bleedCanvas.style.top = '0';
bleedCanvas.style.left = '0';
bleedCanvas.style.pointerEvents = 'none'; // Lets you click through to the grid
bleedCanvas.style.zIndex = '100';
bleedCanvas.style.transition = 'opacity 0.5s ease';

// Ensure the grid's parent is relative so the canvas perfectly overlays it
container.parentElement.style.position = 'relative';
container.parentElement.appendChild(bleedCanvas);

const bCtx = bleedCanvas.getContext('2d');

// 2. Setup the Trigger Button
const bleedBtn = document.createElement('button');
bleedBtn.id = 'bleed-btn';
bleedBtn.textContent = 'LET IT BLEED';
bleedBtn.className = 'tool-btn'; // Reusing your existing CSS classes
bleedBtn.style.marginLeft = '10px';
bleedBtn.style.backgroundColor = '#2c2f33'; // Dark theme default
bleedBtn.style.color = '#fff';

// Inject it right next to the view toggle
const viewToggleBtn = document.getElementById('view-toggle');
if (viewToggleBtn && viewToggleBtn.parentElement) {
    viewToggleBtn.parentElement.appendChild(bleedBtn);
}

// 3. Physics Engine Variables
let bleedParticles = [];
let bleedAnimationId;
let bleedFrameCount = 0;
const BLEED_MAX_FRAMES = 900; 

// Base colors (Brightened with high transparency for rich multiply blending)
const COLOR_SUCCESS_INK = 'rgba(80, 130, 240, 0.015)'; // Blue (Type 1)
const COLOR_FAILURE_INK = 'rgba(230, 80, 100, 0.015)'; // Red (Type 2)

class BleedParticle {
    constructor(startX, startY, color, weightMultiplier, boundW, boundH) {
        this.originX = startX;
        this.originY = startY;
        this.x = startX;
        this.y = startY;
        this.color = color;
        this.bounds = { w: boundW, h: boundH };
        
        // Thicker lines for that rich fluid look
        this.size = Math.random() * 2.5 + 1.0; 
        
        // Smooth momentum steering
        this.angle = Math.random() * Math.PI * 2;
        this.speed = Math.random() * 0.8 + 0.3;
        
        this.outwardBias = (Math.random() * 0.15) * weightMultiplier;
    }

    update() {
        // Drift angle smoothly instead of harsh jitter
        this.angle += (Math.random() - 0.5) * 0.25;

        this.x += Math.cos(this.angle) * this.speed;
        this.y += Math.sin(this.angle) * this.speed;

        // Radial soak pushing outward from the specific grid cell
        const dx = this.x - this.originX;
        const dy = this.y - this.originY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist > 1) {
            this.x += (dx / dist) * this.outwardBias;
            this.y += (dy / dist) * this.outwardBias;
        }

        // Keep ink within the grid bounds
        if (this.x < 0) this.x = 0;
        if (this.x > this.bounds.w) this.x = this.bounds.w;
        if (this.y < 0) this.y = 0;
        if (this.y > this.bounds.h) this.y = this.bounds.h;
    }

    draw() {
        bCtx.fillStyle = this.color;
        bCtx.beginPath();
        bCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        bCtx.fill();
    }
}

function triggerLiveBleed() {
    if (bleedAnimationId) cancelAnimationFrame(bleedAnimationId);
    bleedParticles = [];
    bleedFrameCount = 0;
    
    // Size the canvas precisely to the current grid layout state
    bleedCanvas.width = container.offsetWidth;
    bleedCanvas.height = container.offsetHeight;
    
    bCtx.clearRect(0, 0, bleedCanvas.width, bleedCanvas.height);
    bCtx.globalCompositeOperation = 'multiply';

    // Figure out which data to pull based on current view
    const dataSource = viewMode === 'aggregate' ? getAggregateData() : gridData;

    // Scan the live DOM grid to find where ink should spawn
    document.querySelectorAll('.grid-cell').forEach(cell => {
        const drops = dataSource[cell.dataset.id] || [];
        if (drops.length === 0) return;

        // Find exact center of the cell relative to the grid container
        const rect = cell.getBoundingClientRect();
        const containerRect = container.getBoundingClientRect();
        const centerX = (rect.left - containerRect.left) + (rect.width / 2);
        const centerY = (rect.top - containerRect.top) + (rect.height / 2);

        let successVol = 0;
        let failureVol = 0;

        // Tally the live data inside this cell
        drops.forEach(d => {
            if (d.type === 1) successVol++;
            else if (d.type === 2) failureVol++;
        });

        // Tweak volume so week view has enough ink, and stack view doesn't crash the browser
        const particleMultiplier = viewMode === 'aggregate' ? 40 : 150;

        // Spawn Success (Blue) particles
        if (successVol > 0) {
            const sWeight = successVol > failureVol ? 1.4 : 0.8;
            for (let i = 0; i < (successVol * particleMultiplier); i++) {
                bleedParticles.push(new BleedParticle(centerX, centerY, COLOR_SUCCESS_INK, sWeight, bleedCanvas.width, bleedCanvas.height));
            }
        }

        // Spawn Failure (Red) particles
        if (failureVol > 0) {
            const fWeight = failureVol > successVol ? 1.4 : 0.8;
            for (let i = 0; i < (failureVol * particleMultiplier); i++) {
                bleedParticles.push(new BleedParticle(centerX, centerY, COLOR_FAILURE_INK, fWeight, bleedCanvas.width, bleedCanvas.height));
            }
        }
    });

    animateBleed();
}

function animateBleed() {
    for (let i = 0; i < bleedParticles.length; i++) {
        bleedParticles[i].update();
        bleedParticles[i].draw();
    }

    bleedFrameCount++;
    if (bleedFrameCount < BLEED_MAX_FRAMES) {
        bleedAnimationId = requestAnimationFrame(animateBleed);
    }
}

// Clear the canvas automatically if the user changes weeks or views
const clearCanvas = () => bCtx.clearRect(0, 0, bleedCanvas.width, bleedCanvas.height);
document.getElementById('prev-week').addEventListener('click', clearCanvas);
document.getElementById('next-week').addEventListener('click', clearCanvas);
document.getElementById('view-toggle').addEventListener('click', clearCanvas);

bleedBtn.addEventListener('click', triggerLiveBleed);

