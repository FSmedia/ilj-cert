# Ileoja Academy Certificate Generator

This is a secure, exact-fidelity online certificate generator built to match the official Ileoja Academy PSD template pixel-for-pixel. It runs as a Next.js app and is deployed on Vercel.

## Features

- **Exact template fidelity**: Uses the extracted background (`/background.png`) from the official PSD and re-renders text at the measured coordinates (3508×2480, A4 landscape @ 300 DPI).
- **Admin authentication**: Password-protected dashboard. The required password is `ILEOJA4321@` (stored hashed server-side; session is HMAC-signed).
- **Single generation**: Live preview with one-click download as high-resolution PDF or PNG.
- **Bulk generation**: CSV upload or multi-line paste. Automatically assigns sequential serial numbers `ILJ[COURSE_CODE][YY][SERIAL]` with no dashes (e.g. `ILJWD26001`). Exports all certificates as a single `.zip` (PDF/PNG/both).
- **Persistent serial counters**: Serial numbers persist per course and year in the browser (localStorage) and can be overridden per group at generation time.
- **Date parsing**: Accepts ISO (`2026-10-01`), DD/MM/YYYY, DD Mon YYYY, and Mon DD, YYYY formats; displays as `DD/Mon/YYYY` to match the template.

## Quick start (local)

```bash
npm install
npm run dev
```

## Deploy to Vercel

1. Push the code to GitHub/GitLab.
2. Create a new Vercel project from that repository.
3. Framework: Next.js (auto-detected). No custom build command needed (`npm run build`).
4. Add environment variables (optional but recommended for session security in production):
   - `AUTH_SECRET` — a long random string used to sign admin sessions. If not set, a fallback derived key is used.
5. Deploy. The `/` route is protected by middleware; `/login` is the admin login.

**Admin password:** `ILEOJA4321@`

## Project layout

- `app/` — Next.js App Router (pages, API routes, middleware)
- `components/Studio.tsx` — main UI (single + bulk)
- `lib/certificate.ts` — rendering, fonts, coordinates, date parsing
- `lib/serials.ts` — course-code derivation and serial counter logic
- `lib/auth.ts`, `lib/password.ts` — authentication/session helpers
- `public/background.png` — cleaned template background used for rendering (do not modify)
- `tools/` — PSD extraction/analysis scripts (development utilities only; not required at runtime)

## Notes on exact fidelity

Typography is rendered using the same type families as the original PSD (Bell MT for the candidate name, Helvetica/Arial for body/code, Candara for the date) with measured font sizes/positions. If a system is missing those fonts, safe web fallbacks are used; for best crispness, run on machines that have Bell MT/Candara installed (Windows defaults). Coordinates are locked to the template's 3508×2480 pixel canvas. 

No layout, style, or template modifications were introduced. The output certificates must match the visual structure of the provided design asset.
