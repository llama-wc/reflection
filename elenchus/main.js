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

// NOVELTY: The Auto-Fallacy Catcher & Bulleted Synthesis
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
                        content: `You are a ruthless background logic analyzer. Review the dialogue. Break down the current state of the argument in 2 to 3 concise bullet points. 
                        
                        CRITICAL INSTRUCTION: If the user commits a logical fallacy (e.g., ad hominem, strawman, moving the goalposts, false dichotomy, circular reasoning), you MUST start your response with a warning in this exact format: [FALLACY DETECTED: Name of Fallacy]
                        
                        Then provide the bullet points. Do not include any other introductory text. Use standard hyphens (-) for bullets.` 
                    },
                    ...chatHistory.slice(-6) 
                ]
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            let summary = data.response.trim();
            
            // Format the Fallacy tag to highlight in red if it exists
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
            systemPrompt = "You are a sharp, direct Socratic philosopher. The user just stated a premise. Ask a single, pointed question to clarify their definition of a key term or their underlying reasoning. Keep it under 20 words. Do not be polite; be strictly analytical.";
        } else {
            // THE IRONCLAD ESCAPE HATCH & ANTI-ROBOT RULES
            systemPrompt = `You are a sharp, direct Socratic philosopher. Evaluate the user's latest response. 
            1. IF they successfully refined their premise to be logically sound, agree with them naturally and end the discussion without asking a question.
            2. IF they are being evasive, giving one-word answers, or making absurd absolute claims, boldly point out the logical contradiction between their current statement and reality (or their previous claims). Force them to reconcile it.
            3. IF they are engaging in good faith but still have flaws, ask ONE short, probing question.
            CRITICAL RULE: NEVER use the phrases "I acknowledge", "I see your point", or "That's a good point". Speak like a relentless, highly intelligent philosopher. Keep it under 30 words.`;
        }

        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    ...chatHistory.slice(-5) 
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

        // Check if Socrates concluded the debate
        if (!finalResponse.includes("?")) {
            userInput.placeholder = "Dialogue concluded. Click 'Reset Engine' to restart.";
        } else {
            userInput.placeholder = "Defend or refine your premise...";
        }

        // Trigger synthesis
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
