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
    chatHistory: [],
    // NEW: The "Carry-On Bag". We store the summary here instead of re-reading history.
    learningState: "Awaiting initial premise..." 
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
// 4. CORE ENGINE LOGIC (OPTIMIZED API CALL)
// ==========================================
// NOTE: runAutoSynthesis() has been DELETED. 
// We now do everything in one pass inside handleSend().

async function handleSend() {
    const text = DOM.userInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    
    // OPTIMIZATION: We only keep the last 4 messages for immediate conversational flow. 
    // The U-Haul trailer of history is gone.
    state.chatHistory.push({ role: "user", content: text });
    if (state.chatHistory.length > 4) {
        state.chatHistory.shift(); 
    }
    
    DOM.userInput.value = "";
    toggleLoading(true);

    if (state.isFirstMessage) {
        state.originalPremise = text; 
        state.isFirstMessage = false;
    }

    DOM.trackUpdated.innerHTML = "<em>Analyzing learning progress...</em>";

    // THE COMPRESSED SYSTEM PROMPT
    const systemPrompt = `You are a master educator guiding the user to learn a new concept using the method of guided inquiry.
    The user's original premise is: "${state.originalPremise}". 
    
    CURRENT LEARNING STATE:
    "${state.learningState}"

    RULES OF ENGAGEMENT:
    1. TEACH THROUGH INQUIRY: Briefly introduce a relevant concept (history, science, philosophy), THEN ask an open-ended "How", "Why", or "What" question.
    2. CLEAR & ACCESSIBLE: No dense jargon. Keep it conversational.
    3. THE LAZY TRAP: Push them to articulate if answers are short.
    4. RESOLUTION: If they reach an "aha!" moment, validate and END without a question.

    OUTPUT INSTRUCTIONS:
    You MUST output valid JSON only. No markdown formatting outside the JSON object.
    {
      "response_text": "Your Socratic reply to the user (under 50 words).",
      "fallacy_detected": "Name of fallacy if used (e.g., 'Ad Hominem'). Return null if none.",
      "updated_learning_state": "A 2-3 bullet point summary of their current understanding. This replaces the old state."
    }`;

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    ...state.chatHistory 
                ],
                // Tell your backend to pass this flag to Groq to enforce JSON
                response_format: { type: "json_object" } 
            })
        });

        if (!response.ok) throw new Error(`API Route failed with status: ${response.status}`);

        const data = await response.json();
        
        // SAFETY NET: Parse the JSON response securely
        let engineData;
        try {
            // Assuming data.response is the raw string returned by the LLM
            engineData = JSON.parse(data.response); 
        } catch (parseError) {
            console.warn("LLM deviated from JSON format. Attempting extraction...", data.response);
            const jsonMatch = data.response.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                engineData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error("Failed to parse JSON schema from API.");
            }
        }

        // 1. Render the AI's reply
        let finalResponse = engineData.response_text.trim();
        state.chatHistory.push({ role: "assistant", content: finalResponse });
        appendMessage("ai", finalResponse);

        // 2. Check for resolution
        if (!finalResponse.includes("?")) {
            DOM.userInput.placeholder = "Concept mastered. Click 'Reset Engine' to explore a new topic.";
        } else {
            DOM.userInput.placeholder = "Explore this concept further...";
        }

        // 3. Update the invisible "Carry-On Bag" state
        state.learningState = engineData.updated_learning_state || state.learningState;

        // 4. Render the Synthesis & Fallacy tracking
        let synthesisHTML = state.learningState.replace(/\n/g, "<br>");
        if (engineData.fallacy_detected) {
            synthesisHTML = `<strong style="color: var(--accent-red); display: block; margin-bottom: 10px;">[FALLACY DETECTED: ${engineData.fallacy_detected}]</strong>` + synthesisHTML;
        }
        DOM.trackUpdated.innerHTML = synthesisHTML;

    } catch (error) {
        appendMessage("ai", `SYSTEM ERROR: ${error.message}`);
        console.error(error);
        DOM.trackUpdated.innerHTML = "<span style='color: var(--text-muted)'>[Synthesis temporarily offline]</span>";
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
    state.learningState = "Awaiting initial premise..."; // Reset the carry-on bag

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
