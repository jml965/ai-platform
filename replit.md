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
- **AI Agents:** A multi-agent system (11 agents) managed via the Agent Management page (`/agents`):
    - `CodeGenerator`: Generates website files from natural language (Anthropic Claude Sonnet 4).
    - `CodeReviewer`: Reviews code for quality and security (OpenAI o3).
    - `FixAgent`: Automatically fixes identified issues (Anthropic Claude Sonnet 4).
    - `FileManager`: Manages file persistence in the database.
    - `PackageRunner`: Detects project type (nodejs/python/static) and runs install/start in sandbox.
    - `PlannerAgent`: Plans file structure for large projects (OpenAI o3).
    - `SurgicalEditAgent`: Precise code edits on existing files (Anthropic Claude Sonnet 4).
    - `TranslationAgent`: Translates website content between languages (Anthropic Claude Sonnet 4).
    - `SeoAgent`: SEO analysis and suggestions (GPT-4o).
    - `ExecutionEngine`: Main orchestrator for build pipelines.
    - `QA Pipeline`: Quality assurance with review/fix retry loop.
- **Agent Management System:** Full admin panel at `/agents` with per-agent configuration:
    - 3 model slots per agent (primary/secondary/tertiary) with enable/disable toggles
    - **Governor System**: When enabled, 3 models think independently, then a merger extracts the best solution
    - System prompt editing, instructions, memory (short-term + long-term)
    - Pipeline ordering with receives-from/sends-to configuration
    - Token limits, batch sizes, creativity (temperature) per agent
    - Full statistics: tokens used, tasks completed, errors, success rate, avg duration
    - Unlimited custom agent creation
    - Per-slot creativity (0-2, 5 labeled levels), token limits (1K-120K), and timeout settings
    - Changes are saved to DB and take effect on next build
    - DB table: `agent_configs` stores all agent configurations
- **AI Control Center:** Admin panel at `/control-center` for managing AI providers:
    - 20 pre-seeded providers (OpenAI, Anthropic, Google, Mistral, xAI, DeepSeek, Cohere, Meta, Perplexity, Groq, Together, Fireworks, AI21, Replicate, HuggingFace, Azure, NVIDIA, Alibaba, Stability, Amazon)
    - API key management with validation and masking (keys never returned in full via API)
    - Monthly budget tracking with alert thresholds (80%/100%)
    - Per-provider usage statistics (daily/weekly/monthly tokens, cost, requests)
    - Linked agents view showing which agents use each provider
    - Fallback provider configuration, priority ordering
    - Custom provider creation with model definitions
    - Recent request logs per provider
    - **Media Models (Image/Video):** Separate section for image generation providers (DALL·E, Stability AI, Midjourney, Google Imagen) and video generation providers (Runway ML, Pika Labs, Sora, Kling AI, Luma AI) with per-model resolution, cost, and description
    - Agent configs support `imageModel` and `videoModel` slots for linking media providers to agents
    - **Sidebar Layout:** Three-tab sidebar (Text/Image/Video) with provider list; clicking a provider shows its details in the main panel
    - **Shared API Key System:** When a company (e.g., OpenAI) has one key covering text + image + video, entering it once auto-syncs to all related providers. Mappings: `openai_dalle`→`openai`, `openai_sora`→`openai`, `stability_ai`→`stability`, `google_imagen`→`google`. Shared key badge shown in UI. Sync is bidirectional (parent→children and child→parent+siblings).
    - **Provider Verification Sync:** Periodic background sync verifies API key validity with provider APIs (OpenAI, Anthropic, Google). Runs every 30min by default (configurable 5min–24hr). 2-second delay between checks to avoid server pressure. Manual trigger available. Sync panel in header shows last/next sync time and per-provider results.
    - DB tables: `ai_providers`, `provider_usage_logs`, `media_providers` (with `parentProvider` column), `media_usage_logs`
- **Agent Orchestration:** An `execution-engine` orchestrates the build pipeline (codegen → review → fix → save → package_runner → QA). Package runner failures are non-fatal — the build succeeds as long as files are saved. Uses streaming API for Anthropic calls to handle long-running operations (4-minute timeout per call). Fixer agent returns only changed files, which are merged (not replaced) with the original codegen output to prevent file loss. **Batched Build Mode:** For large projects, the system auto-detects complexity and switches to batched generation — first plans all files via PlannerAgent, then generates in batches of ~10 files, saving and previewing after each batch. Each batch receives context from previously generated files for consistency.
- **Sandbox System:** Provides isolated execution environments for project lifecycle management (create, execute, start-server, stop, restart, cleanup). The sandbox proxy auto-restarts stopped sandboxes using the last known start command when a preview request comes in. Each sandbox stores its `lastCommand` for restart recovery.
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
- **Admin Dashboard:** A separate admin-only dashboard at `/admin` route showing platform-wide statistics: total tokens used, costs per agent/project/user, daily usage trends, and cost breakdowns. Protected by `AdminGuard` (requires `role: "admin"` in the users table). API endpoints at `/api/admin/stats/*` enforce admin role checks.
- **Analytics Dashboard:** Provides per-project analytics including visitor stats, daily traffic, top pages, traffic sources, and device breakdowns.
- **AI Chat:** Real AI conversation in the Builder chat panel using Anthropic Claude Sonnet 4.5. The system intelligently distinguishes between build requests (triggers the build pipeline) and general questions (responds directly via AI). The chat is context-aware, knowing the current project's details. Supports bilingual AR/EN responses. When a project is already building, chat returns the active/latest buildId so the frontend can track progress. Endpoint: `POST /api/chat/message`.
- **Live Preview:** Dual-mode preview system: (1) **Sandbox proxy mode** — when the PackageRunner successfully starts a server, the preview iframe loads via `/api/sandbox/proxy/:projectId/` which proxies HTTP requests to the sandbox's allocated port (9000-9099). This enables real Vite/npm dev servers with full Tailwind CSS, npm packages, and CSS Modules support. (2) **srcDoc fallback** — when no sandbox server is running, falls back to in-browser Babel+React CDN transpilation with IIFE isolation. The `DevicePreviewFrame` component handles 23 device presets (iPhone 16 Pro Max, Pixel 9, Galaxy S25 Ultra, iPad Pro 13", Surface Pro, MacBook Pro 16", iMac 24", Ultrawide, etc.) with automatic CSS `scale()` transform when the device dimensions exceed the container. Each file chunk is wrapped in an IIFE with an `__exports` registry; icon imports → `var X = __icons["X"]`; `__matchRoute()` handles dynamic params; `__skipImports` prevents router/React overwrite.
- **Builder Layout:** Replit-style three-panel workspace — LEFT=Chat panel, CENTER=Live Preview only (no tabs, preview always visible, build progress as bottom overlay with backdrop blur), RIGHT=Files/Code/Library/Snapshots/Plugins/Collaboration/Domains/SEO tabs. The right panel has tab buttons for each section with conditional content rendering via ternary chain. CSS editor toggle is in the URL bar. Device selector dropdown in the URL bar with 23 presets.
- **Snapshots:** Project backup snapshots store all project files for one-click restore and comparison. Full UI panel integrated in Builder right sidebar with create/restore/delete/compare functionality.
- **File Upload:** Multer-based file upload system (POST /projects/:id/upload) supporting images, fonts, CSS, JS, JSON. Max 2MB per file, 10 files per upload. Uploads stored as project files with base64 encoding for binary files. Upload directory restricted to allowed paths (public/assets, public/images, src/assets, assets).
- **Code Editor:** CodeMirror 6 editor with syntax highlighting (JS/TS/JSX/TSX/HTML/CSS/Python/JSON), line numbers, bracket matching, autocompletion, fold gutter, search, dark theme, and Ctrl+S save support.
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