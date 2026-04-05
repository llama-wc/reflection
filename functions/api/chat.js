export async function onRequestPost(context) {
    try {
        // Parse the incoming chat history from your frontend
        const body = await context.request.json();
        const chatHistory = body.messages;

        // Groq uses an OpenAI-compatible endpoint
        const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${context.env.GROQ_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: 'llama-3.1-8b-instant', // Highly capable and blazingly fast
                messages: chatHistory,
                temperature: 0.3,
                max_tokens: 50
            })
        });

        if (!groqResponse.ok) {
            throw new Error(`Groq API error: ${groqResponse.status}`);
        }

        const data = await groqResponse.json();
        const aiMessage = data.choices[0].message.content;

        // Send the AI's response back to your frontend
        return new Response(JSON.stringify({ response: aiMessage }), {
            headers: { 'Content-Type': 'application/json' }
        });

    } catch (error) {
        return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    }
}
