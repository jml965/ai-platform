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
- **Agent Orchestration:** The `execution-engine` orchestrates the build pipeline (codegen → review → fix → save → package_runner → QA). It supports a batched build mode for large projects. An `ImportFixer` post-processor resolves mismatched import paths across parallel-generated modules before file save.
- **Sandbox System:** Provides isolated execution environments for project lifecycle management, with a proxy for live previews. Automatically stops existing sandboxes before creating new ones. Uses `--strictPort` for Vite to prevent port conflicts. Temperature parameter removed from all LLM calls (Anthropic/OpenAI) to avoid model compatibility issues.
- **Deployment System:** Real deployment via GitHub Pages, creating and pushing project files to a GitHub repository.
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
- **Admin Dashboard:** A separate dashboard at `/admin` for platform-wide statistics and cost analysis.
- **Analytics Dashboard:** Provides per-project analytics including visitor stats and traffic sources.
- **Strategic Agent Page:** Dedicated page at `/strategic` with full chat, file/image upload (drag-drop), and design analysis. Features an **Agent Configuration Mode** that lets the user select any agent from a dropdown and modify its settings (tokens, system prompt, permissions, creativity, model slots, governor) via natural language chat. Includes a reset-to-defaults button for each agent. Accessible from the Dashboard sidebar.
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