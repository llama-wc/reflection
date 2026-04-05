export async function onRequest(context) {
    // 1. Handle hidden Cloudflare/Browser preflight checks
    if (context.request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        });
    }

    try {
        // 2. Parse the chat history
        const body = await context.request.json();
        const chatHistory = body.messages;

        // 3. Talk to Groq Llama 3
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${context.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant',
                messages: chatHistory,
                temperature: 0.3,
                max_tokens: 50
            })
        });

        if (!groqResponse.ok) {
            throw new Error(`Groq blocked us: ${groqResponse.status}`);
        }

        const data = await groqResponse.json();
        const aiMessage = data.choices[0].message.content;

        // 4. Send the message back to your frontend
        return new Response(JSON.stringify({ response: aiMessage }), {
            headers: { 
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { 
            status: 500,
            headers: { 'Access-Control-Allow-Origin': '*' }
        });
    }
}
