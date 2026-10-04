// Only pages on these origins may call this endpoint from a browser.
const ALLOWED_ORIGINS = ["https://elenchus.mac-wall.com", "https://mac-wall.com"];

const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
const MAX_PREMISE_CHARS = 1000;

// System prompts live on the server so callers can't repurpose the API key.
function chatPrompt(premise) {
    return `You are a master Socratic educator playing Devil's Advocate.
    The user's original premise is: "${premise}".

    RULES:
    1. ALWAYS CHALLENGE: Your core purpose is to respectfully test the user's logic. Never passively agree with their premise to end the conversation. If they make a firm statement, probe the underlying assumptions or present a counter-perspective.
    2. BALANCE INQUIRY: You don't have to end every single message with a question mark. You can challenge them by stating a conflicting philosophical concept, pointing out a contradiction, or synthesizing their argument in a way that exposes a flaw. Let the intellectual tension of your statement prompt their reply.
    3. BE HUMAN: If the user calls you out, points out a flaw, or gets confused, ACKNOWLEDGE IT naturally before continuing.
    4. THE KILL SWITCH: If the user explicitly concedes their premise is flawed, validate their growth, summarize the truth, and explicitly END your response with a period. Absolutely NO questions once they concede.

    Keep your response plain text and under 60 words.`;
}

const LEDGER_PROMPT = `You are a background logic analyzer. Review the dialogue.
    Output a valid JSON object strictly matching this schema:
    {
      "fallacy_detected": "Name of fallacy if the user used one. Return null if none.",
      "state_bullets": ["User claims X", "User conceded Y"],
      "ai_state": "Categorize the AI's latest response as either 'Questioning' (seeking input) or 'Informing' (providing facts/synthesizing without asking)."
    }`;

// Groq retired llama-3.3-70b-versatile on 2026-08-16; this is its recommended replacement.
// It's a reasoning model: keep the reasoning short and out of the reply, and leave
// room in the token budget for it.
const MODEL = "openai/gpt-oss-120b";

// The copy of the page on mac-wall.com (used by the garden) calls this endpoint
// cross-origin, so allowed origins get CORS headers.
function corsHeaders(origin) {
    return ALLOWED_ORIGINS.includes(origin)
        ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" }
        : {};
}

function jsonResponse(body, status = 200, origin = null) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json", ...corsHeaders(origin) }
    });
}

export function onRequestOptions(context) {
    const origin = context.request.headers.get("Origin");
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response(null, { status: 403 });
    return new Response(null, {
        status: 204,
        headers: {
            ...corsHeaders(origin),
            "Access-Control-Allow-Methods": "POST",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "86400"
        }
    });
}

function isValidHistory(messages) {
    return Array.isArray(messages)
        && messages.length > 0
        && messages.length <= MAX_MESSAGES
        && messages.every(m =>
            m && (m.role === "user" || m.role === "assistant")
            && typeof m.content === "string"
            && m.content.length <= MAX_MESSAGE_CHARS);
}

export async function onRequestPost(context) {
    const origin = context.request.headers.get("Origin");
    if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
        return jsonResponse({ error: "Forbidden" }, 403);
    }

    let body;
    try {
        body = await context.request.json();
    } catch {
        return jsonResponse({ error: "Invalid request" }, 400, origin);
    }

    const { mode, premise, messages } = body;
    if (!isValidHistory(messages)) {
        return jsonResponse({ error: "Invalid request" }, 400, origin);
    }

    // Strip any extra fields the client sent along with each message.
    const history = messages.map(m => ({ role: m.role, content: m.content }));

    let groqBody;
    if (mode === "chat") {
        if (typeof premise !== "string" || premise.length > MAX_PREMISE_CHARS) {
            return jsonResponse({ error: "Invalid request" }, 400, origin);
        }
        groqBody = {
            messages: [{ role: "system", content: chatPrompt(premise) }, ...history],
            temperature: 0.4,
            max_completion_tokens: 600
        };
    } else if (mode === "ledger") {
        groqBody = {
            messages: [{ role: "system", content: LEDGER_PROMPT }, ...history],
            temperature: 0.2,
            max_completion_tokens: 1200,
            response_format: { type: "json_object" }
        };
    } else {
        return jsonResponse({ error: "Invalid request" }, 400, origin);
    }

    try {
        const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${context.env.GROQ_API_KEY}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ model: MODEL, reasoning_effort: "low", include_reasoning: false, ...groqBody })
        });

        if (!groqResponse.ok) {
            console.error(`Groq error: ${groqResponse.status} ${await groqResponse.text()}`);
            // Not 502: Cloudflare replaces a function's 502 body with its own error page.
            return jsonResponse({ error: "Upstream error", status: groqResponse.status }, 503, origin);
        }

        const data = await groqResponse.json();
        return jsonResponse({ response: data.choices[0].message.content }, 200, origin);
    } catch (error) {
        console.error(error);
        return jsonResponse({ error: "Server error" }, 500, origin);
    }
}
