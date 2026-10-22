# CloudPulse – Multi-Cloud Monitoring & Operations Platform

> **Unified visibility across your entire cloud infrastructure.**

CloudPulse is a full-stack, enterprise-style operations console that aggregates compute, storage, network, service-health, alert and cost data from **AWS, Microsoft Azure and Google Cloud** into one dashboard.

Different providers expose different consoles, APIs, metrics and billing formats. CloudPulse normalises them behind a single provider abstraction, stores telemetry in MongoDB, caches hot data in Redis and serves a React + TypeScript UI over a REST API.

For the demo, a **mock cloud provider** generates realistic inventories, telemetry, billing data and health checks. Real AWS/Azure/GCP adapters plug into the same interface without frontend changes.

---

## Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech stack](#tech-stack)
- [Quick start (Docker)](#quick-start-docker)
- [Local development](#local-development)
- [Environment variables](#environment-variables)
- [Roles & permissions](#roles--permissions)
- [API documentation](#api-documentation)
- [Data model](#data-model)
- [Redis caching](#redis-caching)
- [Project structure](#project-structure)
- [Screenshots](#screenshots)
- [Security](#security)
- [Future enhancements](#future-enhancements)

---

## Features

**Overview dashboard**
- KPI cards: providers, resources, healthy / warning / critical counts, 30-day cloud cost (with change vs prior period)
- Infrastructure **health score** (0–100) weighted across resource health, service availability and critical alerts
- Resource health chart (fleet CPU / memory, 1h → 30d), cost by provider, provider health, recent alerts
- Auto-generated **operational insights** and **cost-optimisation recommendations** (rightsizing, idle resources, lifecycle policies)
- Auto refresh every 30 s plus manual refresh with “Last updated: 14 seconds ago”

**Monitoring**
- **Resources** – unified inventory with search, filters (provider, status, type, region, environment), sorting, pagination and CSV export
- **Resource details** – metadata, tags and interactive charts for CPU, memory, network, disk, requests and error rate with time ranges
- **Compute** – running / stopped instances, fleet CPU & memory, status and provider distribution, top consumers, underutilised instances
- **Storage** – capacity, utilisation, 30-day growth, storage by provider, storage cost, near-capacity volumes
- **Network** – inbound/outbound traffic, bandwidth utilisation, errors, request volume, traffic by provider, top talkers
- **Service health** – cloud services, platform components and applications with uptime, latency, error rate and check history (MongoDB and Redis are checked live)

**Cloud management**
- Provider cards (connection, regions, resources, monthly cost, health, last sync) and a provider comparison
- 5-step **Add Cloud Provider** wizard: select provider → account details → validate → synchronise → done
- Accounts table: sync, rename, change environment, pause/reconnect, remove

**FinOps**
- Month-to-date, previous month, month-end forecast, daily cost, 30-day cost
- Monthly cost (line), cost by provider (bar), cost by service (donut), daily spending (stacked area), cost by region
- **Cost anomaly detection**: week-over-week increase above a threshold, abnormal daily spikes (3σ), unexpected new service spend, sudden resource creation – with expected vs actual, difference and severity

**Operations**
- Alerts with acknowledge / resolve / delete, tabs by status, filters, deep-links and CSV export
- Alert rules (CPU, memory, disk, network, error rate, cost increase, service availability) with operator, threshold, duration and severity; evaluated every monitoring cycle
- Notification centre with unread count (new alerts, resolutions, connection failures, cost anomalies, system events)

**Platform**
- JWT auth in HTTP-only cookies, bcrypt hashing, role-based access (Admin / Operator / Viewer), forgot/reset password
- Global search (Ctrl/⌘ K) across resources, accounts, services and alerts
- Environment selector, light/dark theme, collapsible sidebar, responsive layout
- Report exports: resources, alerts, costs, service health (CSV) and an executive summary (JSON)
- Demo mode auto-seeds a realistic environment on first start

---

## Architecture

```
┌──────────────────────────────┐
│ React + TypeScript (Vite)    │  Recharts · Lucide · React Router
└──────────────┬───────────────┘
               │ Axios (REST, same-origin /api, HTTP-only cookie)
┌──────────────▼───────────────┐
│ Express.js API (TypeScript)  │  helmet · CORS · rate limit · zod validation
│  routes → controllers        │  JWT auth + role middleware · central errors
└──────┬────────────────┬──────┘
       │                │
┌──────▼───────┐  ┌─────▼─────────────┐
│ Service layer│  │ Redis cache       │  read-through, TTL per data type,
│ monitoring · │◄─┤ (dashboard, health│  namespace invalidation on writes
│ cost · alert │  │  resources, …)    │
│ cloud · seed │  └───────────────────┘
└──────┬───────┘
       │                  ┌─────────────────────────────────────┐
┌──────▼───────┐          │ CloudProvider interface             │
│ MongoDB      │◄─────────┤  MockCloudProvider  (demo, default) │
│ (Mongoose)   │ monitoring│  AWSCloudProvider  ┐               │
└──────────────┘   loop   │  AzureCloudProvider ├ live adapters  │
                          │  GCPCloudProvider  ┘               │
                          └─────────────────────────────────────┘
```

**Monitoring loop** (every `SIMULATION_INTERVAL_MS`, default 60 s):
1. Poll each resource through its provider adapter → store a `Metric` sample, update current utilisation and derived status
2. Run service health checks (live MongoDB and Redis pings + provider services) and recompute uptime
3. Top up daily billing records through yesterday
4. Invalidate affected Redis namespaces
5. Evaluate enabled alert rules → open alerts and notifications (deduplicated per resource + rule)

On start-up the API back-fills any metric gaps (for example after downtime) so charts stay continuous.

### Provider abstraction

`backend/src/providers/CloudProvider.ts`

```ts
interface CloudProvider {
  validateConnection(input): Promise<ConnectionResult>;
  getResources(account): Promise<DiscoveredResource[]>;
  getMetrics(resource, from, to, stepMinutes): Promise<MetricSample[]>;
  getCurrentMetrics(resource): Promise<MetricSample>;
  getCosts(account, from, to): Promise<DailyCost[]>;
  getServiceHealth(): Promise<ServiceHealthSample[]>;
}
```

`CLOUD_PROVIDER_MODE=mock` uses `MockCloudProvider` for every provider. `CLOUD_PROVIDER_MODE=live` routes each provider to `AWSCloudProvider`, `AzureCloudProvider` or `GCPCloudProvider` (`providers/LiveProviders.ts`). Those adapters currently fail with a clear `501 ProviderNotConfigured` error; implement them with the vendor SDKs (CloudWatch / Cost Explorer, Azure Monitor / Cost Management, Cloud Monitoring / BigQuery billing export) and nothing else changes.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript, Vite, React Router, Axios, Recharts, Lucide React |
| Backend | Node.js 22, Express, TypeScript, Mongoose, ioredis, zod, jsonwebtoken, bcryptjs, helmet |
| Database | MongoDB 7 |
| Cache / real-time | Redis 7 |
| API | REST (JSON) |
| DevOps | Docker, Docker Compose, Nginx (static + reverse proxy), Git/GitHub |

---

## Quick start (Docker)

Prerequisites: Docker with Compose v2.

```bash
git clone https://github.com/<you>/cloudpulse.git
cd cloudpulse
cp .env.example .env          # skip if .env already exists
# set JWT_SECRET (≥ 32 chars):
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
docker compose up --build
```

| Service | URL |
|---|---|
| Web app | http://localhost:3000 |
| API | http://localhost:5000/api |
| Health | http://localhost:5000/api/health |

On first start the API sees an empty database and seeds the demo environment (≈ 50 resources across 4 accounts, 30 days of metrics, 6 months of billing, alert rules, alerts, service checks and notifications). This takes roughly 10–30 seconds.

**Demo login**

| Role | Email | Password |
|---|---|---|
| Admin | `admin@cloudpulse.com` | `Admin@123` |
| Operator | `operator@cloudpulse.com` | `Operator@123` |
| Viewer | `viewer@cloudpulse.com` | `Viewer@123` |

> These credentials exist only for the demo. Set `DEMO_MODE=false` and create real users for any shared deployment.

Re-seed from scratch:

```bash
docker compose exec backend npm run seed:prod
```

Stop and remove data: `docker compose down -v`.

---

## Local development

Prerequisites: Node.js 20+, MongoDB 6+ and Redis 7 running locally (or `docker compose up mongodb redis` with their ports exposed).

```bash
cp .env.example .env            # set JWT_SECRET

# API
cd backend
npm install
npm run seed                    # optional – DEMO_MODE seeds automatically on an empty DB
npm run dev                     # http://localhost:5000

# Web (second terminal)
cd frontend
npm install
npm run dev                     # http://localhost:5173 (proxies /api → :5000)
```

Useful scripts

| Where | Script | Purpose |
|---|---|---|
| backend | `npm run dev` | API with hot reload (tsx) |
| backend | `npm run build && npm start` | Compile and run production build |
| backend | `npm run seed` | Wipe and reseed demo data (`-- --if-empty` to only seed an empty DB) |
| backend | `npm run typecheck` | TypeScript check |
| frontend | `npm run dev` | Vite dev server |
| frontend | `npm run build` | Type-check and build to `dist/` |

---

## Environment variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | API port |
| `NODE_ENV` | `development` | `production` enables JSON logs and hides stack traces |
| `MONGO_URI` | – (required) | MongoDB connection string |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | – (required, ≥ 32 chars) | Secret for signing JWTs |
| `JWT_EXPIRES_IN` | `8h` | Session lifetime |
| `COOKIE_SECURE` | `true` in production | Send the auth cookie only over HTTPS |
| `CORS_ORIGIN` | `http://localhost:5173` | Allowed browser origins (comma separated) |
| `APP_URL` | `http://localhost:5173` | Base URL used in password-reset links |
| `DEMO_MODE` | `true` | Seed demo data when the database is empty |
| `CLOUD_PROVIDER_MODE` | `mock` | `mock` or `live` provider adapters |
| `SIMULATION_ENABLED` | `true` | Run the monitoring loop |
| `SIMULATION_INTERVAL_MS` | `60000` | Monitoring loop interval |
| `CACHE_TTL_DASHBOARD` | `30` | Dashboard cache TTL (s) |
| `CACHE_TTL_RESOURCES` | `15` | Resource / metric cache TTL (s) |
| `CACHE_TTL_SERVICE_HEALTH` | `10` | Service health cache TTL (s) |
| `CACHE_TTL_PROVIDERS` | `30` | Provider / account cache TTL (s) |
| `CACHE_TTL_ALERTS` | `15` | Alert cache TTL (s) |
| `CACHE_TTL_COSTS` | `60` | Cost cache TTL (s) |
| `LOG_LEVEL` | `info` / `debug` | `debug`, `info`, `warn`, `error` |

Frontend (optional): `VITE_API_PROXY_TARGET` (dev proxy target), `VITE_API_URL` (absolute API URL instead of same-origin `/api`).

---

## Roles & permissions

| Capability | Admin | Operator | Viewer |
|---|:-:|:-:|:-:|
| Dashboards, resources, metrics, service health, reports | ✓ | ✓ | ✓ |
| View alerts and alert rules | ✓ | ✓ | ✓ |
| Acknowledge / resolve / create alerts | ✓ | ✓ | – |
| View costs, anomalies, cost exports | ✓ | ✓ | – |
| Synchronise cloud accounts | ✓ | ✓ | – |
| Add / edit / remove cloud accounts & resources | ✓ | – | – |
| Create / edit alert rules, delete alerts | ✓ | – | – |
| Manage users, system status | ✓ | – | – |

Enforced on the API by `authorize(...)` middleware and mirrored in the UI. Self-registered users start as **Viewer**.

---

## API documentation

All endpoints are under `/api`. Responses use one envelope:

```json
{ "success": true, "data": {}, "message": "Request successful", "meta": { "page": 1, "limit": 20, "total": 52, "totalPages": 3 } }
{ "success": false, "message": "Resource not found", "errors": [{ "field": "email", "message": "Enter a valid email address" }] }
```

Authentication uses the HTTP-only `cp_token` cookie set by `/auth/login` (a `Authorization: Bearer <jwt>` header also works for API clients). 🔒 = authenticated, roles in brackets.

### Auth
| Method | Path | Description |
|---|---|---|
| POST | `/auth/register` | Create a Viewer account `{ name, email, password }` |
| POST | `/auth/login` | Sign in `{ email, password, remember? }` → sets cookie |
| POST | `/auth/logout` | Clear session |
| GET | `/auth/me` 🔒 | Current user |
| PUT | `/auth/me` 🔒 | Update profile / preferences |
| PUT | `/auth/password` 🔒 | Change password `{ currentPassword, newPassword }` |
| POST | `/auth/forgot-password` | Issue a 30-minute reset token |
| POST | `/auth/reset-password` | `{ token, password }` |

### Dashboard & monitoring 🔒
| Method | Path | Query | Description |
|---|---|---|---|
| GET | `/dashboard/summary` | `environment` | KPIs, health score, provider health, recent alerts |
| GET | `/dashboard/metrics` | `range=1h\|6h\|24h\|7d\|30d`, `environment` | Fleet timeline, cost by provider, daily cost |
| GET | `/dashboard/insights` | `environment` | Insights, utilisation buckets, recommendations |
| GET | `/monitoring/compute` | `range`, `environment`, `provider` | Compute overview |
| GET | `/monitoring/storage` | `environment`, `provider` | Storage overview |
| GET | `/monitoring/network` | `range`, `environment`, `provider` | Network overview |
| GET | `/service-health` | – | Service checks with history |
| GET | `/health` | – | Public liveness/readiness (Mongo + Redis) |

### Cloud accounts 🔒
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/cloud-accounts` | all | Accounts with resource count, health, 30-day cost |
| GET | `/cloud-accounts/providers` | all | One summary per provider |
| POST | `/cloud-accounts/validate` | admin | Validate credentials (nothing stored) |
| POST | `/cloud-accounts` | admin | Validate, create and synchronise an account |
| GET | `/cloud-accounts/:id` | all | Account detail |
| PUT | `/cloud-accounts/:id` | admin | `{ accountName?, environment?, status? }` |
| DELETE | `/cloud-accounts/:id` | admin | Remove account and its data |
| POST | `/cloud-accounts/:id/sync` | admin, operator | Re-discover resources and billing |

### Resources 🔒
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/resources` | all | `page, limit, search, provider, status, type, region, environment, sort, order` (comma-separated multi-values) |
| POST | `/resources` | admin | Register a resource manually |
| GET | `/resources/:id` | all | Resource + its alerts (`:id` = Mongo id or provider resource id) |
| PUT | `/resources/:id` | admin | Update inventory fields |
| DELETE | `/resources/:id` | admin | Stop monitoring a resource |
| GET | `/resources/:id/metrics` | all | `range` → bucketed series + avg/min/max summary |

### Alerts & rules 🔒
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/alerts` | all | `status=active\|open\|acknowledged\|resolved\|all, severity, provider, type, search, page, limit` + counts |
| POST | `/alerts` | admin, operator | Create a manual alert |
| PUT | `/alerts/:id` | admin, operator | Update title / description / severity / status |
| DELETE | `/alerts/:id` | admin | Delete |
| POST | `/alerts/:id/acknowledge` | admin, operator | Acknowledge |
| POST | `/alerts/:id/resolve` | admin, operator | Resolve |
| GET | `/alert-rules` | all | List rules |
| POST | `/alert-rules` | admin | `{ name, metric, operator, threshold, duration, severity, enabled }` |
| PUT | `/alert-rules/:id` | admin | Update |
| DELETE | `/alert-rules/:id` | admin | Delete |

### Costs 🔒 (admin, operator)
| Method | Path | Query | Description |
|---|---|---|---|
| GET | `/costs` | `provider, service, region, from, to, page, limit` | Daily billing records |
| GET | `/costs/summary` | – | MTD, previous month, forecast, daily, 30-day, monthly & daily trends |
| GET | `/costs/by-provider` | `days` | Breakdown with change vs previous period |
| GET | `/costs/by-service` | `days, provider` | Breakdown by service |
| GET | `/costs/by-region` | `days, provider` | Breakdown by region |
| GET | `/costs/anomalies` | `threshold` (default 20) | Detected anomalies |

### Other 🔒
| Method | Path | Roles | Description |
|---|---|---|---|
| GET | `/notifications` | all | Latest notifications + unread count |
| POST | `/notifications/:id/read` | all | Mark one read |
| POST | `/notifications/read-all` | all | Mark all read |
| GET | `/search?q=` | all | Global search |
| GET | `/reports/:type` | all (costs/summary: admin, operator) | `resources`, `alerts`, `costs`, `service-health` (CSV), `summary` (JSON) |
| GET/POST/PUT/DELETE | `/users[/:id]` | admin | User management |
| GET | `/system/status` | admin | DB/cache status, cache hit rate, loop status, counts |
| POST | `/system/monitoring/run` | admin | Run a monitoring cycle now |

Example:

```bash
curl -c jar -H 'Content-Type: application/json' \
  -d '{"email":"admin@cloudpulse.com","password":"Admin@123"}' http://localhost:5000/api/auth/login
curl -b jar 'http://localhost:5000/api/resources?provider=aws&status=critical&sort=cpu&order=desc'
```

---

## Data model

| Collection | Key fields | Indexes |
|---|---|---|
| `users` | name, email, password (bcrypt), role, avatar, preferences | email (unique), role |
| `cloudaccounts` | provider, accountName, accountId, status, regions, environment, lastSync | provider + accountId (unique), provider, status |
| `resources` | name, resourceId, provider, cloudAccountId, type, service, sku, region, environment, status, state, cpu, memory, network, storage, cost, tags | resourceId (unique), provider, status, region, type, environment, provider+status+type, text |
| `metrics` | resourceId, timestamp, cpu, memory, networkIn, networkOut, diskUsage, requestCount, errorRate | resourceId+timestamp, timestamp, TTL 35 days |
| `alerts` | title, description, type, resourceId, provider, severity, status, rule, createdAt, resolvedAt | status, severity, createdAt, resourceId+rule+status |
| `costrecords` | provider, service, region, amount, currency, date, resourceId, cloudAccountId | provider, service, date, provider+service+date |
| `alertrules` | name, metric, operator, threshold, duration, severity, enabled | enabled |
| `servicehealths` | name, category, status, uptime, responseTime, errorRate, history | name (unique), status |
| `notifications` | type, title, message, severity, link, readBy | createdAt, TTL 30 days |

---

## Redis caching

Read-through cache (`services/redisService.ts`) with per-namespace TTLs and SCAN-based invalidation after writes and after every monitoring cycle. If Redis is unavailable the API keeps serving from MongoDB and reconnects automatically.

| Data | Namespace | TTL |
|---|---|---|
| Dashboard summary / metrics / insights | `dashboard` | 30 s |
| Resource lists & resource metrics, compute/storage/network views | `resources`, `monitoring` | 15 s |
| Service health | `service-health` | 10 s |
| Providers & accounts | `providers` | 30 s |
| Costs & anomalies | `costs` | 60 s |

---

## Project structure

```
cloudpulse/
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   └── src/
│       ├── server.ts · app.ts
│       ├── config/        database.ts · redis.ts · env.ts
│       ├── controllers/   auth · cloud · resource · alert · cost · dashboard · system · report
│       ├── middleware/    authMiddleware · roleMiddleware · errorMiddleware · validate
│       ├── models/        User · CloudAccount · Resource · Metric · Alert · CostRecord · AlertRule · ServiceHealth · Notification
│       ├── routes/        auth · cloud · resource · alert · cost · dashboard · system
│       ├── services/      cloud · monitoring · cost · alert · redis · notification · seed · resourceHealth · timeRange
│       ├── providers/     CloudProvider (interface) · LiveProviders · index (factory)
│       ├── mock/          mockCloudProvider · mockMetrics · mockCosts · random
│       ├── scripts/       seed.ts
│       └── utils/         jwt · logger · http
└── frontend/
    ├── Dockerfile · nginx.conf
    └── src/
        ├── App.tsx · main.tsx
        ├── components/    Navbar · Sidebar · MetricCard · StatusBadge · ResourceTable · AlertCard · CostChart · MetricChart
        │                  ProviderCard · LoadingSpinner · EmptyState · Modal · AddProviderWizard · GlobalSearch · NotificationCenter …
        ├── pages/         Login · Register · ForgotPassword · ResetPassword · Dashboard · CloudProviders · Accounts · Resources
        │                  ResourceDetails · Compute · Storage · Network · ServiceHealth · Costs · CostAnalysis · Anomalies
        │                  Alerts · AlertRules · Settings · Users
        ├── services/      api · authService · cloudService · resourceService · alertService · costService · dashboardService
        ├── hooks/         useAuth · useFetch · useMetrics · useDebounce · usePreferences
        ├── context/       AuthContext · PreferencesContext · ToastContext
        ├── layouts/       DashboardLayout · AuthLayout
        ├── types/         auth · cloud · resource · alert · metrics · cost · common
        ├── utils/         formatters · constants
        └── styles/        index.css (design tokens, light & dark themes)
```

---

## Screenshots

Add screenshots to `docs/screenshots/` and reference them here:

| | |
|---|---|
| Overview dashboard | `docs/screenshots/dashboard.png` |
| Resources | `docs/screenshots/resources.png` |
| Resource details | `docs/screenshots/resource-details.png` |
| Cost overview | `docs/screenshots/costs.png` |
| Alerts | `docs/screenshots/alerts.png` |
| Add provider wizard | `docs/screenshots/add-provider.png` |

---

## Security

- Passwords hashed with bcrypt (cost 12); generic login errors to prevent account enumeration
- JWT in an HTTP-only, SameSite=Lax cookie (Secure in production); no tokens in `localStorage`
- Role-based authorisation on every mutating route
- Input validation with zod on all request bodies; Mongo cast/duplicate errors mapped to 4xx
- helmet security headers, strict CORS allow-list, request-size limit, rate limiting (stricter on auth routes)
- Cloud credentials are only used transiently to validate a connection and are never stored or returned
- CSV exports are protected against formula injection
- No secrets in source: configuration via environment variables; `.env` is git-ignored

---

## Future enhancements

- Live AWS / Azure / GCP adapters (CloudWatch & Cost Explorer, Azure Monitor & Cost Management, Cloud Monitoring & BigQuery billing export), secrets-manager credential storage
- WebSocket / SSE push for live metrics and alerts instead of polling
- Alert notification channels (email, Slack, PagerDuty, webhooks) and on-call escalation policies
- Budgets with forecast-based alerts, reserved-instance / savings-plan coverage, tag-based cost allocation
- Kubernetes workload-level monitoring and custom dashboards
- SSO (OIDC/SAML), MFA and audit logs
- Time-series collections / downsampling for long retention; horizontal scaling of the monitoring loop with a job queue
- Automated test suites (API integration tests, component tests, Playwright E2E) in CI

---

## License

MIT
