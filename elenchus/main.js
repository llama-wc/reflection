const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const synthBtn = document.getElementById("synth-btn");
const resetBtn = document.getElementById("reset-btn");
const statusText = document.getElementById("loading-status");
const loadingIndicator = document.getElementById("loading-indicator");

const trackInitial = document.getElementById("track-initial");
const trackAssumption = document.getElementById("track-assumption");
const trackContradiction = document.getElementById("track-contradiction");
const trackUpdated = document.getElementById("track-updated");

let isFirstMessage = true;
let chatHistory = []; 
let lockedPremise = ""; 

function initializeEngine() {
    statusText.innerText = "Status: Online. Socratic Guide Authorized.";
    statusText.style.color = "#4CAF50";
    userInput.disabled = false;
    sendBtn.disabled = false;
    userInput.focus();
}

function appendMessage(role, text) {
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${role === "user" ? "user-msg" : "ai-msg"}`;
    msgDiv.innerText = text;
    chatBox.insertBefore(msgDiv, loadingIndicator); 
    chatBox.scrollTop = chatBox.scrollHeight;
}

async function handleSend() {
    const text = userInput.value.trim();
    if (!text) return;

    appendMessage("user", text);
    chatHistory.push({ role: "user", content: text });

    userInput.value = "";
    userInput.disabled = true;
    sendBtn.disabled = true;
    synthBtn.disabled = true;
  
    // Trigger the FBC loader
    loadingIndicator.style.display = "block"; 
    chatBox.scrollTop = chatBox.scrollHeight;

    try {
        let systemPrompt = "";

        if (isFirstMessage) {
            trackInitial.innerText = `"${text}"`;
            lockedPremise = text; 
            isFirstMessage = false;
            synthBtn.style.display = "block";
            
            trackAssumption.innerText = "Extracting core concept...";
            trackContradiction.innerText = "Exploring exceptions...";

            // The Wise, Patient Socrates (Turn 1)
            systemPrompt = "You are a wise, patient Socratic philosopher. The user just stated a premise. Adopt a posture of gentle curiosity. Find a specific, concrete counter-example that complicates their absolute statement, and ask a short, thoughtful question (under 15 words) exploring that exception. End with a question mark. Be polite but intellectually rigorous.";
        } else {
            trackAssumption.innerText = "Processing defense...";
            trackContradiction.innerText = "Philosopher engaged...";

            // The Wise, Patient Socrates (Turn 2+)
            systemPrompt = "You are a wise, patient Socratic philosopher. The user is defending their logic. Ask ONE short, gentle question (under 15 words) to help them see a blind spot in their reasoning. End with a question mark. Do not attack; guide them to question their own premise.";
        }

        // Hit the secure backend Cloudflare function
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: systemPrompt },
                    ...chatHistory.slice(-4) 
                ]
            })
        });

        if (!response.ok) throw new Error(`API Route failed with status: ${response.status}`);

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        let finalQuestion = data.response.trim();

        // Safety cleanup
        finalQuestion = finalQuestion.replace(/^(Assistant|Socrates|AI):/i, "").replace(/^["']|["']$/g, "").trim();

        loadingIndicator.style.display = "none";
        chatHistory.push({ role: "assistant", content: finalQuestion });
        appendMessage("ai", finalQuestion);

    } catch (error) {
        loadingIndicator.style.display = "none";
        appendMessage("ai", `SYSTEM ERROR: ${error.message}`);
        console.error(error);
    }

    userInput.disabled = false;
    sendBtn.disabled = false;
    synthBtn.disabled = false;
    userInput.focus();
}

async function handleSynthesize() {
    if (chatHistory.length === 0) return;
    
    userInput.disabled = true;
    sendBtn.disabled = true;
    synthBtn.disabled = true;
    trackUpdated.innerText = "Synthesizing...";

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages: [
                    { role: "system", content: "Summarize the conclusion of this discussion in exactly one short, enlightening sentence starting with 'I now see that...'" },
                    ...chatHistory
                ]
            })
        });

        if (!response.ok) throw new Error("API Route failed");

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        trackUpdated.innerText = data.response.trim().split('\n')[0];
    } catch (error) {
        trackUpdated.innerText = "Synthesis failed.";
        console.error(error);
    }
    
    userInput.disabled = false;
    sendBtn.disabled = false;
    synthBtn.disabled = false;
}

resetBtn.addEventListener("click", () => {
    isFirstMessage = true;
    chatHistory = []; 
    lockedPremise = "";
    trackInitial.innerText = "Awaiting input...";
    trackAssumption.innerText = "Wait for premise...";
    trackContradiction.innerText = "Wait for premise...";
    trackUpdated.innerText = "Awaiting resolution...";
    synthBtn.style.display = "none";
    
    Array.from(chatBox.children).forEach(child => {
        if (child.id !== "loading-indicator") child.remove();
    });
});

sendBtn.addEventListener("click", handleSend);
synthBtn.addEventListener("click", handleSynthesize);
userInput.addEventListener("keypress", (e) => { if (e.key === "Enter") handleSend(); });

// Start up!
initializeEngine();
