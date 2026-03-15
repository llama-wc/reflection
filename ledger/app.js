const virtues = [
    "Temperance", "Silence", "Order", "Resolution", "Frugality", 
    "Industry", "Sincerity", "Justice", "Moderation", "Cleanliness", 
    "Tranquility", "Chastity", "Humility"
];

let gridData = {}; 
let undoStack = [];
let redoStack = [];
let currentTool = 1; 

function getMonday(d) {
    d = new Date(d);
    let day = d.getDay(), diff = d.getDate() - day + (day == 0 ? -6 : 1); 
    return new Date(d.setDate(diff));
}
let currentMonday = getMonday(new Date());

const container = document.getElementById('grid-container');
const weekDisplay = document.getElementById('week-display');
const statusText = document.getElementById('save-status');

function setStatus(msg, duration = 3000) {
    statusText.textContent = msg;
    setTimeout(() => statusText.textContent = "", duration);
}

function loadData() {
    const saved = localStorage.getItem('reflection_ledger');
    if (saved) gridData = JSON.parse(saved);
}

function randomBlobShape() {
    const r = () => 40 + Math.floor(Math.random() * 20); 
    return `${r()}% ${r()}% ${r()}% ${r()}% / ${r()}% ${r()}% ${r()}% ${r()}%`;
}

function generateRandomDrop(type, clickX = null, clickY = null) {
    const drop = {
        type: type,
        scale: 0.7 + (Math.random() * 0.4), 
        rotate: Math.floor(Math.random() * 360),
        x: clickX !== null ? clickX : (Math.floor(Math.random() * 20) - 10),
        y: clickY !== null ? clickY : (Math.floor(Math.random() * 20) - 10),
        shape: randomBlobShape(),
        splatters: []
    };
    const splatterCount = Math.floor(Math.random() * 3) + 1;
    for(let i=0; i<splatterCount; i++) {
        drop.splatters.push({ size: 1 + Math.random() * 2, x: (Math.random() * 26) - 13, y: (Math.random() * 26) - 13 });
    }
    return drop;
}

const btnSuccess = document.getElementById('tool-success');
const btnFailure = document.getElementById('tool-failure');
const btnEraser = document.getElementById('tool-eraser');

function setActiveTool(btn, toolId) {
    currentTool = toolId;
    [btnSuccess, btnFailure, btnEraser].forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
}
btnSuccess.addEventListener('click', () => setActiveTool(btnSuccess, 1));
btnFailure.addEventListener('click', () => setActiveTool(btnFailure, 2));
btnEraser.addEventListener('click', () => setActiveTool(btnEraser, 0));

function saveState() {
    undoStack.push(JSON.parse(JSON.stringify(gridData)));
    redoStack = []; 
    document.getElementById('undo-btn').disabled = undoStack.length === 0;
    document.getElementById('redo-btn').disabled = redoStack.length === 0;
}
document.getElementById('undo-btn').addEventListener('click', () => {
    if (undoStack.length > 0) {
        redoStack.push(JSON.parse(JSON.stringify(gridData)));
        gridData = undoStack.pop();
        syncVisualsToData(); 
        document.getElementById('undo-btn').disabled = undoStack.length === 0;
        document.getElementById('redo-btn').disabled = redoStack.length === 0;
    }
});
document.getElementById('redo-btn').addEventListener('click', () => {
    if (redoStack.length > 0) {
        undoStack.push(JSON.parse(JSON.stringify(gridData)));
        gridData = redoStack.pop();
        syncVisualsToData();
        document.getElementById('undo-btn').disabled = undoStack.length === 0;
        document.getElementById('redo-btn').disabled = redoStack.length === 0;
    }
});

function formatDate(date) {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1), day = '' + d.getDate(), year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
}

function renderGrid() {
    container.innerHTML = '';
    container.appendChild(createCell('', 'grid-header'));
    
    for (let i = 0; i < 7; i++) {
        let d = new Date(currentMonday);
        d.setDate(d.getDate() + i);
        const dateStr = d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
        container.appendChild(createCell(dateStr, 'grid-header'));
    }

    weekDisplay.textContent = `Week of ${currentMonday.toLocaleDateString()}`;

    virtues.forEach(virtue => {
        container.appendChild(createCell(virtue, 'grid-header virtue-label'));
        for (let i = 0; i < 7; i++) {
            let d = new Date(currentMonday);
            d.setDate(d.getDate() + i);
            const cellId = `${virtue}_${formatDate(d)}`; 
            
            const cell = createCell('', 'grid-cell');
            cell.dataset.id = cellId;
            if (!Array.isArray(gridData[cellId])) gridData[cellId] = [];
            
            cell.addEventListener('click', (e) => {
                saveState();
                if (currentTool === 0) {
                    gridData[cellId] = []; 
                } else {
                    const rect = cell.getBoundingClientRect();
                    gridData[cellId].push(generateRandomDrop(currentTool, e.clientX - rect.left, e.clientY - rect.top));
                }
                syncVisualsToData();
            });
            container.appendChild(cell);
        }
    });
    syncVisualsToData(); 
}

function createCell(text, className) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    return div;
}

function syncVisualsToData() {
    const cells = document.querySelectorAll('.grid-cell');
    cells.forEach(cell => {
        const cellId = cell.dataset.id;
        const drops = gridData[cellId] || [];
        cell.innerHTML = ''; 
        if (drops.length === 0) return;
        
        const canvas = document.createElement('div');
        canvas.className = 'cell-ink-canvas';
        
        drops.forEach(drop => {
            const dropEl = document.createElement('div');
            dropEl.className = `ink-drop ${drop.type === 1 ? 'ink-success' : 'ink-failure'}`;
            dropEl.style.left = `${drop.x !== undefined ? drop.x : 20}px`;
            dropEl.style.top = `${drop.y !== undefined ? drop.y : 20}px`;
            dropEl.style.transform = `translate(-50%, -50%) rotate(${drop.rotate}deg) scale(${drop.scale})`;
            
            const core = document.createElement('div'); 
            core.className = 'ink-core';
            core.style.borderRadius = drop.shape; 
            dropEl.appendChild(core);
            
            drop.splatters.forEach(s => {
                const splatter = document.createElement('div');
                splatter.className = 'ink-splatter';
                splatter.style.width = `${s.size}px`; splatter.style.height = `${s.size}px`;
                splatter.style.left = `calc(50% + ${s.x}px)`; splatter.style.top = `calc(50% + ${s.y}px)`;
                dropEl.appendChild(splatter);
            });
            canvas.appendChild(dropEl);
        });
        cell.appendChild(canvas);
    });
}

document.getElementById('prev-week').addEventListener('click', () => {
    currentMonday.setDate(currentMonday.getDate() - 7);
    renderGrid();
});
document.getElementById('next-week').addEventListener('click', () => {
    currentMonday.setDate(currentMonday.getDate() + 7);
    renderGrid();
});

document.getElementById('save-btn').addEventListener('click', () => {
    localStorage.setItem('reflection_ledger', JSON.stringify(gridData));
    setStatus("Ledger safely dried and saved.");
});

document.getElementById('sync-link-btn').addEventListener('click', () => {
    try {
        const encodedData = btoa(JSON.stringify(gridData));
        const syncUrl = `${window.location.origin}${window.location.pathname}?sync=${encodedData}`;
        navigator.clipboard.writeText(syncUrl).then(() => setStatus("Sync Link copied to clipboard!"))
        .catch(err => setStatus("Failed to copy link."));
    } catch (e) {
        setStatus("Error generating link.");
    }
});

function checkForSyncLink() {
    const urlParams = new URLSearchParams(window.location.search);
    const syncData = urlParams.get('sync');
    if (syncData) {
        try {
            saveState(); 
            gridData = JSON.parse(atob(syncData));
            localStorage.setItem('reflection_ledger', JSON.stringify(gridData));
            window.history.replaceState({}, document.title, window.location.pathname);
            renderGrid(); 
            setStatus("Ledger successfully synced from link!");
        } catch (e) {
            setStatus("Invalid or broken sync link.");
        }
    }
}

const modal = document.getElementById('info-modal');
document.getElementById('modal-open-btn').addEventListener('click', () => modal.classList.add('active'));
document.getElementById('modal-close-btn').addEventListener('click', () => modal.classList.remove('active'));

modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.remove('active');
});

const tabBtns = document.querySelectorAll('.tab-btn');
const tabPanels = document.querySelectorAll('.tab-panel');

tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        tabPanels.forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById(btn.dataset.target).classList.add('active');
    });
});

const themeBtn = document.getElementById('theme-toggle');
if (localStorage.getItem('theme') === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeBtn.textContent = "Ivory Paper";
}
themeBtn.addEventListener('click', () => {
    if (document.documentElement.getAttribute('data-theme') === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        themeBtn.textContent = "Dark Slate";
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        themeBtn.textContent = "Ivory Paper";
    }
});

loadData();
renderGrid();
document.getElementById('undo-btn').disabled = true;
document.getElementById('redo-btn').disabled = true;
checkForSyncLink();
