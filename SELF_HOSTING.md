# Self-Hosting Guide

This guide explains how to run the project on your own server, independent of Replit.

## Prerequisites

- **Node.js** 20+ and **pnpm** 9+
- **PostgreSQL** 14+ database

## Environment Variables

Create a `.env` file at the project root with:

```env
# --- Required ---
DATABASE_URL=postgresql://user:password@localhost:5432/your_db
SESSION_SECRET=a-random-secret-string-at-least-32-chars

# Auth provider: "local" for email+password, "replit" for Replit Auth
AUTH_PROVIDER=local

# Your public domain (used for Stripe callbacks, etc.)
APP_DOMAIN=yourdomain.com

# --- Optional: Stripe ---
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...

# --- Optional: AI providers ---
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
```

### Variable Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Secret for signing session cookies (min 32 chars) |
| `AUTH_PROVIDER` | Yes | `local` for email+password, `replit` for Replit Auth |
| `APP_DOMAIN` | Yes | Public domain without protocol (e.g. `app.example.com`) |
| `PORT` | No | Server port (default varies per artifact) |
| `STRIPE_SECRET_KEY` | No | Stripe secret key for payments |
| `STRIPE_WEBHOOK_SECRET` | No | Stripe webhook signing secret |
| `OPENAI_API_KEY` | No | OpenAI API key for AI agents |
| `ANTHROPIC_API_KEY` | No | Anthropic API key for AI agents |

## Setup Steps

### 1. Install Dependencies

```bash
pnpm install
```

### 2. Initialize the Database

```bash
pnpm --filter @workspace/db run push
```

This creates all required tables in your PostgreSQL database.

### 3. Build the Project

```bash
# Build the frontend
pnpm --filter @workspace/website-builder run build

# Build the API server
pnpm --filter @workspace/api-server run build
```

### 4. Run the Server

For production, set the `PORT` and `BASE_PATH` environment variables and run:

```bash
# API server
PORT=3001 node artifacts/api-server/dist/index.js

# Frontend (serve the built static files with any HTTP server)
# The built files are in artifacts/website-builder/dist/public/
```

You can use any reverse proxy (nginx, Caddy, etc.) to serve both under a single domain.

## Reverse Proxy Example (nginx)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location /api/ {
        proxy_pass http://127.0.0.1:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location / {
        root /path/to/artifacts/website-builder/dist/public;
        try_files $uri $uri/ /index.html;
    }
}
```

## Authentication

The project supports two authentication modes, controlled by the `AUTH_PROVIDER` environment variable:

### Local Auth (`AUTH_PROVIDER=local`)
- Email + password registration and login
- Passwords are hashed using Node.js scrypt
- Sessions are stored in signed HTTP-only cookies

### Replit Auth (`AUTH_PROVIDER=replit`)
- Uses Replit's built-in OpenID Connect authentication
- Only works when deployed on Replit

## Stripe Webhooks

If using Stripe for payments, configure a webhook endpoint pointing to:

```
https://yourdomain.com/api/billing/webhook
```

Subscribe to these events:
- `checkout.session.completed`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.payment_succeeded`
- `invoice.payment_failed`

## Running on Replit

When deploying on Replit, set these environment variables:
- `AUTH_PROVIDER=replit` (or leave unset, defaults to replit)
- `APP_DOMAIN=your-repl-domain.replit.app` (your Replit deployment domain)
- Other variables (`DATABASE_URL`, `PORT`) are automatically provided by Replit

## Differences from Replit Deployment

When running outside Replit:
- Replit-specific Vite plugins (dev banner, cartographer, error overlay) are automatically disabled
- Authentication uses email+password instead of Replit Auth
- All other features (projects, AI agents, billing, teams) work identically
