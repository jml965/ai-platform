# Operations Runbook — AI Website Builder Platform
# دليل تشغيل المنصة — منصة بناء المواقع بالذكاء الاصطناعي

## Table of Contents / جدول المحتويات

1. [System Architecture / بنية النظام](#system-architecture)
2. [Service Health Checks / فحوصات صحة النظام](#health-checks)
3. [Incident Response / الاستجابة للحوادث](#incident-response)
4. [Common Issues & Solutions / المشاكل الشائعة وحلولها](#common-issues)
5. [Monitoring Endpoints / نقاط المراقبة](#monitoring-endpoints)
6. [Escalation / التصعيد](#escalation)

---

## System Architecture

### Services
| Service | Purpose | Port |
|---------|---------|------|
| API Server | Express backend, all business logic | 8080 |
| Website Builder | React+Vite frontend | 19171 |
| PostgreSQL | Primary database | 5432 |

### Key Dependencies
- **Anthropic AI** (via Replit integration) — CodeGen + Fixer agents
- **OpenAI** (via Replit integration) — Reviewer agent
- **Stripe** — Payment processing
- **jsdom** — QA runtime execution

---

## Health Checks

### Automated Checks
- `GET /api/healthz` — Basic API liveness
- `GET /api/monitoring/health` — DB connectivity, memory usage, uptime
- `GET /api/monitoring/alerts` — Active system alerts with severity

### Manual Verification Steps
1. Verify API responds: `curl $APP_DOMAIN/api/healthz`
2. Check DB connection: `GET /api/monitoring/health` → `database.status === "connected"`
3. Check memory: `GET /api/monitoring/health` → `memory.heapUsedMb` (alert if > 75% of total)
4. Check build pipeline: `GET /api/monitoring/stats` → `builds.successRate`

---

## Incident Response

### Severity Levels

| Level | Criteria (EN) | المعايير (AR) | Response Time |
|-------|---------------|---------------|---------------|
| P1 Critical | Platform down, DB unreachable, all builds failing | المنصة متوقفة، قاعدة البيانات غير متاحة | Immediate |
| P2 High | Build success rate < 50%, payment failures | نسبة النجاح أقل من 50% | 30 minutes |
| P3 Medium | Elevated error rate, slow responses | ارتفاع نسبة الأخطاء | 4 hours |
| P4 Low | Minor UI issues, non-critical warnings | مشاكل واجهة بسيطة | Next business day |

### P1: Platform Down / المنصة متوقفة
1. Check if the API server process is running
2. Restart the API server workflow
3. Check database connectivity — verify `DATABASE_URL` environment variable
4. If DB is down, check PostgreSQL service status
5. Check deployment logs for crash errors
6. If AI integrations are failing, verify Replit AI integration status

### P2: High Build Failure Rate / نسبة فشل عالية
1. Check `GET /api/monitoring/performance` for common errors
2. If Anthropic/OpenAI errors → check AI integration connectivity
3. If token limit errors → check user spending limits
4. If code generation errors → review recent agent configuration changes
5. Check QA pipeline: `GET /api/monitoring/stats` → `qa.passRate`

### P3: Memory Issues / مشاكل الذاكرة
1. Check `GET /api/monitoring/health` → `memory.heapUsedMb`
2. If > 75% heap used → restart API server
3. Check active sandboxes count — kill idle sandboxes
4. Review for memory leaks in recent deployments

### P4: Slow Response Times / بطء الاستجابة
1. Check `GET /api/monitoring/performance` → `overview.avgDurationMs`
2. Check DB latency: `GET /api/monitoring/health` → `database.latencyMs`
3. If DB latency > 1000ms → check for missing indexes or long-running queries
4. Review slowest tasks for patterns

---

## Common Issues

### "Insufficient Credits" Error
- **Cause**: User has no credit balance
- **Solution**: User needs to top up via `/billing` page
- **Check**: `GET /api/billing/balance` for the user

### Build Stuck in "Building" Status
- **Cause**: Agent process hung or AI API timeout
- **Solution**: Cancel the build via `POST /api/build/{buildId}/cancel`
- **Prevention**: Builds have automatic timeout limits

### QA Pipeline Failures
- **Cause**: Generated HTML has critical issues
- **Solution**: Auto-fix retry handles most cases (up to 3 attempts)
- **Check**: `GET /api/monitoring/stats` → QA pass rate

### Sandbox Not Starting
- **Cause**: Max concurrent sandbox limit (10) reached or port conflict
- **Solution**: Clean up inactive sandboxes, check sandbox manager logs
- **Check**: `GET /api/sandbox` to list active sandboxes

### Stripe Webhook Failures
- **Cause**: Webhook signature mismatch or processing error
- **Check**: API server logs for "Stripe webhook error"
- **Solution**: Verify `STRIPE_WEBHOOK_SECRET` env var, check Stripe dashboard

### AI Agent Errors (Anthropic/OpenAI)
- **Cause**: Rate limits, API outage, or configuration issue
- **Check**: `GET /api/monitoring/performance` → agent failure rates
- **Solution**: Check Replit AI integration status, retry logic handles transient errors

---

## Monitoring Endpoints

All endpoints require authentication.

| Endpoint | Purpose | Refresh Interval |
|----------|---------|-----------------|
| `GET /api/monitoring/health` | Service health, DB, memory | 30s |
| `GET /api/monitoring/stats` | Users, builds, tokens, QA | 30s |
| `GET /api/monitoring/performance` | Slowest ops, errors, agent stats | 60s |
| `GET /api/monitoring/alerts` | Active alerts with severity | 15s |
| `GET /api/healthz` | Basic liveness probe | 10s |

### Key Metrics to Watch
- **Build Success Rate** — should be > 80%
- **QA Pass Rate** — should be > 70%
- **DB Latency** — should be < 100ms
- **Memory Usage** — should be < 75% heap
- **Active Sandboxes** — max 10 concurrent

---

## Escalation

### Internal Team
1. Check monitoring dashboard at `/monitoring`
2. Review alerts for severity level
3. Follow incident response procedures above
4. Document actions taken in incident log

### External Dependencies
- **Replit Platform**: Check status.replit.com
- **Stripe**: Check status.stripe.com
- **AI APIs**: Check through Replit AI integrations panel
