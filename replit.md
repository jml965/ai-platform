# Workspace

## Project

AI Website Builder Platform — users describe websites in natural language (Arabic or English) and AI agents generate, review, and fix the code automatically. Bilingual (AR/EN) with RTL/LTR support.

## Architecture Documentation

Full technical architecture is in `docs/architecture/`:
- `00-index.md` — Master index with summary of all documents
- `01-system-architecture.md` — Layered architecture diagram
- `02-technology-decisions.md` — ADR for every technology choice
- `03-agent-architecture.md` — Agent system design (4 agents + execution engine)
- `04-data-flow.md` — 6 main data flows
- `05-database-schema.md` — 12 tables with columns and relationships
- `06-api-spec-structural.md` — 41 API endpoints with permissions
- `07-project-roadmap.md` — 8 phases with weighted progress tracking

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: OpenAI via Replit AI Integrations (gpt-5.2 model)
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)

## Structure

```text
artifacts-monorepo/
├── artifacts/              # Deployable applications
│   ├── api-server/         # Express API server
│   └── website-builder/    # React+Vite frontend (bilingual AR/EN)
├── lib/                    # Shared libraries
│   ├── api-spec/           # OpenAPI spec + Orval codegen config
│   ├── api-client-react/   # Generated React Query hooks
│   ├── api-zod/            # Generated Zod schemas from OpenAPI
│   ├── db/                 # Drizzle ORM schema + DB connection
│   └── integrations-openai-ai-server/  # OpenAI AI integration
├── scripts/                # Utility scripts (single workspace package)
│   └── src/                # Individual .ts scripts
├── pnpm-workspace.yaml     # pnpm workspace
├── tsconfig.base.json      # Shared TS options
├── tsconfig.json           # Root TS project references
└── package.json            # Root package with hoisted devDeps
```

## Database Schema

10 tables in `lib/db/src/schema/`:
- `users` — User accounts with locale preference, spending limits, credit balance, and active plan
- `projects` — Website projects with status tracking
- `project_files` — Generated files (HTML, CSS, JS) per project
- `build_tasks` — Individual agent tasks within a build
- `execution_logs` — Detailed execution log entries per agent action
- `token_usage` — Token consumption records for cost tracking
- `notifications` — In-app notifications (spending alerts, system messages)
- `plans` — Subscription plan catalog (Basic/Pro/Team) with limits and features
- `subscriptions` — User subscription records with status and period dates
- `invoices` — Invoice/payment history (subscriptions + credit top-ups)
- `credits_ledger` — Double-entry credit ledger (topup/deduction entries)

## Agent Engine

Located in `artifacts/api-server/src/lib/agents/`:
- `constitution.ts` — Token limits, file permissions, allowed extensions
- `base-agent.ts` — Abstract base class with LLM calling via OpenAI
- `codegen-agent.ts` — CodeGenerator: generates website files from prompts
- `reviewer-agent.ts` — CodeReviewer: reviews generated code for quality/security
- `fixer-agent.ts` — FixAgent: fixes issues found during review
- `filemanager-agent.ts` — FileManager: saves/manages files in the database
- `execution-engine.ts` — Orchestrates the build pipeline (codegen → review → fix → save)
- `types.ts` — Shared type definitions

Build pipeline flow: CodeGen → Review → (Fix if issues) → FileManager save

## API Routes

Routes in `artifacts/api-server/src/routes/`:
- `health.ts` — `GET /api/healthz`
- `auth.ts` — `GET /api/auth/me`, `POST /api/auth/logout`, `GET /api/auth/login`
- `projects.ts` — CRUD for projects + file listing
- `build.ts` — Start/status/cancel/logs for builds; checks token limits before starting
- `agents.ts` — Agent status and task details
- `tokens.ts` — Usage/limits/summary/notifications for token tracking
- `billing.ts` — Plans, subscriptions, checkout, invoices, credits, top-up

## Website Builder UI

Frontend artifact at `artifacts/website-builder/` (React + Vite + TailwindCSS):
- Bilingual AR/EN with RTL/LTR support via i18n context (`src/lib/i18n.tsx`)
- Pages: Login, Dashboard, Builder (project workspace), Billing
- Dashboard: project list with status badges, token usage indicator, new project modal, Billing link
- Builder: chat prompt, live preview (sandboxed iframe with CSS/JS inlining), execution log panel
- Billing: current subscription, credit balance + top-up, plan comparison, invoice history
- Language toggle in header on every page
- Uses `@workspace/api-client-react` generated hooks for API integration
- Polling for build status during active builds

## TypeScript & Composite Projects

Every package extends `tsconfig.base.json` which sets `composite: true`. The root `tsconfig.json` lists all packages as project references. This means:

- **Always typecheck from the root** — run `pnpm run typecheck` (which runs `tsc --build --emitDeclarationOnly`). This builds the full dependency graph so that cross-package imports resolve correctly. Running `tsc` inside a single package will fail if its dependencies haven't been built yet.
- **`emitDeclarationOnly`** — we only emit `.d.ts` files during typecheck; actual JS bundling is handled by esbuild/tsx/vite...etc, not `tsc`.
- **Project references** — when package A depends on package B, A's `tsconfig.json` must list B in its `references` array. `tsc --build` uses this to determine build order and skip up-to-date packages.

## Root Scripts

- `pnpm run build` — runs `typecheck` first, then recursively runs `build` in all packages that define it
- `pnpm run typecheck` — runs `tsc --build --emitDeclarationOnly` using project references

## Packages

### `artifacts/api-server` (`@workspace/api-server`)

Express 5 API server. Routes live in `src/routes/` and use `@workspace/api-zod` for request and response validation and `@workspace/db` for persistence.

- Entry: `src/index.ts` — reads `PORT`, starts Express
- App setup: `src/app.ts` — mounts CORS, JSON/urlencoded parsing, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers
- Depends on: `@workspace/db`, `@workspace/api-zod`, `@workspace/integrations-openai-ai-server`
- `pnpm --filter @workspace/api-server run dev` — run the dev server
- `pnpm --filter @workspace/api-server run build` — production esbuild bundle (`dist/index.cjs`)
- Build bundles an allowlist of deps (express, cors, pg, drizzle-orm, zod, etc.) and externalizes the rest

### `lib/db` (`@workspace/db`)

Database layer using Drizzle ORM with PostgreSQL. Exports a Drizzle client instance and schema models.

- `src/index.ts` — creates a `Pool` + Drizzle instance, exports schema
- `src/schema/index.ts` — barrel re-export of all models
- `src/schema/<modelname>.ts` — table definitions with `drizzle-zod` insert schemas
- `drizzle.config.ts` — Drizzle Kit config (requires `DATABASE_URL`, automatically provided by Replit)
- Exports: `.` (pool, db, schema), `./schema` (schema only)

Production migrations are handled by Replit when publishing. In development, we just use `pnpm --filter @workspace/db run push`, and we fallback to `pnpm --filter @workspace/db run push-force`.

### `lib/api-spec` (`@workspace/api-spec`)

Owns the OpenAPI 3.1 spec (`openapi.yaml`) and the Orval config (`orval.config.ts`). Running codegen produces output into two sibling packages:

1. `lib/api-client-react/src/generated/` — React Query hooks + fetch client
2. `lib/api-zod/src/generated/` — Zod schemas

Run codegen: `pnpm --filter @workspace/api-spec run codegen`

### `lib/api-zod` (`@workspace/api-zod`)

Generated Zod schemas from the OpenAPI spec (e.g. `HealthCheckResponse`). Used by `api-server` for response validation.

### `lib/api-client-react` (`@workspace/api-client-react`)

Generated React Query hooks and fetch client from the OpenAPI spec (e.g. `useHealthCheck`, `healthCheck`).

### `lib/integrations-openai-ai-server` (`@workspace/integrations-openai-ai-server`)

OpenAI AI integration via Replit AI Integrations proxy. Provides pre-configured OpenAI SDK client, image generation, audio utilities, and batch processing helpers. No API key required — auto-provisioned.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
