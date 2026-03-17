# One Lux Stay Website

This project is a React + Vite frontend with Netlify Functions for server-side integrations.

## AI Concierge

The site now includes a floating AI concierge widget powered by a Netlify function at `netlify/functions/chat.js`.

Manual concierge content lives in `src/data/conciergeKnowledge.js`.
Edit that file to add or update:

- contact details
- booking guidance
- policies and house rules
- city notes
- FAQ answers
- page guidance copy

Required environment variables:

- `OPENAI_API_KEY`: your OpenAI API key
- `OPENAI_CHAT_MODEL`: optional override for the default model (`gpt-5-mini`)
- `VITE_API_BASE`: optional frontend functions base override
- `VITE_NETLIFY_SITE_URL`: optional absolute Netlify site URL used when the frontend is hosted away from Netlify

Behavior notes:

- The browser never receives the OpenAI API key.
- The assistant is page-aware and receives route context from the current page.
- The assistant is instructed not to invent live pricing, availability, or policy details it cannot verify.

## Development

- `npm run dev` runs the client and local server processes
- `npm run lint` runs ESLint
- `npm run build` builds the frontend bundle
