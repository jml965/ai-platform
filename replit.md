# AI Website Builder Platform

## Overview

The AI Website Builder Platform enables users to generate, review, and fix website code using natural language descriptions (Arabic or English). It supports both RTL/LTR languages, providing a seamless bilingual experience. The project is a pnpm workspace monorepo designed to democratize website creation by translating natural language into functional, high-quality websites, targeting individuals and small businesses. The ambition is to become the leading AI-powered platform for user-friendly and flexible website generation, especially in bilingual contexts.

## User Preferences

- I prefer clear and concise explanations.
- I appreciate iterative development with regular updates.
- Please ask for confirmation before implementing significant changes.
- Ensure the codebase remains clean and well-documented.

## System Architecture

The platform utilizes a pnpm workspace monorepo structure, separating deployable applications (`artifacts/`) from shared libraries (`lib/`).

**UI/UX Decisions:**
- **Frontend:** Built with React, Vite, and TailwindCSS, featuring bilingual (AR/EN) support with RTL/LTR layouts managed by an i18n context.
- **Theming:** A consistent design language is applied across all pages, with a language toggle available in the header.
- **Core Pages:** Login, Dashboard, Builder (project workspace with chat prompt and live preview), Billing, Teams, Quality Assurance, Monitoring, and Analytics.
- **PWA Support:** Converts projects into installable Progressive Web Apps, allowing configuration of app name, theme, display mode, icons, and offline caching via service workers.
- **SEO Analysis:** AI-powered SEO analysis provides scores, suggestions, and auto-fixes for project HTML, covering 11 categories.
- **Multilingual Website Support:** Enables creating websites in up to 10 languages with AI-powered translation, manual editing, and RTL language support.
- **Template System:** Offers a library of 12 ready-made website templates across 10 categories, enabling users to create projects from pre-designed layouts.
- **Plugin Store:** Allows users to add pre-built components (e.g., Contact Forms, Social Share Buttons) to their websites, with plugin definitions managed in the backend and injected into project HTML/CSS/JS.

**Technical Implementations:**
- **Monorepo Tool:** pnpm workspaces for managing packages.
- **Backend:** Express 5 API server (`api-server`) handles routes, authentication, project data, and AI interactions.
- **Database:** PostgreSQL with Drizzle ORM for managing schema, including user data, projects, build tasks, and billing.
- **AI Agents:** A multi-agent system comprises:
    - `CodeGenerator`: Generates website files from natural language (Anthropic Claude Opus 4).
    - `CodeReviewer`: Reviews code for quality and security (OpenAI o3).
    - `FixAgent`: Automatically fixes identified issues (Anthropic Claude Opus 4).
    - `FileManager`: Manages file persistence in the database.
    - `PackageRunner`: Detects project type (nodejs/python/static) and runs install/start in sandbox.
- **Agent Orchestration:** An `execution-engine` orchestrates the build pipeline (codegen → review → fix → save → package_runner → QA). Package runner failures are non-fatal — the build succeeds as long as files are saved. Uses streaming API for Anthropic calls to handle long-running operations. Fixer agent returns only changed files, which are merged (not replaced) with the original codegen output to prevent file loss.
- **Sandbox System:** Provides isolated execution environments for project lifecycle management (create, execute, start-server, stop, restart, cleanup).
- **Deployment System:** Real deployment via GitHub Pages — creates a GitHub repository for each project, pushes files, and enables GitHub Pages. Each deployed site gets a live URL at `username.github.io/repo-name`. Uses Replit's GitHub connector (OAuth) for authenticated API access.
- **Email Notification System:** An event-driven system sends emails for critical events based on user preferences.
- **Validation:** Zod is used for schema validation, integrated with `drizzle-zod`.
- **API Codegen:** Orval generates API client hooks and Zod schemas from an OpenAPI specification.
- **Build System:** esbuild handles CJS bundling for production, and `tsc --build --emitDeclarationOnly` manages type checking across the monorepo.
- **User Authentication:** Supports Replit Auth (default) and local email/password authentication.
- **Billing & Subscriptions:** Manages plans, subscriptions, invoices, and credits, integrated with payment gateways.
- **Teams:** Provides functionality for team creation, member management, and role-based access control.
- **Real-time Updates:** Utilizes Server-Sent Events (SSE) for build process and sandbox execution updates.
- **Real-time Collaboration:** A WebSocket-based system enables multiple users to work on the same project simultaneously, featuring live presence tracking, file locking, and real-time edit broadcasting.
- **Custom Domains System:** Allows users to link custom domains with automatic DNS verification and SSL certificate management. Domain hooks use wrapper functions (`useAddDomainWithInvalidation`, `useVerifyDomainWithInvalidation`, `useRemoveDomainWithInvalidation`) over generated hooks to maintain cache invalidation and a simplified call signature.
- **Analytics Dashboard:** Provides per-project analytics including visitor stats, daily traffic, top pages, traffic sources, and device breakdowns.
- **AI Chat:** Real AI conversation in the Builder chat panel using Anthropic Claude Sonnet 4.5. The system intelligently distinguishes between build requests (triggers the build pipeline) and general questions (responds directly via AI). The chat is context-aware, knowing the current project's details. Supports bilingual AR/EN responses. Endpoint: `POST /api/chat/message`.
- **Snapshots:** Project backup snapshots store all project files for one-click restore and comparison.
- **Builder Header Layout:** The sidebar header (280px) uses a two-row layout — top row for project name, back arrow, collaborator avatars, and agent badge; bottom row for action buttons (Analytics, Translations, PWA, Deploy) with flex-wrap for responsive overflow.
- **API Client Exports:** `lib/api-client-react/src/index.ts` re-exports from `generated/api` (hooks, types) and custom hook files (`domains-hooks`, `qa-hooks`, `monitoring-hooks`, `analytics-hooks`, `seo-hooks`, `translations-hooks`). Domain hooks are wrapped to avoid namespace conflicts with generated code.
- **Build Configuration:** `vite.config.ts` provides default values for `PORT` (3000) and `BASE_PATH` (/) during production builds, ensuring `vite build` works without environment variables.

## External Dependencies

- **AI Providers:** Anthropic Claude Opus 4 for code generation, editing, and fixing; OpenAI o3 for code review and planning; GPT-4o for SEO analysis; Claude Sonnet 4.5 for chat. Supports custom API keys via `CUSTOM_ANTHROPIC_API_KEY` and `CUSTOM_OPENAI_API_KEY` environment variables (falls back to Replit AI Integrations if not set).
- **Database:** PostgreSQL.
- **ORM:** Drizzle ORM.
- **Frontend Framework:** React.
- **Build Tools:** Vite, TailwindCSS, esbuild.
- **Validation Library:** Zod.
- **API Client Generation:** Orval.
- **Charting Library:** Recharts (for Analytics Dashboard).
- **Email Services:** Resend or SendGrid (configurable via environment variables).
- **Authentication:** Replit Auth (default) or local email/password system.
- **Payment Gateway:** Stripe (for billing and subscriptions).