const virtues = [
    "Temperance", "Silence", "Order", "Resolution", "Frugality", 
    "Industry", "Sincerity", "Justice", "Moderation", "Cleanliness", 
    "Tranquility", "Chastity", "Humility"
];
const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// State definitions: 0=Empty, 1=Success, 2=Failure, 3=Both
let gridData = {}; 

const container = document.getElementById('grid-container');

// Load existing data from localStorage
function loadData() {
    const saved = localStorage.getItem('reflection_ledger');
    if (saved) {
        gridData = JSON.parse(saved);
    }
}

// Generate the visual grid
function renderGrid() {
    container.innerHTML = '';
    
    // Top-left empty corner
    container.appendChild(createCell('', 'grid-header'));
    
    // Day headers
    days.forEach(day => container.appendChild(createCell(day, 'grid-header')));

    // Rows for each virtue
    virtues.forEach(virtue => {
        container.appendChild(createCell(virtue, 'grid-header virtue-label'));
        
        days.forEach(day => {
            const cellId = `${virtue}-${day}`;
            const cell = createCell('', 'grid-cell');
            cell.dataset.id = cellId;
            
            // Initialize data if it doesn't exist
            if (gridData[cellId] === undefined) gridData[cellId] = 0;
            
            updateCellVisuals(cell, gridData[cellId]);
            
            // Click listener to cycle states
            cell.addEventListener('click', () => {
                gridData[cellId] = (gridData[cellId] + 1) % 4;
                updateCellVisuals(cell, gridData[cellId]);
            });
            
            container.appendChild(cell);
        });
    });
}

// Helper to create divs
function createCell(text, className) {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    return div;
}

// Renders the organic ink blots based on state
function updateCellVisuals(cell, state) {
    cell.innerHTML = ''; // Clear existing ink
    
    // Helper to add a blot with slight random rotation and offset
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

// Save button logic
document.getElementById('save-btn').addEventListener('click', () => {
    localStorage.setItem('reflection_ledger', JSON.stringify(gridData));
    const status = document.getElementById('save-status');
    status.textContent = "Dried and recorded.";
    setTimeout(() => status.textContent = "", 2000);
});

// Boot up
loadData();
renderGrid();
