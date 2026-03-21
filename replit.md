# AI Website Builder Platform

## Overview

The AI Website Builder Platform empowers users to generate, review, and fix website code using natural language descriptions in both Arabic and English, supporting RTL/LTR layouts. This pnpm workspace monorepo project aims to democratize website creation, translating natural language into functional, high-quality websites for individuals and small businesses. Its vision is to be the leading AI-powered solution for user-friendly and flexible website generation, particularly in bilingual contexts.

## User Preferences

- I prefer clear and concise explanations.
- I appreciate iterative development with regular updates.
- Please ask for confirmation before implementing significant changes.
- Ensure the codebase remains clean and well-documented.

## System Architecture

The platform employs a pnpm workspace monorepo structure, separating deployable applications from shared libraries.

**UI/UX Decisions:**
- **Frontend:** Built with React, Vite, and TailwindCSS, featuring bilingual (AR/EN) support and RTL/LTR layouts via i18n context.
- **Core Pages:** Includes Login, Dashboard, Builder (with chat prompt and live preview), Billing, Teams, Quality Assurance, Monitoring, and Analytics.
- **PWA Support:** Projects can be converted into installable Progressive Web Apps.
- **SEO Analysis:** AI-powered analysis provides scores, suggestions, and auto-fixes for HTML.
- **Multilingual Websites:** Supports creation of websites in up to 10 languages with AI translation and manual editing.
- **Template System:** Offers 12 ready-made website templates across 10 categories.
- **Plugin Store:** Enables adding pre-built components like contact forms and social share buttons.

**Technical Implementations:**
- **Backend:** Express 5 API server.
- **Database:** PostgreSQL with Drizzle ORM.
- **AI Agents:** A streamlined 11-agent architecture, comprising 6 Service Agents (`strategic`, `execution_engine`, `codegen`, `fixer`, `surgical_edit`, `qa_pipeline`) and 5 Infra Agents (`infra_sysadmin`, `infra_bugfixer`, `infra_builder`, `infra_security`, `infra_deploy`). Agents operate with distinct roles (Thinker, Executor, Specialist).
- **Agent Management System:** An admin panel at `/agents` for per-agent configuration (model selection, prompts, memory, pipeline, token limits, custom agents). Features a Governor System for merging solutions and an Auto-Governor for optimal model selection based on complexity. Includes real-time execution logs and a "Reset" function for defaults.
- **AI Control Center:** An admin panel at `/control-center` to manage AI providers, API keys, budget tracking, usage statistics, and fallback configurations for text, image, and video models.
- **AI Providers:** Integrated with OpenAI (GPT-5.x, GPT-4.x, o-series), Anthropic (Claude Opus/Sonnet/Haiku 3.5–4.6), and Google (Gemini 2.0–2.5).
- **Agent Orchestration:** The `execution-engine` orchestrates the build pipeline (codegen → review → fix → save → package_runner → QA), supporting batched builds and an `ImportFixer` post-processor.
- **Sandbox System:** Provides isolated execution environments for project lifecycle management, with a proxy for live previews and automatic stopping of previous sandboxes.
- **Deployment System:** Supports real deployment to GitHub Pages. The platform itself deploys to Google Cloud Run via GitHub Actions CI/CD.
- **Email Notifications:** Event-driven email notifications for critical events.
- **Validation:** Zod for schema validation.
- **API Codegen:** Orval generates API client hooks and Zod schemas from OpenAPI specifications.
- **Build System:** esbuild for CJS bundling; `tsc` for type checking.
- **User Authentication:** Replit Auth and local email/password.
- **Billing & Subscriptions:** Manages plans, subscriptions, invoices, and credits.
- **Teams:** Facilitates team creation, member management, and role-based access control.
- **Real-time Updates:** Server-Sent Events (SSE) for build process and sandbox execution updates.
- **Real-time Collaboration:** WebSocket-based system for simultaneous multi-user project work.
- **Custom Domains:** Allows linking custom domains with automatic DNS verification and SSL.
- **Infrastructure Agents Panel:** A dedicated admin panel at `/infra` for platform owner to manage and develop the platform via AI agents (System Director, Bug Fixer, Feature Builder, Security Guard, Deployment Agent). Features a Controlled AI Runtime with approval engine, audit logs, tool risk configuration, DB safety measures, and a kill switch. Includes System Awareness: page context injection (currentPage, projectId, mode), platform purpose in system blueprint, and project monitoring tools (get_project_status, get_project_logs, list_project_files) with auto-monitoring mode.
- **Authentication:** Environment-aware authentication, requiring real auth in production and auto-injecting an admin user in development.
- **Admin Dashboard:** A separate dashboard at `/admin` for platform-wide statistics and cost analysis.
- **Analytics Dashboard:** Provides per-project analytics including visitor stats and traffic sources.
- **Strategic Agent Page:** Dedicated page at `/strategic` with chat, file/image upload, design analysis, and an Agent Configuration Mode for modifying agent settings via natural language. Uses SSE for streaming chat.
- **AI Chat:** Context-aware chat in the Builder panel, distinguishing between build requests and general questions.
- **Live Preview:** A dual-mode system using a sandbox proxy or `srcDoc` fallback, supporting 23 device presets and incremental live preview with hot reloads.
- **Builder Layout:** Replit-style three-panel workspace: Chat (left), Live Preview (center), and Files/Code/Library/Snapshots/Plugins/Collaboration/Domains/SEO (right).
- **Preview States:** Contextual states display during preview (e.g., "Building...", "Connecting...").
- **Snapshots:** Project backup snapshots for restore and comparison.
- **File Upload:** Multer-based system for various file types.
- **Code Editor:** CodeMirror 6 with syntax highlighting and autocompletion.

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