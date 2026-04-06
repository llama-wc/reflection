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

// ==========================================
// 4. CORE ENGINE LOGIC (DECOUPLED)
// ==========================================

// TRACK 2: The Background Ledger
async function updateLogicLedger() {
    DOM.trackUpdated.innerHTML = "<em>Updating logic state...</em>";

    // PROMPT: Added 'ai_state' to track if the AI is questioning or informing
    const ledgerPrompt = `You are a background logic analyzer. Review the dialogue. 
    Output a valid JSON object strictly matching this schema:
    {
      "fallacy_detected": "Name of fallacy if the user used one. Return null if none.",
      "state_bullets": ["User claims X", "User conceded Y"],
      "ai_state": "Categorize the AI's latest response as either 'Questioning' (seeking input) or 'Informing' (providing facts/synthesizing without asking)."
    }`;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: ledgerPrompt },
                    ...state.chatHistory 
                ],
                response_format: { type: "json_object" } 
            })
        });

        if (response.ok) {
            const data = await response.json();
            const ledgerData = JSON.parse(data.response);
            
            // Render the AI's current state (Questioning vs Informing)
            let aiStateHTML = `<div style="margin-bottom: 8px; font-size: 0.9em; color: var(--text-muted);">
                <strong>AI Posture:</strong> [${ledgerData.ai_state.toUpperCase()}]
            </div>`;

            // Render the user's logic state bullets
            let bulletsHTML = ledgerData.state_bullets.map(point => `- ${point}`).join("<br>");
            
            let synthesisHTML = aiStateHTML + bulletsHTML;
            
            if (ledgerData.fallacy_detected && ledgerData.fallacy_detected !== "null") {
                synthesisHTML = `<strong style="color: var(--accent-red); display: block; margin-bottom: 10px;">[FALLACY DETECTED: ${ledgerData.fallacy_detected}]</strong>` + synthesisHTML;
            }
            
            DOM.trackUpdated.innerHTML = synthesisHTML;
        }
    } catch (error) {
        console.error("Ledger update failed:", error);
        DOM.trackUpdated.innerHTML = "<span style='color: var(--text-muted)'>[Ledger temporarily offline]</span>";
    }
}

// TRACK 1: The Conversationalist
async function handleSend() {
    const text = DOM.userInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    
    // Let it remember the last 20 messages for excellent conversational flow
    state.chatHistory.push({ role: "user", content: text });
    if (state.chatHistory.length > 20) {
        state.chatHistory.shift(); 
    }
    
    DOM.userInput.value = "";
    toggleLoading(true);

    if (state.isFirstMessage) {
        state.originalPremise = text; 
        state.isFirstMessage = false;
    }

    // UPDATED PROMPT: Devil's Advocate to prevent passive agreement
    const systemPrompt = `You are a master Socratic educator playing Devil's Advocate. 
    The user's original premise is: "${state.originalPremise}". 

    RULES:
    1. ALWAYS CHALLENGE: Your core purpose is to respectfully test the user's logic. Never passively agree with their premise to end the conversation. If they make a firm statement, probe the underlying assumptions or present a counter-perspective.
    2. BALANCE INQUIRY: You don't have to end every single message with a question mark. You can challenge them by stating a conflicting philosophical concept, pointing out a contradiction, or synthesizing their argument in a way that exposes a flaw. Let the intellectual tension of your statement prompt their reply.
    3. BE HUMAN: If the user calls you out, points out a flaw, or gets confused, ACKNOWLEDGE IT naturally before continuing. 
    4. THE KILL SWITCH: If the user explicitly concedes their premise is flawed, validate their growth, summarize the truth, and explicitly END your response with a period. Absolutely NO questions once they concede.
    
    Keep your response plain text and under 60 words.`;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    ...state.chatHistory 
                ]
            })
        });

        if (!response.ok) throw new Error(`API Route failed with status: ${response.status}`);

        const data = await response.json();
        let finalResponse = data.response.trim();

        state.chatHistory.push({ role: "assistant", content: finalResponse });
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
    DOM.trackUpdated.innerHTML = "Awaiting premise...";
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
