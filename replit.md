# AI Website Builder Platform

## Overview

The AI Website Builder Platform allows users to generate, review, and fix website code using natural language descriptions in Arabic or English. It supports both RTL/LTR languages. This pnpm workspace monorepo project aims to democratize website creation by translating natural language into functional, high-quality websites for individuals and small businesses. The platform's vision is to become the leading AI-powered solution for user-friendly and flexible website generation, especially in bilingual contexts.

## User Preferences

- I prefer clear and concise explanations.
- I appreciate iterative development with regular updates.
- Please ask for confirmation before implementing significant changes.
- Ensure the codebase remains clean and well-documented.

## System Architecture

The platform uses a pnpm workspace monorepo structure, separating deployable applications from shared libraries.

**UI/UX Decisions:**
- **Frontend:** React, Vite, and TailwindCSS, with bilingual (AR/EN) support and RTL/LTR layouts via i18n context.
- **Core Pages:** Login, Dashboard, Builder (chat prompt, live preview), Billing, Teams, Quality Assurance, Monitoring, Analytics.
- **PWA Support:** Converts projects into installable Progressive Web Apps.
- **SEO Analysis:** AI-powered analysis provides scores, suggestions, and auto-fixes for HTML.
- **Multilingual Website Support:** Create websites in up to 10 languages with AI translation and manual editing.
- **Template System:** A library of 12 ready-made website templates across 10 categories.
- **Plugin Store:** Allows adding pre-built components (e.g., Contact Forms, Social Share Buttons) to websites.

**Technical Implementations:**
- **Monorepo Tool:** pnpm workspaces.
- **Backend:** Express 5 API server.
- **Database:** PostgreSQL with Drizzle ORM.
- **AI Agents:** A multi-agent system orchestrates website generation, review, fixing, translation, SEO analysis, and more. Key agents include `CodeGenerator`, `CodeReviewer`, `FixAgent`, `PlannerAgent`, `SurgicalEditAgent`, `TranslationAgent`, `SeoAgent`, and `ExecutionEngine`.
- **Agent Management System:** An admin panel at `/agents` allows per-agent configuration, including model selection, system prompts, memory, pipeline ordering, token limits, and custom agent creation. It features a Governor System for merging solutions from multiple models. **Reset System:** Each agent has a "Reset" button to restore factory defaults, plus a global "Reset System Defaults" button at the top of the sidebar that resets all agents and removes custom ones. Hard permission enforcement blocks agents lacking required permissions. `receivesFrom` controls actual pipeline input routing. `sourceFiles` UI is fully editable with add/remove. **Agent Logs Tab:** Real-time execution logs per agent with auto-refresh, expandable details (action, status, build ID, project ID, JSON details), clear logs, and bilingual (AR/EN) messages. Logs are dual-written from `logExecution()` in the execution engine and `logStrategicActivity()` in the strategic agent. Admin-only endpoints: `GET /agents/logs/:agentKey` and `DELETE /agents/logs/:agentKey`. DB table: `agent_logs` with composite index on (agent_key, created_at). **All agent config settings are now functional:** instructions, permissions, batchSize, receivesFrom/sendsTo, roleOnReceive/roleOnSend, description, sourceFiles, and memory are all wired into actual agent execution. **Auto-Governor System:** Available on all agents (toggle in Models & Governor tab). When enabled, it computes a complexity score (0-100) based on message length, technical keywords, code/attachments, and error patterns, then auto-selects the optimal mode: Simple (0-20, lightweight model), Standard (21-55, main model), or Advanced (56-100, 3 models + governor merge). Includes Lazy Escalation that auto-upgrades if response quality is low (empty, uncertain, no JSON for technical query, low confidence, no execution steps). Safety rules: max one escalation, never downgrade, any technical keyword forces minimum Standard. Currently wired for the Strategic Agent; toggle available in UI for all agents.
- **AI Control Center:** An admin panel at `/control-center` manages AI providers (20 pre-seeded), API keys, budget tracking, usage statistics, and fallback configurations. It supports text, image, and video models, with a shared API key system for providers like OpenAI. A background service verifies API key validity.
- **Three AI Providers Supported:** OpenAI (GPT-5.x, GPT-4.x, o-series), Anthropic (Claude Opus/Sonnet/Haiku 3.5–4.6), and Google (Gemini 2.0–2.5). Keys are read from DB (Control Center) first, then environment variables as fallback. Google Gemini uses `@google/genai` SDK. All three providers are wired in both `base-agent.ts` (for pipeline agents) and `strategic-agent.ts` (for strategic chat).
- **Agent Orchestration:** The `execution-engine` orchestrates the build pipeline (codegen → review → fix → save → package_runner → QA). It supports a batched build mode for large projects. An `ImportFixer` post-processor resolves mismatched import paths across parallel-generated modules before file save.
- **Sandbox System:** Provides isolated execution environments for project lifecycle management, with a proxy for live previews. Automatically stops existing sandboxes before creating new ones. Uses `--strictPort` for Vite to prevent port conflicts. Temperature parameter removed from all LLM calls (Anthropic/OpenAI) to avoid model compatibility issues.
- **Deployment System:** Real deployment via GitHub Pages, creating and pushing project files to a GitHub repository. Platform itself deploys to Google Cloud Run via GitHub Actions CI/CD (`.github/workflows/deploy-cloud-run.yml`). Docker image pushed to Artifact Registry (`me-central1-docker.pkg.dev/oktamam-ai-platform/mrcodeai/mrcodeai-app`). Cloud SQL PostgreSQL (`mrcodeai-db` at `34.18.137.40`). Domain `mrcodeai.com` routed via Google Cloud Load Balancer (IP: `34.8.145.55`) with managed SSL certificate.
- **Email Notification System:** Event-driven email notifications for critical events.
- **Validation:** Zod for schema validation.
- **API Codegen:** Orval generates API client hooks and Zod schemas from OpenAPI specifications.
- **Build System:** esbuild for CJS bundling; `tsc` for type checking.
- **User Authentication:** Replit Auth and local email/password.
- **Billing & Subscriptions:** Manages plans, subscriptions, invoices, and credits.
- **Teams:** Provides team creation, member management, and role-based access control.
- **Real-time Updates:** Server-Sent Events (SSE) for build process and sandbox execution updates.
- **Real-time Collaboration:** WebSocket-based system for multiple users to work on projects simultaneously.
- **Custom Domains System:** Allows linking custom domains with automatic DNS verification and SSL.
- **Infrastructure Agents Panel:** A dedicated admin panel at `/infra` (accessible from Dashboard sidebar under "Admin Panel" with gold crown icon) for platform owner to manage and develop the platform itself via AI agents. Features 8 infrastructure agents: **System Director** (`infra_sysadmin`, Crown icon, gold styling, displayed separately at top of sidebar) — the supreme commander using 3 AI models (Claude + Gemini + o3-mini) in parallel + Governor merge for maximum accuracy; System Monitor (Gemini), Bug Fixer (Claude), Feature Builder (Claude), UI Updater (Claude), Database Manager (Claude), Security Guard (Claude), Deployment Agent (Gemini). Each agent has streaming chat with context-aware system prompts including full system blueprint. Director uses dedicated endpoint `POST /api/infra/director-stream` with parallel model execution and governor merge (supports Anthropic/Google/OpenAI providers); others use `POST /api/infra/chat-stream`. Status events (`type:"status"`) show as centered yellow pills during processing. Agents separated via `agentLayer` column (`"infra"` vs `"service"`). OpenAI reasoning models (o1/o3) automatically have temperature omitted. Backend routes: `GET /api/infra/agents`, `POST /api/infra/chat-stream`, `POST /api/infra/director-stream`, `POST /api/infra/clear-session`. **Agent Runtime Controls:** Search limiter (max 3 `search_text` per session), repeated query blocker (same query blocked), forced execution (auto-stop after 6 steps without edit), session summary logging (totalSteps, searchCount, hasEdited, queries logged to `ai_audit_logs`). Prompt enforces 3-step workflow: search → read → edit. DB write validation with pre/post SELECT checks.
- **Authentication:** Uses environment-aware auth — production mode requires real authentication (`requireAuth`), development mode auto-injects an admin user for testing convenience. Auth providers: Replit Auth (OIDC+PKCE) and local email/password.
- **Admin Dashboard:** A separate dashboard at `/admin` for platform-wide statistics and cost analysis.
- **Analytics Dashboard:** Provides per-project analytics including visitor stats and traffic sources.
- **Strategic Agent Page:** Dedicated page at `/strategic` with full chat, file/image upload (drag-drop), and design analysis. Features an **Agent Configuration Mode** that lets the user select any agent from a dropdown and modify its settings (tokens, system prompt, permissions, creativity, model slots, governor) via natural language chat. Includes a reset-to-defaults button for each agent. Accessible from the Dashboard sidebar. **Streaming Chat:** Uses SSE streaming (`/api/strategic/chat-stream`) for real-time word-by-word response display. The streaming function applies all config fields (permissions, roleOnReceive/roleOnSend, description, instructions, memory, creativity, tokenLimit) and supports multimodal image attachments for Anthropic provider.
- **AI Chat:** Context-aware chat in the Builder panel using Anthropic Claude, distinguishing between build requests and general questions.
- **Live Preview:** A dual-mode system using either a sandbox proxy for real server environments or an `srcDoc` fallback for client-side rendering. Supports 23 device presets. The proxy rewrites absolute paths in HTML (`src`, `href` attributes) and JS modules (`from "/..."`, `import "/..."`) to route through the proxy prefix, preventing sandbox requests from hitting the main app's Vite server. It also injects `history.replaceState` and `pushState` interceptors to fix BrowserRouter path issues inside the iframe. The frontend polls `/api/sandbox/project/:id` to detect running sandboxes and triggers proxy-based recovery on page load. **Incremental Live Preview:** The sandbox starts early after the core module completes (before parallel modules finish). Each module's files are written directly to the sandbox on completion, triggering Vite's hot reload. The `PackageRunnerAgent` reuses the existing sandbox at final build step instead of creating a new one, and detects `package.json` changes to reinstall dependencies. Frontend polling interval is 2s during active builds, 5s otherwise.
- **Builder Layout:** Replit-style three-panel workspace: Chat (left), Live Preview (center), and Files/Code/Library/Snapshots/Plugins/Collaboration/Domains/SEO (right). Panels have max-width constraints (50vw) and overflow-hidden to prevent layout overlap.
- **Preview States:** The preview panel shows contextual states instead of blank screens: "Building..." during active builds, "Connecting..." while verifying sandbox proxy, "Starting preview server..." when sandbox is running but proxy not ready, "Connection failed" with retry button on proxy failure, error boundary for srcDoc rendering failures.
- **Snapshots:** Project backup snapshots for one-click restore and comparison.
- **File Upload:** Multer-based file upload system supporting various file types (images, fonts, CSS, JS, JSON).
- **Code Editor:** CodeMirror 6 with syntax highlighting, autocompletion, and various coding features.
- **Builder Header Layout:** Two-row header for project name, collaborators, and action buttons.

## External Dependencies

- **AI Providers:** Anthropic (Claude Opus 4, Claude Sonnet 4.5), OpenAI (o3, GPT-4o), and other major providers managed via the Control Center.
- **Database:** PostgreSQL.
- **ORM:** Drizzle ORM.
- **Frontend Framework:** React.
- **Build Tools:** Vite, TailwindCSS, esbuild.
- **Validation Library:** Zod.
- **API Client Generation:** Orval.
- **Charting Library:** Recharts.
- **Email Services:** Resend or SendGrid.
- **Authentication:** Replit Auth.
- **Payment Gateway:** Stripe.