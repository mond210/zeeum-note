# Repository Guidelines

## Agent-Specific Instructions
Also follow the repo-local rules in `.codex/project-rules.md` for recurring UX and execution preferences established for this project.

## Project Structure & Module Organization
`src/` holds the Svelte 5 client. Keep route-level views in `src/components/`, shared state in `src/lib/stores/app.js`, and reusable editor/page helpers in `src/lib/`. `server.js` is the Node/Express backend for auth, uploads, JSON persistence, and Yjs collaboration. Persistent workspace data lives in `data/*.json`; uploaded media goes to `data/uploads/`. Maintenance and verification scripts live in `scripts/` and `scripts/stress/`. Treat `dist/` as generated output.

## Build, Test, and Development Commands
`npm install` installs dependencies.
`npm run dev` starts the API on `:3000` and the Vite client on `:5173`.
`npm run dev:server` runs only `server.js`.
`npm run dev:client` runs the Svelte client with `/api` proxied to the backend.
`npm run build` builds the frontend into `dist/`.
`npm start` serves the production app from `server.js`.
`docker compose up --build` runs the full containerized app with `./data` mounted.
`node scripts/repair-page-data.js` repairs corrupted TipTap page data.
`node scripts/stress/browser-collab-stress.js` runs the Playwright collaboration stress check against a running app.

## Coding Style & Naming Conventions
Use 2-space indentation, double quotes, and semicolons. Keep browser code in `src/` as ESM and keep Node entry points and maintenance scripts in CommonJS unless a file already differs. Use `PascalCase.svelte` for components, `kebab-case.js` for utility modules such as `page-tree.js`, and `camelCase` for exported functions and store methods. Prefer Tailwind utility classes in Svelte markup; move only shared global styles into `src/app.css`.

## Testing Guidelines
There is no `npm test` or coverage gate yet. Minimum verification for most changes is `npm run build`. For editor, auth, persistence, or collaboration work, also exercise the affected browser flow locally and run the Playwright stress script when shared editing behavior changes. Name new verification scripts by scenario and keep them deterministic.

## Commit & Pull Request Guidelines
Recent commits use short, imperative, sentence-case subjects without prefixes, for example `Refactor collaboration editor and stress tooling`. Follow that style and keep each commit focused on one logical change. PRs should include a concise summary, affected routes or data files, commands run, and screenshots or recordings for UI updates. Call out any changes to `data/*.json`, seeded accounts, or environment variables such as `SESSION_SECRET`.

## Security & Configuration Tips
Do not commit real user data or secrets. `SESSION_SECRET` defaults to a development value in `server.js`; override it outside local development. If a change modifies seeded login behavior, document the new credentials and the impact on existing `data/` files.
