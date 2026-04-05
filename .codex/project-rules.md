# Project Rules

## UI Direction
- Do not default to isolated card-style panels for every new layout or new major component.
- Prefer surfaces that blend into the existing page shell with flat backgrounds, light separators, and minimal decoration.
- Avoid adding large rounded corners, heavy shadows, or floating panel treatment unless the user explicitly asks for that look.

## App Chrome
- Keep the app bar compact and consistent across views.
- Prefer icon buttons and dropdown menus over clusters of text buttons in the header.
- User-facing navigation should feel workspace/page-first, not project-first, unless the user explicitly asks to expose project structure.

## File Manager Behavior
- Treat folders as containers, not editable document pages.
- Folder click should expand or collapse the tree, not open editor content.
- Render actual icons, never raw internal icon ids like `file-text` or `folder_open` as visible text.
- Do not show always-on checkboxes in the file tree unless the user explicitly asks for them.

## Execution Discipline
- When the user corrects direction, apply the exact requested change first before adding adjacent polish.
- If a request is narrow, do not mix in broader redesign decisions unless necessary to complete the task safely.

## Verification
- After meaningful UI changes, run `npm run build`.
- If the app is being served with Docker in this repo, also run `docker compose up --build -d` and confirm the container is up.
