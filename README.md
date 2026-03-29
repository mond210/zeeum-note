# zeeum-note

Svelte markdown workspace with a Docmost-inspired editing layout.

Pinned to the latest Node release available on 2026-03-29: `25.8.2`.

## Run

```bash
docker compose up --build
```

Then open `http://localhost:3000`.

## Features

- Svelte 5 + Tailwind CSS frontend
- Docmost-style three-panel workspace
- Note manager sidebar with search, create, select, and delete
- Autosaving markdown editor with keyboard save shortcut
- Sanitized live preview rendered by the Node backend
- JSON file persistence under `data/notes.json`

## Local Development

```bash
npm install
npm run dev:server
npm run dev:client
```

Or run both together:

```bash
npm run dev
```
