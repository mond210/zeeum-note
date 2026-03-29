# zeeum-note

Markdown note manager with Docker Compose.

Pinned to the latest Node release available on 2026-03-29: `25.8.2`.

## Run

```bash
docker compose up --build
```

Then open `http://localhost:3000`.

## Features

- Note manager sidebar with search, create, select, and delete
- Markdown editor with autosave
- Sanitized live preview rendered by the Node backend
- JSON file persistence under `data/notes.json`
