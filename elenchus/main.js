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
    // Stripped "Socratic" from the status bar
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
// 4. CORE ENGINE LOGIC (API CALLS)
// ==========================================

async function runAutoSynthesis() {
    DOM.trackUpdated.innerHTML = "<em>Analyzing learning progress...</em>";
    
    // Updated synthesis to focus on learning rather than arguing
    const synthesisPrompt = `You are a background logic analyzer. Review the ENTIRE dialogue. Break down the user's current understanding in 2 to 3 concise bullet points. 
    
    CRITICAL INSTRUCTION: If the user relies on a logical fallacy (e.g., ad hominem, strawman, evasion), you MUST start your response with a warning in this exact format: [FALLACY DETECTED: Name of Fallacy]
    
    Focus on what the user is learning or exploring. Do not include introductory text. Use standard hyphens (-) for bullets.`;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: synthesisPrompt },
                    ...state.chatHistory 
                ]
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            let summary = data.response.trim();
            
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

async function handleSend() {
    const text = DOM.userInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    state.chatHistory.push({ role: "user", content: text });
    DOM.userInput.value = "";
    toggleLoading(true);

    if (state.isFirstMessage) {
        state.originalPremise = text; 
        state.isFirstMessage = false;
    }

    // THE MASTER EDUCATOR PROMPT
    const systemPrompt = `You are a master educator guiding the user to learn a new concept or truth using the method of guided inquiry.
    The user's original premise is: "${state.originalPremise}". Your goal is to help them expand their understanding, grounded in logic and the wisdom of historical thinkers, scientists, or philosophers.

    RULES OF ENGAGEMENT:
    1. TEACH THROUGH INQUIRY: Do not just attack their logic. If they lack context or ask a question, briefly introduce a relevant concept from history, science, or philosophy, THEN ask an open-ended question about how it applies to their premise.
    2. CLEAR & ACCESSIBLE: Keep your language simple, conversational, and encouraging. Absolutely no dense, academic jargon. 
    3. THE LAZY TRAP: If they give short answers like "maybe", "yes", or "sure", gently push them to articulate *why* they think that.
    4. NO YES/NO QUESTIONS: Ask "How", "Why", or "What".
    5. RESOLUTION: When the user reaches a genuine "aha!" moment, successfully refines their premise, or demonstrates understanding of the new concept, validate their insight, summarize the lesson learned, and END the response without a question.

    Keep your response under 50 words.`;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    ...state.chatHistory.slice(-10) 
                ]
            })
        });

        if (!response.ok) throw new Error(`API Route failed with status: ${response.status}`);

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        let finalResponse = data.response.trim().replace(/^(Assistant|Teacher|AI):/i, "").trim();

        state.chatHistory.push({ role: "assistant", content: finalResponse });
        appendMessage("ai", finalResponse);

        if (!finalResponse.includes("?")) {
            DOM.userInput.placeholder = "Concept mastered. Click 'Reset Engine' to explore a new topic.";
        } else {
            DOM.userInput.placeholder = "Explore this concept further...";
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
    
    Array.from(DOM.chatBox.children).forEach(child => {
        if (child.id !== "loading-indicator") child.remove();
    });
});

DOM.sendBtn.addEventListener("click", handleSend);
DOM.userInput.addEventListener("keypress", (e) => { 
    if (e.key === "Enter" && !DOM.sendBtn.disabled) handleSend(); 
});

initializeEngine();
