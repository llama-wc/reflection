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
    chatHistory: []
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
    DOM.statusText.innerText = "Status: Online. Ironclad Socratic Protocol Active.";
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
// 4. CORE ENGINE LOGIC (API CALLS)
// ==========================================

// Background Task: Analyzes the logic and catches fallacies
async function runAutoSynthesis() {
    DOM.trackUpdated.innerHTML = "<em>Analyzing logic flow and checking for fallacies...</em>";
    
    const synthesisPrompt = `You are a ruthless background logic analyzer. Review the ENTIRE dialogue. Break down the current state of the argument in 2 to 3 concise bullet points. 
    
    CRITICAL INSTRUCTION: If the user commits a logical fallacy (e.g., ad hominem, strawman, moving the goalposts, evasion), you MUST start your response with a warning in this exact format: [FALLACY DETECTED: Name of Fallacy]
    
    Focus on the evolution of the core premise. Do not include any other introductory text. Use standard hyphens (-) for bullets.`;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: synthesisPrompt },
                    ...state.chatHistory // Full context for synthesis
                ]
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            let summary = data.response.trim();
            
            // Format Fallacy tags to flash red
            if (summary.includes("[FALLACY DETECTED:")) {
                summary = summary.replace(/\[FALLACY DETECTED: (.*?)\]/g, '<strong style="color: var(--accent-red); display: block; margin-bottom: 10px;">[FALLACY DETECTED: $1]</strong>');
            }
            
            DOM.trackUpdated.innerHTML = summary.length < 5 ? "Awaiting deeper context for synthesis..." : summary;
        }
    } catch (error) {
        console.error("Auto-synthesis failed:", error);
        DOM.trackUpdated.innerHTML = "<span style='color: var(--text-muted)'>[Synthesis temporarily offline]</span>";
    }
}

// Main Task: Handles the Socratic dialogue
async function handleSend() {
    const text = DOM.userInput.value.trim();
    if (!text) return;

    // 1. Update UI and State
    appendMessage("user", text);
    state.chatHistory.push({ role: "user", content: text });
    DOM.userInput.value = "";
    toggleLoading(true);

    if (state.isFirstMessage) {
        state.originalPremise = text; // Anchor the premise
        state.isFirstMessage = false;
    }

    // 2. The Ironclad System Prompt
    const systemPrompt = `You are a relentless, authentic Socratic philosopher. 
    The user's original premise is: "${state.originalPremise}". Keep the debate anchored to this core concept.

    RULES OF ENGAGEMENT:
    1. THE LAZY TRAP: If the user gives a short, evasive, or non-committal answer (e.g., "yes", "no", "maybe", "sure", "I suppose"), DO NOT accept it as progress. Call out the evasion and force them to articulate *why*.
    2. OPEN-ENDED ONLY: You must ask open-ended questions (How, Why, What). NEVER ask a question that can be answered with a simple "Yes" or "No".
    3. NO TRIVIA: Anchor on the core philosophical logic. Do not devolve into dictionary definitions or pedantic semantic trivia.
    4. NO PLEASANTRIES: Never use phrases like "I acknowledge", "I see", "Good point", or "That is true". Be sharp and direct.
    5. RESOLUTION: IF the user has successfully articulated a logically sound, nuanced, and defensible position that refines their original premise, state your agreement clearly, summarize the philosophical truth reached, and END your response. Do NOT ask a question.
    6. ONGOING DEBATE: If their logic remains flawed, absolute, or contradictory, attack the flaw with ONE concise, open-ended question.

    Keep your response under 40 words.`;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    // Slice keeps API fast, but originalPremise in prompt prevents amnesia
                    ...state.chatHistory.slice(-10) 
                ]
            })
        });

        if (!response.ok) throw new Error(`API Route failed with status: ${response.status}`);

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Clean up AI response
        let finalResponse = data.response.trim().replace(/^(Assistant|Socrates|AI):/i, "").trim();

        state.chatHistory.push({ role: "assistant", content: finalResponse });
        appendMessage("ai", finalResponse);

        // Update UI based on resolution status
        if (!finalResponse.includes("?")) {
            DOM.userInput.placeholder = "Dialogue concluded. Click 'Reset Engine' to restart.";
        } else {
            DOM.userInput.placeholder = "Defend or refine your premise...";
        }

        runAutoSynthesis();

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
    
    // Clear chat box except for the hidden loading indicator
    Array.from(DOM.chatBox.children).forEach(child => {
        if (child.id !== "loading-indicator") child.remove();
    });
});

DOM.sendBtn.addEventListener("click", handleSend);
DOM.userInput.addEventListener("keypress", (e) => { 
    if (e.key === "Enter" && !DOM.sendBtn.disabled) handleSend(); 
});

// Boot up
initializeEngine();
