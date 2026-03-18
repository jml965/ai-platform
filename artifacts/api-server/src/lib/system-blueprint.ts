export const SYSTEM_BLUEPRINT = `
# Mr Code AI — System Blueprint
# This file is auto-read by infrastructure agents to understand the platform.

## Architecture Overview
- **Frontend**: React + Vite + Tailwind CSS (artifacts/website-builder/)
- **Backend**: Node.js + Express + TypeScript (artifacts/api-server/)
- **Database**: PostgreSQL with Drizzle ORM (lib/db/)
- **Monorepo**: pnpm workspace

## Directory Structure

### Frontend (artifacts/website-builder/src/)
- pages/StrategicAgent.tsx — Main AI chat interface
- pages/Dashboard.tsx — User dashboard
- pages/AdminDashboard.tsx — Admin panel
- pages/Login.tsx — Authentication page
- components/ — Reusable UI components
- lib/i18n.ts — Bilingual AR/EN translations

### Backend (artifacts/api-server/src/)
- routes/index.ts — Main route registration
- routes/strategic.ts — Strategic agent chat endpoints
- routes/agents.ts — Agent management CRUD
- routes/projects.ts — Project management
- routes/admin.ts — Admin routes
- lib/agents/ — All agent implementations
  - strategic-agent.ts — Main conversational AI agent
  - base-agent.ts — Base class for all agents
  - codegen-agent.ts — Code generation
  - reviewer-agent.ts — Code review
  - fixer-agent.ts — Bug fixing
  - surgical-edit-agent.ts — Targeted code editing
  - planner-agent.ts — Task planning
  - translation-agent.ts — Content translation
  - seo-agent.ts — SEO optimization
  - filemanager-agent.ts — File management
  - package-runner-agent.ts — Package operations
  - execution-engine.ts — Pipeline execution
  - ai-clients.ts — AI provider connections (Anthropic/OpenAI/Google)

### Database (lib/db/src/schema/)
- agent-configs.ts — Agent settings & models
- users.ts — User accounts
- projects.ts — User projects
- project-files.ts — Project file storage
- strategic-threads.ts — Chat threads
- ai-providers.ts — AI provider API keys
- execution-logs.ts — Task execution logs
- agent-logs.ts — Agent activity logs

## Key Configuration
- AI Providers: Anthropic (Claude), OpenAI (GPT), Google (Gemini)
- Default model: Claude Sonnet 4.6
- Simple queries: Gemini Flash (auto-governor)
- Agent layer "service" = customer-facing agents
- Agent layer "infra" = infrastructure/platform agents

## Project Rules
- No axios (use fetch)
- No framer-motion in new files
- No radix-ui/shadcn/mui
- Tailwind CSS only
- BrowserRouter only
- Bilingual: Arabic (RTL) + English (LTR)

## API Endpoints
- POST /api/strategic/chat — Non-streaming chat
- POST /api/strategic/chat-stream — SSE streaming chat
- GET /api/agents — List all agents
- PUT /api/agents/:key — Update agent config
- GET /api/projects — List projects
- POST /api/build/execute — Execute build pipeline

## Environment
- DATABASE_URL — PostgreSQL connection
- CUSTOM_ANTHROPIC_API_KEY — Anthropic API
- CUSTOM_OPENAI_API_KEY — OpenAI API
- Google API key stored in ai_providers table
`;

export function getSystemBlueprint(): string {
  return SYSTEM_BLUEPRINT;
}
