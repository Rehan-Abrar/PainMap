# PainMap

> Find where markets hurt. Aggregate user complaints from Hacker News and Reddit, cluster them into pain themes, and generate startup ideas grounded in real user language.

## Quick demo (recommended for your recording)

1. Start the local server (see Run section).
2. Open the app in your browser and select the `Student Productivity` chip.
3. Click **Find Pain Points →** and wait for the feed to populate.
4. Show the quote feed and highlight any Reddit links that appear.
5. Click a bubble to generate an idea, then run the Stress Test.
6. Save an insight and show the updated `PROJECT_LOG.md` entry.

## Features

- Fetches comments from Hacker News (Algolia) and attempts Reddit search via a CORS proxy.
- Clusters real complaints into 3–5 pain themes using a generative LLM (Gemini/Groq fallback).
- Generates a focused startup idea for a selected cluster and performs a short VC-style stress test.
- Interactive bubble map and quote feed with direct links to sources.

## Prerequisites

- Node.js 18+ and npm
- (Optional) Gemini API key and GROQ API key for improved idea generation

Create a `.env` file in the project root (not committed) with the following keys:

```
GEMINI_API_KEY=YOUR_GEMINI_KEY
GROQ_API_KEY=YOUR_GROQ_KEY
PORT=3000
```

Notes:
- If you do not provide API keys the app will still run but AI features will fail with an explanatory message.
- Reddit fetching uses a public CORS proxy (`https://corsproxy.io/`) client-side; for fully reliable Reddit results use the server-side proxy pattern (recommended for demos). See `server.js` to add a server-side Reddit route.

## Run locally

Install dependencies and start the server:

```bash
npm install
node server.js
```

Then open http://localhost:3000 in your browser. The landing page links to the results and demo flows.

## Files of interest

- `index.html` — landing page with domain chips
- `results.html` — main results page (feed, bubbles, idea panel)
- `app.js` — orchestration, fetching, clustering fallback logic
- `gemini.js` — frontend wrappers calling the backend AI proxy
- `server.js` — Express backend that proxies AI calls; add server-side Reddit proxy here if needed
- `ui.js` — rendering, bubbles, and idea panel UI

## Troubleshooting

- No Reddit posts? CORS proxies can fail or be rate-limited. For reliable results, implement a server-side Reddit route in `server.js` that performs the JSON fetch and returns data to the frontend.
- LLM failures: ensure `GEMINI_API_KEY` or `GROQ_API_KEY` are set in `.env` and available to the server process.

## License

MIT — see `LICENSE` for details (none included by default).

--
Generated and updated by the PainMap development helper on 2026-05-20.
