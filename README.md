# Phantom

Zero-knowledge, end-to-end encrypted messenger. Vite + React + TypeScript + shadcn/ui, with a
Supabase relay for message passing. Design notes live in [`docs/`](docs/).

## Development

```bash
npm install
npm run dev        # http://localhost:8080
npm run build      # production build to dist/
npm run test       # vitest
npm run lint
```

Environment variables (`.env`): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`,
`VITE_SUPABASE_PROJECT_ID`.
