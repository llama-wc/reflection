// --- CLOUDFLARE CONFIGURATION ---
const WORKER_URL = "virtue-api.mac-j-wall.workers.dev";

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

// Generates a cryptographically secure 16-char ID
function generateSecureId() {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('').substring(0, 16);
}

function getMonday(d) {
    d = new Date(d);
    let day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}

function formatDate(date) { return date.toISOString().split('T')[0]; }
function getDayOfWeek(dateString) {
    const [y, m, d] = dateString.split('-');
    const date = new Date(y, m - 1, d);
    return (date.getDay() + 6) % 7; 
}

// --- CLOUD SYNC LOGIC ---

function initializeSession() {
    const urlParams = new URLSearchParams(window.location.search);
    const id = urlParams.get('id');
    
    if (id && id.length >= 12) {
        currentUserId = id;
        document.getElementById('sync-url-display').value = window.location.href;
        fetchDataFromCloud();
    } else {
        currentUserId = generateSecureId();
        const newUrl = `${window.location.origin}${window.location.pathname}?id=${currentUserId}`;
        window.history.replaceState({}, document.title, newUrl);
        document.getElementById('sync-url-display').value = newUrl;
        
        virtues = [...defaultVirtues];
        renderGrid();
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
                    const vName = virtues[record[0]];
                    const date = record[1];
                    if (!vName) return; 
                    gridData[`${vName}_${date}`] = record[2].map(c => ({
                        type: c[0], scale: c[1] / 100, rotate: c[2], x: c[3], y: c[4],
                        shape: `${c[5]}% ${c[6]}% ${c[7]}% ${c[8]}% / ${c[9]}% ${c[10]}% ${c[11]}% ${c[12]}%`,
                        splatters: c[13].map(s => ({ size: s[0], x: s[1], y: s[2] }))
                    }));
                });
            }
            setStatus("Ledger synced successfully.");
        } else {
            setStatus("No cloud data found. Starting fresh.");
            virtues = [...defaultVirtues];
        }
    } catch (err) {
        setStatus("Cloud disconnected. Using local memory.");
        loadLocalFallback();
    }
    renderVirtuesList();
    renderGrid();
}

async function saveDataToCloud() {
    setStatus("Saving to cloud...");
    saveLocalFallback(); 
    
    const compressedData = [];
    for (const [key, drops] of Object.entries(gridData)) {
        if (drops.length === 0) continue;
        const [vName, date] = key.split('_');
        const vIdx = virtues.indexOf(vName);
        if (vIdx === -1) continue; 
        
        const flatDrops = drops.map(d => {
            const shapes = d.shape.match(/\d+/g).map(Number);
            const sp = d.splatters.map(s => [Math.round(s.size), Math.round(s.x), Math.round(s.y)]);
            return [d.type, Math.round(d.scale * 100), d.rotate, Math.round(d.x), Math.round(d.y), ...shapes, sp];
        });
        compressedData.push([vIdx, date, flatDrops]);
    }
    
    const payload = JSON.stringify({ v: virtues, d: compressedData });
    
    try {
        await fetch(`${WORKER_URL}?id=${currentUserId}`, { method: 'POST', body: payload });
        setStatus("🔗 Safely synced to Cloud!");
    } catch (err) {
        setStatus("Error connecting to cloud. Saved locally.");
    }
}

// Local Fallbacks
function loadLocalFallback() {
    const savedVirtues = localStorage.getItem('custom_virtues');
    virtues = savedVirtues ? JSON.parse(savedVirtues) : [...defaultVirtues];
    const savedData = localStorage.getItem('reflection_ledger');
    if (savedData) gridData = JSON.parse(savedData);
}
function saveLocalFallback() {
    localStorage.setItem('custom_virtues', JSON.stringify(virtues));
    localStorage.setItem('reflection_ledger', JSON.stringify(gridData));
}

// --- HARD BACKUPS (DOWNLOAD / IMPORT) ---
document.getElementById('download-btn').addEventListener('click', () => {
    const backup = { v: virtues, d: gridData };
    const dl = document.createElement('a');
    dl.setAttribute("href", "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(backup)));
    dl.setAttribute("download", "virtue_ledger_backup.json");
    document.body.appendChild(dl); dl.click(); dl.remove();
    setStatus("Backup downloaded safely.");
});

document.getElementById('import-btn').addEventListener('click', () => document.getElementById('import-file').click());

document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        try {
            const backup = JSON.parse(event.target.result);
            if (backup.v) virtues = backup.v;
            if (backup.d) gridData = backup.d;
            saveLocalFallback();
            saveDataToCloud(); 
            renderVirtuesList();
            renderGrid();
        } catch(err) { setStatus("Error reading backup file.", 5000); }
    };
    reader.readAsText(file);
});

function getAggregateData() {
    const agg = {};
    Object.keys(gridData).sort().forEach(key => {
        const parts = key.split('_');
        if (parts.length === 2) {
            const aggKey = `${parts[0]}_${getDayOfWeek(parts[1])}`;
            if (!agg[aggKey]) agg[aggKey] = [];
            agg[aggKey].push(...gridData[key]);
        }
    });
    return agg;
}

// --- PHYSICS ENGINE ---
function randomBlobShape() {
    const r = () => 40 + Math.floor(Math.random() * 20); 
    return `${r()}% ${r()}% ${r()}% ${r()}% / ${r()}% ${r()}% ${r()}% ${r()}%`;
}
function generateRandomDrop(type, clickX = null, clickY = null) {
    const drop = {
        type: type, scale: 0.7 + (Math.random() * 0.4), rotate: Math.floor(Math.random() * 360),
        x: clickX !== null ? clickX : 30 + (Math.random() * 40), y: clickY !== null ? clickY : 15 + (Math.random() * 20),
        shape: randomBlobShape(), splatters: []
    };
    for(let i=0; i<Math.floor(Math.random() * 3) + 1; i++) drop.splatters.push({ size: 1 + Math.random() * 2, x: (Math.random() * 26) - 13, y: (Math.random() * 26) - 13 });
    return drop;
}

// --- TOOL PALETTE ---
function setActiveTool(btn, toolId) {
    currentTool = toolId;
    document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
document.getElementById('tool-success').addEventListener('click', (e) => setActiveTool(e.target, 1));
document.getElementById('tool-failure').addEventListener('click', (e) => setActiveTool(e.target, 2));
document.getElementById('tool-eraser').addEventListener('click', (e) => setActiveTool(e.target, 0));

// --- HISTORY ---
function saveState() { undoStack.push(JSON.stringify(gridData)); document.getElementById('undo-btn').disabled = false; }
document.getElementById('undo-btn').addEventListener('click', () => {
    if (undoStack.length > 0) {
        gridData = JSON.parse(undoStack.pop());
        syncVisualsToData(); saveDataToCloud();
        if(undoStack.length === 0) document.getElementById('undo-btn').disabled = true;
    }
});

// --- RENDER MAIN GRID ---
function renderGrid() {
    container.innerHTML = '';
    container.style.gridTemplateColumns = `140px repeat(7, 1fr)`;
    container.appendChild(createCell('', 'grid-header'));
    
    if (viewMode === 'weekly') {
        document.getElementById('calendar-nav').style.display = 'flex';
        document.getElementById('tool-palette').style.display = 'flex';
        for (let i = 0; i < 7; i++) {
            let d = new Date(currentMonday); d.setDate(d.getDate() + i);
            container.appendChild(createCell(d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' }), 'grid-header'));
        }
        document.getElementById('week-display').textContent = `Week of ${currentMonday.toLocaleDateString()}`;
    } else {
        document.getElementById('calendar-nav').style.display = 'none';
        document.getElementById('tool-palette').style.display = 'none';
        for (let i = 0; i < 7; i++) container.appendChild(createCell(days[i], 'grid-header'));
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
    });
    syncVisualsToData(); 
}

function createCell(text, className) { const div = document.createElement('div'); div.className = className; div.textContent = text; return div; }

function syncVisualsToData() {
    const dataSource = viewMode === 'aggregate' ? getAggregateData() : gridData;
    document.querySelectorAll('.grid-cell').forEach(cell => {
        const drops = dataSource[cell.dataset.id] || []; cell.innerHTML = ''; 
        if (drops.length === 0) return;
        
        const canvas = document.createElement('div'); canvas.className = 'cell-ink-canvas';
        drops.forEach(drop => {
            const dropEl = document.createElement('div'); dropEl.className = `ink-drop ${drop.type === 1 ? 'ink-success' : 'ink-failure'}`;
            dropEl.style.left = `${drop.x !== undefined ? drop.x : 50}px`; dropEl.style.top = `${drop.y !== undefined ? drop.y : 25}px`;
            dropEl.style.transform = `translate(-50%, -50%) rotate(${drop.rotate}deg) scale(${drop.scale})`;
            
            const core = document.createElement('div'); core.className = 'ink-core'; core.style.borderRadius = drop.shape; dropEl.appendChild(core);
            drop.splatters.forEach(s => {
                const sp = document.createElement('div'); sp.className = 'ink-splatter';
                sp.style.width = `${s.size}px`; sp.style.height = `${s.size}px`; sp.style.left = `calc(50% + ${s.x}px)`; sp.style.top = `calc(50% + ${s.y}px)`;
                dropEl.appendChild(sp);
            });
            canvas.appendChild(dropEl);
        });
        cell.appendChild(canvas);
    });
}

document.getElementById('prev-week').addEventListener('click', () => { currentMonday.setDate(currentMonday.getDate() - 7); renderGrid(); });
document.getElementById('next-week').addEventListener('click', () => { currentMonday.setDate(currentMonday.getDate() + 7); renderGrid(); });
document.getElementById('view-toggle').addEventListener('click', (e) => {
    viewMode = viewMode === 'weekly' ? 'aggregate' : 'weekly';
    e.target.textContent = viewMode === 'weekly' ? 'View: All-Time Stack' : 'View: Return to Weekly';
    renderGrid();
});

// --- MODAL & SETTINGS UI ---
const modal = document.getElementById('data-modal');
function switchTab(activeId, panelId) {
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.modal-panel').forEach(p => { p.classList.remove('active'); p.classList.add('hidden'); });
    document.getElementById(activeId).classList.add('active'); document.getElementById(panelId).classList.add('active'); document.getElementById(panelId).classList.remove('hidden');
}
document.getElementById('tab-about').addEventListener('click', () => switchTab('tab-about', 'panel-about'));
document.getElementById('tab-virtues').addEventListener('click', () => switchTab('tab-virtues', 'panel-virtues'));
document.getElementById('tab-data').addEventListener('click', () => { switchTab('tab-data', 'panel-data'); renderDataTable(); });

document.getElementById('open-log-btn').addEventListener('click', () => { renderVirtuesList(); renderDataTable(); modal.classList.remove('hidden'); });
document.getElementById('close-modal-btn').addEventListener('click', () => modal.classList.add('hidden'));

// --- VIRTUES EDITOR LOGIC ---
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
    const trimmed = newName.trim();
    if (virtues[index] === trimmed || trimmed === '') return renderVirtuesList(); 
    const oldName = virtues[index]; virtues[index] = trimmed;
    const newGrid = {};
    for(const key in gridData) {
        if(key.startsWith(`${oldName}_`)) newGrid[`${trimmed}_${key.substring(oldName.length + 1)}`] = gridData[key];
        else newGrid[key] = gridData[key];
    }
    gridData = newGrid; saveDataToCloud(); renderGrid(); renderDataTable();
}

function moveVirtue(index, dir) { const temp = virtues[index + dir]; virtues[index + dir] = virtues[index]; virtues[index] = temp; saveDataToCloud(); renderVirtuesList(); renderGrid(); renderDataTable(); }
function removeVirtue(index) { virtues.splice(index, 1); saveDataToCloud(); renderVirtuesList(); renderGrid(); renderDataTable(); }

document.getElementById('add-virtue-btn').addEventListener('click', () => {
    const val = document.getElementById('new-virtue-input').value.trim();
    if (val && !virtues.includes(val)) { virtues.push(val); document.getElementById('new-virtue-input').value = ''; saveDataToCloud(); renderVirtuesList(); renderGrid(); }
});

// --- TABULAR DATA LOGIC ---
document.getElementById('add-date-btn').addEventListener('click', () => {
    const newDate = document.getElementById('new-date-input').value;
    if (newDate) { forcedDates.add(newDate); renderDataTable(); }
});

function renderDataTable() {
    const table = document.getElementById('data-table'); table.innerHTML = '';
    const allDates = new Set(forcedDates);
    for (const cellId of Object.keys(gridData)) { if(gridData[cellId].length > 0 && cellId.split('_').length === 2) allDates.add(cellId.split('_')[1]); }
    allDates.add(formatDate(new Date()));
    const sortedDates = Array.from(allDates).sort((a,b) => b.localeCompare(a)); 

    let thead = '<thead><tr><th>Date</th>'; virtues.forEach(v => thead += `<th>${v}</th>`); table.innerHTML += thead + '</tr></thead>';
    let tbody = '<tbody>';
    sortedDates.forEach(date => {
        let row = `<tr><td><strong>${date}</strong></td>`;
        virtues.forEach(v => {
            const drops = gridData[`${v}_${date}`] || [];
            const val = drops.map(d => d.type === 1 ? 'P' : 'S').join(', ');
            row += `<td><input type="text" class="cell-input" data-cell="${v}_${date}" value="${val}" placeholder="-"></td>`;
        });
        tbody += row + `</tr>`;
    });
    table.innerHTML += tbody + '</tbody>';
}

function reconcileTableEdits() {
    saveState();
    document.querySelectorAll('.cell-input').forEach(input => {
        const cellId = input.getAttribute('data-cell');
        const parsedTypes = [];
        input.value.split(/[, ]+/).forEach(w => {
            const clean = w.trim().toLowerCase();
            if (clean === 'p' || clean === 'practiced') parsedTypes.push(1);
            if (clean === 's' || clean === 'slipped') parsedTypes.push(2);
        });

        const existingDrops = gridData[cellId] ? [...gridData[cellId]] : [];
        const reconciledDrops = [];
        parsedTypes.forEach(targetType => {
            let matchIndex = existingDrops.findIndex(drop => drop.type === targetType);
            if (matchIndex !== -1) reconciledDrops.push(existingDrops.splice(matchIndex, 1)[0]);
            else if (existingDrops.length > 0) {
                let repurposedDrop = existingDrops.splice(0, 1)[0]; repurposedDrop.type = targetType; reconciledDrops.push(repurposedDrop);
            } else reconciledDrops.push(generateRandomDrop(targetType, null, null));
        });
        gridData[cellId] = reconciledDrops;
    });
    syncVisualsToData();
}

document.getElementById('modal-sync-btn').addEventListener('click', async () => {
    reconcileTableEdits(); 
    await saveDataToCloud();
    const urlDisplay = document.getElementById('sync-url-display');
    navigator.clipboard.writeText(urlDisplay.value).then(() => {
        modal.classList.add('hidden'); setStatus("🔗 Cloud Saved & Link Copied!");
    });
});

// --- THEME TOGGLE LOGIC ---
const themeBtn = document.getElementById('theme-toggle');

// Initialize Theme based on localStorage, default to dark if nothing is set
const storedTheme = localStorage.getItem('theme') || 'dark';
if (storedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
    themeBtn.textContent = "DARK MODE";
} else {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeBtn.textContent = "LIGHT MODE";
}

themeBtn.addEventListener('click', () => {
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
        document.documentElement.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
        themeBtn.textContent = "DARK MODE";
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        themeBtn.textContent = "LIGHT MODE";
    }
});

// --- BOOT UP ---
initializeSession();
