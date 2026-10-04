---
title: "Locking down a public AI endpoint"
description: "Elenchus calls a paid AI model from a public web page. Four small changes stop anyone else from using it as a free chatbot or slipping code into the page."
project: elenchus
date: 2026-09-30
---

*Sample draft, written from the project history. Rewrite it in your own words or delete it.*

Elenchus is an AI tutor that questions your reasoning. The page talks to a small Cloudflare Worker, which forwards the conversation to Llama 3.3 on Groq using my API key. Anything public that spends money on your behalf is worth a second look.

## What could go wrong

The first version accepted whatever the page sent: any instructions, any length, from any website. That meant someone could:

- point their own site at it and get a free general-purpose chatbot on my key,
- send enormous conversations to run up usage, or
- get the model to reply with HTML that the page would then run.

## Four changes

1. **Instructions live on the server.** The tutor's instructions are built into the Worker. The page only sends the conversation, so nobody can repurpose the endpoint by sending their own instructions.
2. **Other websites are turned away.** Browsers only get an answer when the request comes from `mac-wall.com` or `elenchus.mac-wall.com`. A determined script can fake that, which is why the next limit matters.
3. **Hard limits on size.** At most 20 messages, 2,000 characters per message, and 1,000 characters for the opening idea.
4. **Replies are shown as text, never as HTML.** Whatever the model says is displayed literally, so a reply can't add links, scripts or anything else to the page.

```js
const ALLOWED_ORIGINS = ["https://elenchus.mac-wall.com", "https://mac-wall.com"];
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;
```

None of this is complicated, and that's the point: a few lines of checks are the difference between a demo and something safe to leave online.
