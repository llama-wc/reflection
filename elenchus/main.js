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
    // Changed to an array for native JSON compatibility
    learningState: ["Awaiting initial premise..."] 
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
async function handleSend() {
    const text = DOM.userInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    
    // Expanded buffer: Keep the last 12 messages (6 full conversational turns)
    state.chatHistory.push({ role: "user", content: text });
    if (state.chatHistory.length > 12) {
        state.chatHistory.shift(); 
    }
    
    DOM.userInput.value = "";
    toggleLoading(true);

    if (state.isFirstMessage) {
        state.originalPremise = text; 
        state.isFirstMessage = false;
    }

    DOM.trackUpdated.innerHTML = "<em>Analyzing logic state...</em>";

    // Convert the array state into a readable string for the prompt
    const stringifiedState = state.learningState.map(p => `- ${p}`).join('\n');

    // HARDENED SYSTEM PROMPT
    const systemPrompt = `You are a master Socratic educator. Your goal is to guide the user to critically examine their premise using historical, scientific, or philosophical frameworks.
    
    The user's original premise is: "${state.originalPremise}". 
    
    CURRENT LOGICAL STATE:
    \n${stringifiedState}\n

    RULES OF ENGAGEMENT:
    1. TEACH THROUGH INQUIRY: Introduce a specific, named concept (e.g., Biology, First Principles) to challenge their view, THEN ask a "How" or "Why" question.
    2. BE NATURAL: Do NOT say "Introducing the concept of...". Weave the concept into the dialogue naturally as if having a real conversation.
    3. HANDLE CONFUSION: If the user says "I don't know", "what do you mean?", or expresses confusion, DO NOT introduce a new concept. Briefly explain the previous concept in simple terms, then ask a smaller, guiding step-question to help them bridge the gap.
    4. NO THERAPY-SPEAK: Do not ask about their feelings or general openness. Stick strictly to the logic of the premise.
    5. THE KILL SWITCH (RESOLUTION): If the user concedes their original premise is flawed or successfully articulates the new truth, validate their logical growth, summarize the lesson, and explicitly END your response with a period. Absolutely NO questions once they concede.

    OUTPUT INSTRUCTIONS:
    You MUST output valid JSON only. No markdown formatting outside the JSON object.
    {
      "response_text": "Your Socratic reply (under 50 words).",
      "fallacy_detected": "Name of fallacy if used. Return null if none.",
      "updated_learning_state": ["Bullet 1 summarizing user's LOGICAL position", "Bullet 2"] // MUST be a JSON array of strings summarizing the user. Do not summarize your own questions.
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
                response_format: { type: "json_object" } 
            })
        });

        if (!response.ok) throw new Error(`API Route failed with status: ${response.status}`);

        const data = await response.json();
        
        let engineData;
        try {
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

        // 3. Update the invisible "Carry-On Bag" state safely using Native Arrays
        if (Array.isArray(engineData.updated_learning_state)) {
            state.learningState = engineData.updated_learning_state;
        } else if (typeof engineData.updated_learning_state === 'string') {
            // Fallback in case the LLM stubbornly returns a string anyway
            state.learningState = engineData.updated_learning_state.split('\n').filter(p => p.trim() !== '');
        }

        // 4. Render the Synthesis & Fallacy tracking safely
        let synthesisHTML = state.learningState.map(point => `- ${point.replace(/^- /, '')}`).join("<br>");
        
        // SAFETY NET: Handle stringified nulls
        if (engineData.fallacy_detected && 
            engineData.fallacy_detected !== "null" && 
            engineData.fallacy_detected.toLowerCase() !== "none") {
            
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
    state.learningState = ["Awaiting initial premise..."]; 

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
