// ==========================================
// 1. DOM ELEMENTS & STATE
// ==========================================
const DOM = {
    chatBox: document.getElementById("chat-box"),
    userInput: document.getElementById("user-input"),
    sendBtn: document.getElementById("send-btn"),
    resetBtn: document.getElementById("reset-btn"),
    themeToggle: document.getElementById("theme-toggle"),
    statusText: document.getElementById("loading-status"),
    loadingIndicator: document.getElementById("loading-indicator"),
    trackUpdated: document.getElementById("track-updated")
};

let state = {
    isFirstMessage: true,
    originalPremise: "",
    chatHistory: [], // Memory for better conversational flow
};

// ==========================================
// 2. INITIALIZATION & THEME
// ==========================================
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

DOM.themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

function initializeEngine() {
    DOM.statusText.innerText = "Status: Online. Elenchus Learning Protocol Active.";
    DOM.userInput.disabled = false;
    DOM.sendBtn.disabled = false;
    DOM.userInput.focus();
    initTheme();
}

// ==========================================
// 3. UI HELPERS
// ==========================================
function appendMessage(role, text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role === "user" ? "user-msg" : "ai-msg"}`;
    msgDiv.innerText = text;
    DOM.chatBox.insertBefore(msgDiv, DOM.loadingIndicator); 
    DOM.chatBox.scrollTop = DOM.chatBox.scrollHeight;
}

function toggleLoading(isLoading) {
    DOM.loadingIndicator.style.display = isLoading ? "block" : "none";
    DOM.userInput.disabled = isLoading;
    DOM.sendBtn.disabled = isLoading;
    if (isLoading) DOM.chatBox.scrollTop = DOM.chatBox.scrollHeight;
    else DOM.userInput.focus();
}

// Keep only the most recent messages; the server rejects longer histories
const MAX_HISTORY = 20;
function addToHistory(role, content) {
    state.chatHistory.push({ role, content });
    while (state.chatHistory.length > MAX_HISTORY) state.chatHistory.shift();
}

// ==========================================
// 4. CORE ENGINE LOGIC (DECOUPLED)
// ==========================================

// TRACK 2: The Background Ledger
function setLedgerNote(text) {
    const note = document.createElement("em");
    note.style.color = "var(--text-muted)";
    note.textContent = text;
    DOM.trackUpdated.replaceChildren(note);
}

async function updateLogicLedger() {
    setLedgerNote("Updating logic state...");

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode: "ledger", messages: state.chatHistory })
        });

        if (!response.ok) throw new Error(`Ledger request failed with status: ${response.status}`);

        const data = await response.json();
        const ledgerData = JSON.parse(data.response);
        const fragment = document.createDocumentFragment();

        // Model output is rendered as text only, never as HTML
        const fallacy = ledgerData.fallacy_detected;
        if (fallacy && fallacy !== "null") {
            const warning = document.createElement("strong");
            warning.style.cssText = "color: var(--accent-red); display: block; margin-bottom: 10px;";
            warning.textContent = `[FALLACY DETECTED: ${fallacy}]`;
            fragment.appendChild(warning);
        }

        // Render the AI's current state (Questioning vs Informing)
        const posture = document.createElement("div");
        posture.style.cssText = "margin-bottom: 8px; font-size: 0.9em; color: var(--text-muted);";
        const label = document.createElement("strong");
        label.textContent = "AI Posture:";
        posture.append(label, ` [${String(ledgerData.ai_state || "Unknown").toUpperCase()}]`);
        fragment.appendChild(posture);

        // Render the user's logic state bullets
        const bullets = Array.isArray(ledgerData.state_bullets) ? ledgerData.state_bullets : [];
        bullets.forEach(point => {
            const line = document.createElement("div");
            line.textContent = `- ${point}`;
            fragment.appendChild(line);
        });

        DOM.trackUpdated.replaceChildren(fragment);
    } catch (error) {
        console.error("Ledger update failed:", error);
        setLedgerNote("[Ledger temporarily offline]");
    }
}

// TRACK 1: The Conversationalist
async function handleSend() {
    const text = DOM.userInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    
    // Let it remember the last 20 messages for excellent conversational flow
    addToHistory("user", text);
    
    DOM.userInput.value = "";
    toggleLoading(true);

    if (state.isFirstMessage) {
        state.originalPremise = text; 
        state.isFirstMessage = false;
    }

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: "chat",
                premise: state.originalPremise,
                messages: state.chatHistory
            })
        });

        if (!response.ok) throw new Error(`API Route failed with status: ${response.status}`);

        const data = await response.json();
        let finalResponse = data.response.trim();

        addToHistory("assistant", finalResponse);
        appendMessage("ai", finalResponse);

        if (!finalResponse.includes("?")) {
            DOM.userInput.placeholder = "Concept mastered (or engine pausing). Explore further...";
        } else {
            DOM.userInput.placeholder = "Explore this concept further...";
        }

        // Fire off the background ledger update asynchronously
        updateLogicLedger();

    } catch (error) {
        appendMessage("ai", `SYSTEM ERROR: ${error.message}`);
        console.error(error);
    } finally {
        toggleLoading(false);
    }
}

// ==========================================
// 5. EVENT LISTENERS
// ==========================================
DOM.resetBtn.addEventListener("click", () => {
    state.isFirstMessage = true;
    state.originalPremise = "";
    state.chatHistory = []; 
    DOM.trackUpdated.textContent = "Awaiting premise...";
    DOM.userInput.placeholder = "State a premise or ask a question...";

    Array.from(DOM.chatBox.children).forEach(child => {
        if (child.id !== "loading-indicator") child.remove();
    });
});

DOM.sendBtn.addEventListener("click", handleSend);
DOM.userInput.addEventListener("keypress", (e) => { 
    if (e.key === "Enter" && !DOM.sendBtn.disabled) handleSend(); 
});

initializeEngine();
