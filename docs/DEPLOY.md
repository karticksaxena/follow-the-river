# Deploy

- Production build is served at `kartiksaxena.com/dreams/play/` (multi-zone rewrite from the portfolio site to this project).
- `vite.config.ts`: `vite build` uses `base: '/dreams/play/'` and `outDir: 'dist/dreams/play'`; dev stays at `/`.
- So `dist/` at the project root answers `/dreams/play/...` with no rewrite. `/` redirects there (`vercel.json`).
- Deep link: `/dreams/play/?dream=follow-the-river` skips the dream cards to that dream's warning panel.
- Vercel project: framework Vite, build `pnpm run build`, output `dist` (all set in `vercel.json`).
- Caching (`vercel.json`): hashed `.js`/`.css` immutable 1 year; other `assets/` (models, sounds, textures; unhashed) 1 h + stale-while-revalidate; `index.html` no-cache.
- Preview: `pnpm run build && pnpm exec vite preview --port 5230`, then http://localhost:5230/dreams/play/.
