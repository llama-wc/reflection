const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const resetBtn = document.getElementById("reset-btn");
const themeToggle = document.getElementById("theme-toggle");
const statusText = document.getElementById("loading-status");
const loadingIndicator = document.getElementById("loading-indicator");

const trackInitial = document.getElementById("track-initial");
const trackAssumption = document.getElementById("track-assumption");
const trackContradiction = document.getElementById("track-contradiction");
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

// Upgraded Auto-Synthesis Task
async function runAutoSynthesis() {
    trackUpdated.innerText = "Synthesizing current state...";
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: "You are an analytical observer. Summarize the core philosophical conflict between the user's premise and the AI's questioning in exactly one short, insightful sentence. Do not use quotes or introductory phrases." },
                    ...chatHistory.slice(-6) 
                ]
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            let summary = data.response.trim();
            
            summary = summary.replace(/^(Synthesis|Summary|Assistant|AI):/i, "").trim();
            
            if (summary.length < 5) {
                trackUpdated.innerText = "Awaiting deeper context for synthesis...";
            } else {
                trackUpdated.innerText = summary;
            }
        }
    } catch (error) {
        console.error("Auto-synthesis failed:", error);
        trackUpdated.innerText = "[Synthesis temporarily unavailable]";
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
            trackInitial.innerText = `"${text}"`;
            isFirstMessage = false;
            
            trackAssumption.innerText = "Clarifying definitions...";
            trackContradiction.innerText = "Awaiting defense...";

            systemPrompt = "You are a master Socratic philosopher. The user just stated a premise. Ask a single, gentle question to clarify their definition of a key term, or ask for the underlying reasoning behind their premise. Keep it under 20 words. Act genuinely curious.";
        } else {
            trackAssumption.innerText = "Evaluating logic...";
            trackContradiction.innerText = "Testing boundaries...";

            // THE ESCAPE HATCH: Allows the AI to agree and conclude the debate.
            systemPrompt = "You are a master Socratic philosopher. Evaluate the user's latest response. IF they have successfully refined their premise to be logically sound and nuanced (e.g., conceding an absolute like 'all' to 'some'), congratulate them on reaching a wiser conclusion, summarize the insight, and DO NOT ask any further questions. End the discussion. IF their logic still has flaws or absolute statements, acknowledge their point in 1 sentence, THEN ask ONE short, probing question to explore its limits.";
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

        // UI Logic: Check if Socrates concluded the debate
        if (finalResponse.endsWith("?")) {
            trackAssumption.innerText = "Argument mapped.";
            trackContradiction.innerText = "Awaiting user response...";
            userInput.placeholder = "Defend or refine your premise...";
        } else {
            trackAssumption.innerText = "Resolution reached.";
            trackContradiction.innerText = "Dialogue concluded.";
            userInput.placeholder = "Click 'Reset Engine' to start a new dialogue.";
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
    trackInitial.innerText = "Awaiting input...";
    trackAssumption.innerText = "Wait for premise...";
    trackContradiction.innerText = "Wait for premise...";
    trackUpdated.innerText = "Awaiting resolution...";
    userInput.placeholder = "State a premise or ask a question...";
    
    Array.from(chatBox.children).forEach(child => {
        if (child.id !== "loading-indicator") child.remove();
    });
});

sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleSend(); });

initializeEngine();
