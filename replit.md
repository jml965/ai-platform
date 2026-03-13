# AI Website Builder Platform

## Overview

The AI Website Builder Platform allows users to describe websites in natural language (Arabic or English), and AI agents automatically generate, review, and fix the corresponding code. It supports both RTL/LTR languages and aims to provide a seamless bilingual experience. The project is a pnpm workspace monorepo using TypeScript, where each package manages its own dependencies.

**Business Vision:** To revolutionize website creation by making it accessible to users without coding knowledge, leveraging advanced AI to translate natural language into functional, high-quality websites.
**Market Potential:** Targets individuals and small businesses seeking an intuitive, fast, and cost-effective way to establish an online presence.
**Project Ambition:** To be the leading AI-powered platform for website generation, known for its accuracy, flexibility, and user-friendliness, particularly in bilingual contexts.

## User Preferences

- I prefer clear and concise explanations.
- I appreciate iterative development with regular updates.
- Please ask for confirmation before implementing significant changes.
- Ensure the codebase remains clean and well-documented.

## System Architecture

The platform is built as a pnpm workspace monorepo, separating concerns into `artifacts/` (deployable applications) and `lib/` (shared libraries).

**UI/UX Decisions:**
- **Frontend:** Developed with React, Vite, and TailwindCSS, supporting bilingual AR/EN with RTL/LTR via an i18n context.
- **Pages:** Includes Login, Dashboard, Builder (project workspace with chat prompt and live preview), Billing, Teams, Quality Assurance, Monitoring, Analytics, and PWA settings.
- **Theming:** A consistent design language is applied across all pages, with a language toggle available in the header.

## PWA (Progressive Web App) Support

Converts any project into a Progressive Web App installable on mobile devices.

Key files:
- `lib/db/src/schema/pwa-settings.ts` — DB table for per-project PWA settings
- `artifacts/api-server/src/routes/pwa.ts` — REST API for PWA settings, manifest.json and service worker generation
- `artifacts/website-builder/src/components/builder/PwaSettings.tsx` — PWA settings UI panel

API endpoints (all under `/api/projects/:projectId/pwa`, auth required):
- `GET /pwa` — Get PWA settings for a project
- `PUT /pwa` — Create or update PWA settings
- `GET /pwa/manifest` — Generate manifest.json (only when PWA is enabled)
- `GET /pwa/service-worker` — Generate service worker JS (only when PWA is enabled)

Features:
- Enable/disable PWA per project
- Configure app name, short name, description
- Theme color and background color pickers
- Display mode (standalone, fullscreen, minimal-ui, browser)
- Screen orientation (any, portrait, landscape, natural)
- Custom icon URL support
- Offline caching via service worker (network-first with cache fallback)
- Auto-generated default icons from app initial
- Manifest and service worker URL display with copy buttons

**Technical Implementations:**
- **Monorepo Tool:** pnpm workspaces.
- **Backend:** Express 5 API server (`api-server`) managing routes, authentication, project data, and AI interactions.
- **Database:** PostgreSQL with Drizzle ORM for schema management, including user data, projects, build tasks, and billing information.
- **AI Agents:** A multi-agent system including:
    - **CodeGenerator:** Generates website files from natural language prompts using Anthropic Claude Sonnet 4.5.
    - **CodeReviewer:** Reviews generated code for quality and security using OpenAI o1.
    - **FixAgent:** Automatically fixes identified issues using Anthropic Claude Sonnet 4.5.
    - **FileManager:** Manages saving and updating files in the database.
- **Agent Orchestration:** An `execution-engine` orchestrates the build pipeline (codegen → review → fix → save) and integrates with a 3-phase QA pipeline (lint → runtime → functional validation).
- **Sandbox System:** Provides isolated execution environments for projects, managing lifecycle operations (create, execute, start-server, stop, restart, cleanup) via a dedicated API.
- **Deployment System:** Manages project deployments to public URLs with subdomains, offering deploy, undeploy, and redeploy functionalities.
- **Email Notification System:** An event-driven system sends emails for important events like build completion/errors, team invites, and subscription renewals, based on user preferences.
- **Validation:** Zod is used for schema validation, integrated with `drizzle-zod` for database interactions.
- **API Codegen:** Orval generates API client hooks and Zod schemas from an OpenAPI specification, ensuring type safety and consistency.
- **Build System:** esbuild handles CJS bundling for production, while `tsc --build --emitDeclarationOnly` manages type checking across the monorepo.

**Feature Specifications:**
- **Bilingual Support:** Full Arabic/English support for UI and content, including RTL/LTR layout adjustments.
- **User Authentication:** Supports Replit Auth (default) and local email/password authentication.
- **Billing & Subscriptions:** Manages plans, subscriptions, invoices, credits, and top-ups, integrated with payment gateways.
- **Teams:** Functionality for team creation, member management, and invitation flows with role-based access control.
- **Real-time Updates:** Utilizes Server-Sent Events (SSE) for real-time updates on sandbox execution and build processes.
- **Analytics Dashboard:** Per-project analytics showing visitor stats, daily traffic charts (Recharts), top pages, traffic sources, device/browser breakdowns. Includes a lightweight tracking script for deployed sites. Data stored in `page_views` table with optimized indexes.

## External Dependencies

UI:
- Builder page: Deploy button in header + expandable deploy panel (status, URL, redeploy/undeploy)
- Dashboard: Deployed projects section with status cards and management controls

## Real-time Collaboration System

WebSocket-based real-time collaboration enabling multiple team members to work on the same project simultaneously, like Google Docs.

Key files:
- `artifacts/api-server/src/lib/collaboration.ts` — WebSocket server with auth, rooms, presence, file locking, edit broadcasting
- `artifacts/api-server/src/index.ts` — HTTP server with WebSocket upgrade handler
- `artifacts/website-builder/src/hooks/useCollaboration.ts` — React hook for WebSocket client
- `artifacts/website-builder/src/components/builder/CollaborationPanel.tsx` — UI panel showing collaborators, locks, notifications

WebSocket endpoint: `/ws/collaborate` (authenticated via cookies)

Features:
- Room-based connections per project with project access authorization
- Live presence tracking (connected users, active files, cursor positions)
- Smart file locking system (prevents simultaneous edits, auto-expires after 15min)
- Real-time edit broadcasting with file refetch on changes
- Join/leave notifications with animated toasts
- Collaborator avatars in Builder header
- File lock indicators on code editor tabs
- Lock/unlock buttons in code editor
- Full bilingual support (EN/AR)
- Auto-reconnect on disconnect with intentional-close guard

## Email Notification System

Event-driven email notification system that sends emails on important events (build complete, build error, team invite, subscription renewal).

Key files:
- `lib/db/src/schema/notification-preferences.ts` — DB table for per-user notification preferences
- `artifacts/api-server/src/lib/emailTemplates.ts` — Bilingual HTML email templates with HTML escaping
- `artifacts/api-server/src/lib/notificationEvents.ts` — Event emitters that create in-app notifications and send emails
- `artifacts/api-server/src/lib/notificationMailer.ts` — Email sending via Resend or SendGrid APIs
- `artifacts/api-server/src/routes/notifications.ts` — REST API for notification preferences (GET/PATCH)
- `artifacts/website-builder/src/pages/NotificationSettings.tsx` — Frontend settings page with toggles

API endpoints (under `/api/notifications`, auth required):
- `GET /notifications/preferences` — Get user's notification preferences
- `PATCH /notifications/preferences` — Update notification preferences (buildComplete, buildError, teamInvite, subscriptionRenewal)

Integration points:
- `execution-engine.ts` — emits build_complete/build_error after finalizeBuild
- `teams.ts` — emits team_invite after sending team invitation
- Email providers: RESEND_API_KEY or SENDGRID_API_KEY env vars

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **AI**: Anthropic Claude Sonnet 4.5 (codegen + fixer) + OpenAI o1 (reviewer) via Replit AI Integrations
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

## Custom Domains System

Users can link custom domains (e.g., mysite.com) to their projects with automatic DNS verification and SSL certificate management.

Key files:
- `lib/db/src/schema/domains.ts` — DB table for custom domains
- `artifacts/api-server/src/routes/domains.ts` — REST API for domain CRUD + DNS verification
- `lib/api-client-react/src/domains-hooks.ts` — React Query hooks for domain operations
- `artifacts/website-builder/src/components/builder/DomainSettings.tsx` — Domain settings UI component

API endpoints (all under `/api/projects/:projectId/domains`, auth + project access required):
- `GET /projects/:projectId/domains` — List project domains
- `POST /projects/:projectId/domains` — Add custom domain
- `POST /projects/:projectId/domains/:domainId/verify` — Verify DNS and issue SSL
- `DELETE /projects/:projectId/domains/:domainId` — Remove domain

DNS verification supports both A records (platform IP) and CNAME records (platform.dev). SSL certificates auto-issue on successful DNS verification (simulated 90-day validity).

## Analytics Dashboard

Per-project analytics dashboard showing visitor stats, daily traffic charts, top pages, traffic sources, and device/browser breakdowns.

Key files:
- `lib/db/src/schema/page-views.ts` — DB table for page view tracking with optimized indexes
- `artifacts/api-server/src/routes/analytics.ts` — REST API for tracking and analytics data
- `lib/api-client-react/src/analytics-hooks.ts` — React Query hooks for analytics endpoints
- `artifacts/website-builder/src/pages/Analytics.tsx` — Analytics dashboard page with Recharts

API endpoints:
- `POST /analytics/track` — Public endpoint for recording page views (UUID-validated, length-capped)
- `GET /projects/:projectId/analytics/summary` — Summary stats (views, visitors, bounce rate)
- `GET /projects/:projectId/analytics/daily` — Daily traffic breakdown (views & visitors per day)
- `GET /projects/:projectId/analytics/pages` — Top pages by view count
- `GET /projects/:projectId/analytics/sources` — Traffic source breakdown
- `GET /projects/:projectId/analytics/devices` — Browser, device type, and OS breakdown

Includes lightweight tracking script for embedding in deployed sites with visitor/session ID management.

## Database Schema

16 tables in `lib/db/src/schema/`:
- `users` — User accounts with locale preference, spending limits, credit balance, and active plan
- `projects` — Website projects with status tracking
- `project_files` — Generated files (HTML, CSS, JS) per project
- `build_tasks` — Individual agent tasks within a build
- `execution_logs` — Detailed execution log entries per agent action
- `token_usage` — Token consumption records for cost tracking
- `notifications` — In-app notifications (spending alerts, system messages)
- `plans` — Subscription plan catalog (Limited/Professional) with monthly & yearly pricing, AI agent feature flags (sandboxExecution, autoFix, packageInstall, aiAgentFull)
- `subscriptions` — User subscription records with status and period dates
- `invoices` — Invoice/payment history (subscriptions + credit top-ups)
- `credits_ledger` — Double-entry credit ledger (topup/deduction entries)
- `teams` — Team entities with owner reference
- `team_members` — Team membership with role (admin/developer/reviewer/viewer)
- `team_invitations` — Pending email invitations with token and expiry
- `sessions` — OIDC session storage for Replit Auth (sid, session data, expiry)
- `qa_reports` — QA validation reports with 3-phase checks (lint/runtime/functional), scores, retry tracking, cost tracking, fix attempts JSONB
- `domains` — Custom domains linked to projects with DNS verification status, SSL certificate tracking
- `snapshots` — Project backup snapshots storing all project files as JSONB for one-click restore and comparison
- `page_views` — Page view tracking for analytics with project, path, referrer, browser, device, OS, session/visitor IDs

## Template System

Ready-made template library with 12 templates spanning 10 categories (ecommerce, restaurant, corporate, portfolio, blog, medical, legal, marketing, landing, personal). Users can browse templates, preview them live, and create projects from them.

Key files:
- `artifacts/website-builder/src/lib/templates.ts` — Frontend template definitions with full HTML/CSS content for live preview
- `artifacts/website-builder/src/pages/Templates.tsx` — Template gallery page with category filters, search, and live iframe preview
- `artifacts/api-server/src/lib/template-data.ts` — Backend template definitions (must stay in sync with frontend)
- `artifacts/api-server/src/routes/templates.ts` — API routes for listing templates and creating projects from them

API endpoints (all under `/api`, auth required):
- `GET /templates` — List all templates (metadata only, no file content)
- `POST /templates/use` — Create a project from a template (body: `{ templateId: string }`)

The template project creation uses a DB transaction to ensure atomicity (project + files are created together or not at all).

## Agent Engine

Located in `artifacts/api-server/src/lib/agents/`:
- `constitution.ts` — Token limits, file permissions, allowed extensions
- `base-agent.ts` — Abstract base class with multi-provider LLM calling (OpenAI + Anthropic)
- `codegen-agent.ts` — CodeGenerator: generates website files from prompts (Claude Sonnet 4.5)
- `reviewer-agent.ts` — CodeReviewer: reviews generated code for quality/security (OpenAI o1)
- `fixer-agent.ts` — FixAgent: fixes issues found during review (Claude Sonnet 4.5)
- `filemanager-agent.ts` — FileManager: saves/manages files in the database
- `execution-engine.ts` — Orchestrates the build pipeline (codegen → review → fix → save)
- `types.ts` — Shared type definitions

- `qa-pipeline.ts` — 3-phase QA validation (lint → runtime → functional), auto-fix retry logic (max 3 attempts), integrated into build pipeline after file save

Build pipeline flow: CodeGen → Review → (Fix if issues) → FileManager save → QA Pipeline (lint/runtime/functional validation)

## API Routes

Routes in `artifacts/api-server/src/routes/`:
- `health.ts` — `GET /api/healthz`
- `auth.ts` — `GET /api/auth/provider`, `GET /api/auth/me`, `PATCH /api/auth/me`, `POST /api/auth/login`, `POST /api/auth/register`, `POST /api/auth/logout`, `GET /api/auth/login` (redirect)
- `projects.ts` — CRUD for projects + file listing
- `build.ts` — Start/status/cancel/logs for builds; checks token limits before starting
- `agents.ts` — Agent status and task details
- `tokens.ts` — Usage/limits/summary/notifications for token tracking
- `billing.ts` — Plans, subscriptions, checkout, invoices, credits, top-up
- `teams.ts` — CRUD for teams, members, invitations, role changes
- `qa.ts` — QA reports listing, latest report, run QA, stats summary
- `monitoring.ts` — System health, stats, performance, alerts for production monitoring
- `sandbox.ts` — Sandbox lifecycle management, SSE streaming
- `snapshots.ts` — CRUD for project snapshots (backup/restore), compare with current files
- `analytics.ts` — Page view tracking (public) + analytics data endpoints (auth required)

## Website Builder UI

Frontend artifact at `artifacts/website-builder/` (React + Vite + TailwindCSS):
- Bilingual AR/EN with RTL/LTR support via i18n context (`src/lib/i18n.tsx`)
- Pages: Login, Dashboard, Builder (project workspace), Billing, Teams, QualityAssurance, Monitoring, Analytics
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
- App setup: `src/app.ts` — mounts CORS, cookie-parser, JSON/urlencoded parsing, auth session middleware, routes at `/api`
- Routes: `src/routes/index.ts` mounts sub-routers
- Depends on: `@workspace/db`, `@workspace/api-zod`, `@workspace/integrations-openai-ai-server`, `@workspace/integrations-anthropic-ai`
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

## Self-Hosting / Replit Independence

The project is designed to run both on Replit and on any independent server. Key flexibility features:

- **AUTH_PROVIDER** env var: set to `replit` (default) for Replit Auth, or `local` for email+password authentication
- **APP_DOMAIN** env var: used for determining the public URL (Stripe callbacks, etc.). Must be set explicitly in all environments including Replit deployments
- **SESSION_SECRET** env var: required for local auth mode (cookie signing)
- **Vite plugins**: all Replit-specific plugins (runtime error overlay, cartographer, dev banner) load only when `REPL_ID` is present and `NODE_ENV !== "production"`
- **Self-hosting guide**: see `SELF_HOSTING.md` at project root for full deployment instructions

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

OpenAI AI integration via Replit AI Integrations proxy. Provides pre-configured OpenAI SDK client. Used by ReviewerAgent (o1 model). No API key required — auto-provisioned.

### `lib/integrations-anthropic-ai` (`@workspace/integrations-anthropic-ai`)

Anthropic AI integration via Replit AI Integrations proxy. Provides pre-configured Anthropic SDK client and batch processing utilities. Used by CodeGenAgent and FixerAgent (Claude Sonnet model). No API key required — auto-provisioned.

### `scripts` (`@workspace/scripts`)

Utility scripts package. Each script is a `.ts` file in `src/` with a corresponding npm script in `package.json`. Run scripts via `pnpm --filter @workspace/scripts run <script>`. Scripts can import any workspace package (e.g., `@workspace/db`) by adding it as a dependency in `scripts/package.json`.
