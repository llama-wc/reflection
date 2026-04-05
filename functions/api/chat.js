export async function onRequest(context) {
    // 1. THE PULSE CHECK - Lets you test the backend in a browser
    if (context.request.method === "GET") {
        return new Response("THE BACKEND IS ALIVE!", { 
            status: 200,
            headers: { "Access-Control-Allow-Origin": "*" } 
        });
    }

    // 2. Preflight Security Handshake
    if (context.request.method === "OPTIONS") {
        return new Response(null, {
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
                "Access-Control-Allow-Headers": "Content-Type",
            }
        });
    }

    try {
        const body = await context.request.json();
        const chatHistory = body.messages;

        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${context.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-70b-versatile', // The upgraded 70B engine
                messages: chatHistory,
                temperature: 0.4, // Bumped slightly for more creative questioning
                max_tokens: 60
            })
        });

        if (!groqResponse.ok) {
            throw new Error(`Groq blocked us: ${groqResponse.status}`);
        }

        const data = await groqResponse.json();
        const aiMessage = data.choices[0].message.content;

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
