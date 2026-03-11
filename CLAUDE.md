# CLAUDE.md — DME E-Sign Portal

## Project Overview
HIPAA-aware Physician E-Sign Portal for Universal Medical Supply (UMS). Enables intake staff to send pre-filled CMN (Certificate of Medical Necessity) forms to physicians for electronic completion and signature via secure web links.

## Architecture
Monorepo with two packages:
- **`server/`** — Node.js + Express + TypeScript backend (port 3001)
- **`client/`** — React + TypeScript + Vite frontend (port 5173)

Database: PostgreSQL (`dme_esign`)
Storage: AWS S3 (HIPAA-eligible with BAA)
PDF: pdf-lib (manipulation), pdfjs-dist (browser viewing)

## Key Commands
```bash
# Install dependencies
cd server && npm install && cd ../client && npm install

# Run development (both server + client)
npm run dev                    # from root (uses concurrently)
cd server && npm run dev       # server only
cd client && npm run dev       # client only

# Database
cd server && npm run migrate           # run migrations
cd server && npm run migrate:rollback  # rollback migrations

# Build
npm run build                  # build both
cd server && npm run build     # server only
cd client && npm run build     # client only

# Lint
npm run lint
```

## Database Schema (PostgreSQL)
Six tables defined in `server/src/migrations/001_initial_schema.ts`:
- `staff_users` — UMS intake/admin staff accounts (JWT auth)
- `physicians` — Physician directory (NPI, fax, email, practice)
- `patients` — Patient records (name, DOB, Medicare/insurance ID)
- `form_submissions` — Core entity: tracks CMN forms through their lifecycle
- `audit_logs` — HIPAA audit trail (every action logged with IP, timestamp, actor)
- `reminder_schedules` — Auto-reminder schedule (configurable day intervals)

## API Routes
- `POST /api/auth/login` — Staff login (JWT)
- `GET /api/auth/me` — Current user info
- `GET/POST /api/physicians` — Physician directory CRUD
- `GET/POST /api/patients` — Patient search/create
- `POST /api/forms` — Create form submission (multipart PDF upload)
- `GET /api/forms` — List forms (dashboard, paginated, filterable)
- `GET /api/forms/stats` — Dashboard statistics
- `GET /api/forms/:id` — Form detail with audit trail
- `POST /api/forms/:id/cancel` — Cancel pending form
- `GET /api/sign/:token` — Public: get form info (pre-PIN)
- `POST /api/sign/:token/verify` — Verify PIN, get session token
- `POST /api/sign/:token/section-b` — Save Section B data (authed)
- `POST /api/sign/:token/sign` — Submit signature (authed)
- `GET /api/health` — Health check

## Form Types
- CMS-484 (Oxygen) — Section B: blood gas/oximetry, LPM, frequency
- CMS-10126 (Hospital Beds) — Section B: bed type, rails, mattress
- CMS-10125 (POV/Wheelchairs) — Section B: mobility limitation, home assessment
- PRIOR-AUTH (Generic) — Section B: equipment, medical necessity, alternatives

## Form Lifecycle
`draft` → `pending_signature` → `viewed` → `signed`
                                          → `expired`
                                          → `cancelled`

## Security & HIPAA Compliance
- All responses include no-cache, no-store headers (PHI protection)
- HTTPS enforced via HSTS headers
- Rate limiting on all API routes (100/15min) and PIN verification (10/15min)
- PIN-based auth for physicians (no account needed), max 5 attempts
- JWT with short expiry for physician sessions (1h)
- 15-minute inactivity timeout on both frontend and backend
- Audit logging on every significant action
- Logger configured to never log PHI
- X-Frame-Options: DENY, X-Content-Type-Options: nosniff
- Referrer-Policy: no-referrer (prevents token leaks)

## Environment Variables
See `server/.env.example` for all required configuration.

## Code Conventions
- TypeScript strict mode in both packages
- Zod for request validation
- Models use the repository pattern (one model file per table)
- All dates in UTC, stored as PostgreSQL timestamps
- S3 keys follow pattern: `forms/{signing_token}/original.pdf`
- Audit logs are append-only and immutable
