const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const resetBtn = document.getElementById("reset-btn");
const themeToggle = document.getElementById("theme-toggle");
const statusText = document.getElementById("loading-status");
const loadingIndicator = document.getElementById("loading-indicator");

const trackUpdated = document.getElementById("track-updated");

let isFirstMessage = true;
let chatHistory = []; 

// Theme Toggle Logic
function initTheme() {
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
}

themeToggle.addEventListener('click', () => {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
});

function initializeEngine() {
    statusText.innerText = "Status: Online. Virtue Socratic Engine Active.";
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
    initTheme();
}

function appendMessage(role, text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role === "user" ? "user-msg" : "ai-msg"}`;
    msgDiv.innerText = text;
    chatBox.insertBefore(msgDiv, loadingIndicator); 
    chatBox.scrollTop = chatBox.scrollHeight;
}

// SYNTHESIS UPGRADE: Now sees the entire conversation, not just the last 6 messages
async function runAutoSynthesis() {
    trackUpdated.innerHTML = "<em>Analyzing logic flow and checking for fallacies...</em>";
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { 
                        role: "system", 
                        content: `You are a ruthless background logic analyzer. Review the ENTIRE dialogue provided. Break down the current state of the argument in 2 to 3 concise bullet points. 
                        
                        CRITICAL INSTRUCTION: If the user commits a logical fallacy (e.g., ad hominem, strawman, moving the goalposts), you MUST start your response with a warning in this exact format: [FALLACY DETECTED: Name of Fallacy]
                        
                        Focus on the evolution of the core premise. Do not include any other introductory text. Use standard hyphens (-) for bullets.` 
                    },
                    ...chatHistory // Passing the full history so it never loses context
                ]
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            let summary = data.response.trim();
            
            if (summary.includes("[FALLACY DETECTED:")) {
                summary = summary.replace(/\[FALLACY DETECTED: (.*?)\]/g, '<strong style="color: var(--accent-red); display: block; margin-bottom: 10px;">[FALLACY DETECTED: $1]</strong>');
            }
            
            if (summary.length < 5) {
                trackUpdated.innerHTML = "Awaiting deeper context for synthesis...";
            } else {
                trackUpdated.innerHTML = summary;
            }
        }
    } catch (error) {
        console.error("Auto-synthesis failed:", error);
        trackUpdated.innerHTML = "[Synthesis temporarily unavailable]";
    }
}

async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    chatHistory.push({ role: "user", content: text });

    userInput.value = "";
    userInput.disabled = true;
    sendBtn.disabled = true;
    loadingIndicator.style.display = "block"; 
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        let systemPrompt = "";

        if (isFirstMessage) {
            isFirstMessage = false;
            systemPrompt = "You are a masterful, authentic Socratic philosopher. The user just stated a premise. Ask a single, pointed question to clarify their definition of a key term or their underlying reasoning. Keep it under 20 words. Be analytical but conversational.";
        } else {
            // PROMPT UPGRADE: Banning trivia, allowing guidance when asked.
            systemPrompt = `You are an authentic Socratic philosopher, not a pedantic trivia bot. Evaluate the user's latest response.
            1. Stay strictly focused on the user's core philosophical concept. DO NOT introduce random tangential trivia (like asking about tomatoes being fruits) just to be difficult.
            2. IF the user asks for help (e.g., "how to improve?"), step out of pure questioning. Offer a brief, guiding philosophical hint, THEN ask a relevant question to prompt their realization.
            3. IF they successfully refined their premise to be logically sound, agree naturally and end the discussion without asking a question.
            4. IF they are engaging in good faith but still have flaws, ask ONE highly relevant, probing question to test the limits of their logic.
            Speak with profound intelligence. Keep it under 40 words.`;
        }

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    ...chatHistory.slice(-14) // Increased memory to 14 turns so it holds onto the core argument
                ]
            })
        });

        if (!response.ok) throw new Error(`API Route failed with status: ${response.status}`);

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        let finalResponse = data.response.trim();
        finalResponse = finalResponse.replace(/^(Assistant|Socrates|AI):/i, "").trim();

        loadingIndicator.style.display = "none";
        chatHistory.push({ role: "assistant", content: finalResponse });
        appendMessage("ai", finalResponse);

        if (!finalResponse.includes("?")) {
            userInput.placeholder = "Dialogue concluded. Click 'Reset Engine' to restart.";
        } else {
            userInput.placeholder = "Defend or refine your premise...";
        }

        runAutoSynthesis();

    } catch (error) {
        loadingIndicator.style.display = "none";
        appendMessage("ai", `SYSTEM ERROR: ${error.message}`);
        console.error(error);
    }

    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
}

resetBtn.addEventListener("click", () => {
    isFirstMessage = true;
    chatHistory = []; 
    trackUpdated.innerHTML = "Awaiting premise...";
    userInput.placeholder = "State a premise or ask a question...";
    
    Array.from(chatBox.children).forEach(child => {
        if (child.id !== "loading-indicator") child.remove();
    });
});

sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleSend(); });

initializeEngine();
