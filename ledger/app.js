const virtues = [
    "Temperance", "Silence", "Order", "Resolution", "Frugality", 
    "Industry", "Sincerity", "Justice", "Moderation", "Cleanliness", 
    "Tranquility", "Chastity", "Humility"
];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

let gridData = {}; 
const container = document.getElementById('grid-container');

// --- INITIALIZATION ---
function loadData() {
    const saved = localStorage.getItem('reflection_ledger');
    if (saved) {
        gridData = JSON.parse(saved);
    }
}

// --- VISUAL GRID GENERATION ---
function renderGrid() {
    container.innerHTML = '';
    
    container.appendChild(createCell('', 'grid-header'));
    days.forEach(day => container.appendChild(createCell(day, 'grid-header')));

    virtues.forEach(virtue => {
        container.appendChild(createCell(virtue, 'grid-header virtue-label'));
        
        days.forEach(day => {
            const cellId = `${virtue}-${day}`;
            const cell = createCell('', 'grid-cell');
            cell.dataset.id = cellId;
            
            if (gridData[cellId] === undefined) gridData[cellId] = 0;
            
            updateCellVisuals(cell, gridData[cellId]);
            
            cell.addEventListener('click', () => {
                gridData[cellId] = (gridData[cellId] + 1) % 4;
                updateCellVisuals(cell, gridData[cellId]);
            });
            
            container.appendChild(cell);
        });
    });
}

function createCell(text, className) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    return div;
}

function updateCellVisuals(cell, state) {
    cell.innerHTML = ''; 
    
    const addBlot = (type) => {
        const blot = document.createElement('div');
        blot.className = `ink-blot ${type}`;
        const rotate = Math.floor(Math.random() * 360);
        const offsetX = Math.floor(Math.random() * 10) - 5;
        const offsetY = Math.floor(Math.random() * 10) - 5;
        blot.style.transform = `rotate(${rotate}deg) translate(${offsetX}px, ${offsetY}px)`;
        cell.appendChild(blot);
    };

    if (state === 1 || state === 3) addBlot('ink-success');
    if (state === 2 || state === 3) addBlot('ink-failure');
}

// --- BUTTON LOGIC ---

// 1. Save Data
document.getElementById('save-btn').addEventListener('click', () => {
    localStorage.setItem('reflection_ledger', JSON.stringify(gridData));
    const status = document.getElementById('save-status');
    status.textContent = "Ledger updated.";
    setTimeout(() => status.textContent = "", 2000);
});

// 2. Export Data
document.getElementById('export-btn').addEventListener('click', () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(gridData));
    const downloadAnchorNode = document.createElement('a');
    downloadAnchorNode.setAttribute("href", dataStr);
    downloadAnchorNode.setAttribute("download", "festina_lente_ledger.json");
    document.body.appendChild(downloadAnchorNode);
    downloadAnchorNode.click();
    downloadAnchorNode.remove();
});

// 3. Import Data
document.getElementById('import-btn').addEventListener('click', () => {
    document.getElementById('import-file').click();
});

document.getElementById('import-file').addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            gridData = JSON.parse(e.target.result);
            localStorage.setItem('reflection_ledger', JSON.stringify(gridData));
            renderGrid();
            const status = document.getElementById('save-status');
            status.textContent = "Data imported!";
            setTimeout(() => status.textContent = "", 3000);
        } catch (err) {
            alert("Error: Invalid JSON file.");
        }
    };
    reader.readAsText(file);
});

// 4. Theme Toggle
const themeBtn = document.getElementById('theme-toggle');
const currentTheme = localStorage.getItem('theme') || 'light';

if (currentTheme === 'dark') {
    document.documentElement.setAttribute('data-theme', 'dark');
    themeBtn.textContent = "☀️ Ivory Paper";
}

themeBtn.addEventListener('click', () => {
    let theme = document.documentElement.getAttribute('data-theme');
    if (theme === 'dark') {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('theme', 'light');
        themeBtn.textContent = "🌙 Dark Slate";
    } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('theme', 'dark');
        themeBtn.textContent = "☀️ Ivory Paper";
    }
});

// --- BOOT UP ---
loadData();
renderGrid();
