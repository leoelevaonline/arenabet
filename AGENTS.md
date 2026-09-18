# AGENTS.md

## Project Context

ArenaBet is a standalone React and Vite application for virtual-credit games. Keep changes focused, preserve existing conventions, and start with `README.md` for setup instructions.

## Key Files

- `src/`: frontend application source.
- `src/api/localDatabase.js`: local authentication and persistence adapter.
- `src/pages/`: application pages and games.
- `src/components/ui/`: reusable UI components.
- `vite.config.js`: Vite and path-alias configuration.

## Working Notes

- Run the project with `npm run dev`.
- Data is stored in the browser's `localStorage`.
- Never add secrets to the repository.
- Run the relevant checks from `package.json` before finishing code changes.
