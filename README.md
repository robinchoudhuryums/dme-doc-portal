# UMS Physician E-Sign Portal

A HIPAA-compliant web application for Universal Medical Supply (UMS) that enables intake staff to send pre-filled CMN (Certificate of Medical Necessity) forms to physicians for electronic completion and signature.

## Problem

UMS intake staff currently fax pre-filled CMN forms to physicians for completion and signature. The round-trip process is slow, error-prone, and results in lost or delayed forms. This portal eliminates fax round-trips for the signing step.

## How It Works

1. **Staff uploads** a pre-filled CMN PDF (Section A completed) and selects the physician
2. **System generates** a unique, time-limited signing link and PIN
3. **Staff sends** the link via fax cover sheet or email; PIN is communicated separately
4. **Physician opens** the link, verifies identity via PIN, completes Section B clinical questions, and signs electronically
5. **System generates** the final signed PDF, notifies UMS, and stores a tamper-proof audit trail
6. **Auto-reminders** are sent at configurable intervals (3, 7, 14 days) if unsigned

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18, TypeScript, Vite |
| Backend | Node.js, Express, TypeScript |
| Database | PostgreSQL |
| Storage | AWS S3 (encrypted, BAA-eligible) |
| PDF | pdf-lib (manipulation), pdfjs-dist (viewing) |
| E-Signature | react-signature-canvas |
| Auth | JWT (staff), PIN-based (physicians) |

## Supported CMN Form Types

- **CMS-484** — Oxygen equipment
- **CMS-10126** — Hospital beds
- **CMS-10125** — POV/Power wheelchairs
- **Prior Authorization** — Generic prior auth forms

## Quick Start

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm or yarn

### Setup

```bash
# Clone the repository
git clone <repo-url>
cd dme-doc-portal

# Install dependencies
cd server && npm install
cd ../client && npm install
cd ..

# Configure environment
cp server/.env.example server/.env
# Edit server/.env with your database credentials and other settings

# Create the database
createdb dme_esign

# Run migrations
cd server && npm run migrate

# Start development servers
cd .. && npm run dev
```

The app will be available at:
- Frontend: http://localhost:5173
- Backend API: http://localhost:3001

### Creating the First Admin User

After running migrations, you can create an admin user by running:

```sql
INSERT INTO staff_users (email, password_hash, first_name, last_name, role)
VALUES ('admin@ums.com', '$2a$12$...', 'Admin', 'User', 'admin');
```

Use `bcryptjs` to generate the password hash, or add a seed script.

## Project Structure

```
dme-doc-portal/
├── client/                  # React frontend
│   ├── src/
│   │   ├── components/      # Shared UI components
│   │   ├── hooks/           # React hooks (auth, etc.)
│   │   ├── pages/           # Page components
│   │   │   └── signing/     # Physician signing flow
│   │   ├── services/        # API client
│   │   └── types/           # TypeScript types
│   └── index.html
├── server/                  # Express backend
│   ├── src/
│   │   ├── config/          # App & database config
│   │   ├── middleware/       # Auth, HIPAA, validation
│   │   ├── migrations/      # Database migrations
│   │   ├── models/          # Data models (repository pattern)
│   │   ├── routes/          # API route handlers
│   │   ├── services/        # Business logic
│   │   ├── types/           # TypeScript types
│   │   └── utils/           # Crypto, logging helpers
│   └── .env.example
├── CLAUDE.md                # AI assistant context
└── README.md
```

## Security & Compliance

### HIPAA

- Encryption at rest (S3 SSE) and in transit (TLS/HTTPS)
- No-cache headers on all responses containing PHI
- Audit logging for every significant action
- 15-minute session inactivity timeout
- Access controls: JWT for staff, PIN for physicians
- Logger configured to never output PHI
- BAA-eligible infrastructure (AWS)

### E-SIGN Act / UETA

- Signer identification via PIN verification
- Timestamped signatures with IP address recording
- Tamper-proof audit trail
- Clear consent language before signing
- Signed document stored immutably

### Rate Limiting

- General API: 100 requests per 15 minutes
- PIN verification: 10 attempts per 15 minutes
- Maximum 5 PIN attempts per form before lockout

## API Documentation

See [CLAUDE.md](./CLAUDE.md) for full API route documentation.

## License

Proprietary — Universal Medical Supply. All rights reserved.
