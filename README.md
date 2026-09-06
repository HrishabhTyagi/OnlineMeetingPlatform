# Samvaad

Samvaad is a Microsoft Teams-style collaboration and meeting platform for both individual users and organizations. It includes chat, meetings, calls, calendar scheduling, file sharing, recordings, tasks, organization workspaces, and a separate owner/admin console for SaaS configuration.

The project is built as ASP.NET Core microservices behind a YARP API Gateway, with React/Vite frontends and local Docker infrastructure for PostgreSQL, Redis, RabbitMQ, and Mailpit. Azure is the selected production deployment target.

## Current Capabilities

- Personal and organization-scoped workspaces.
- Organization URLs such as `/org/{organizationSlug}/dashboard`.
- Separate Samvaad Admin app for product-owner organization configuration.
- User registration, login, profile updates, avatar upload, multiple signed-in accounts, and presence status.
- Presence states: Available, Busy, Do not disturb, Be right back, Away, Offline, In meeting, In call, and Presenting.
- Dashboard calendar with work-week, full-week, and month views.
- Calendar event cards for upcoming, ongoing, completed, and cancelled meetings.
- Meeting scheduling from the calendar grid with overlap prevention and past-slot blocking.
- Meeting invite responses: Accepted, Declined, Tentative, plus participant reason visible to organizer.
- Google and Outlook calendar connection endpoints and sync adapters.
- Direct and group chats.
- Message formatting with preserved line breaks and code blocks.
- Message edit, delete, pin, important marker, reactions, scheduled messages, unread counts, and filters.
- Chat attachments with drag/drop, pasted screenshot preview, document sharing, document preview, and share-via-email history.
- Chat tasks created from comments, with status, priority, assignee, notes, history, filters, and source-message link.
- Meeting room with audio/video controls, WebRTC signaling, screen sharing, recording upload, chat, participants panel, raised hands, reactions, presenter status, whiteboard data, and exports.
- Direct in-meeting calls to available users, incoming call ringer, accept/decline/no-response/cancel states, missed-call history, and accidental-call cancellation message.
- License purchase/request page with simulated payment and email notification.
- Configurable organization storage, retention, guest access, meeting defaults, usage metrics, audit logs, and local tenant hosting actions.
- API Gateway Swagger aggregation for service APIs.
- Full local test runner for server, client, functional, and infrastructure checks.

## Technology Stack

### Backend

- ASP.NET Core 8
- Entity Framework Core
- PostgreSQL
- RabbitMQ event bus with transactional outbox publishing
- SignalR
- YARP API Gateway
- JWT bearer authentication
- BCrypt password hashing
- Serilog logging

### Frontend

- React 18
- TypeScript
- Vite
- Tailwind CSS
- React Router
- TanStack Query
- Zustand
- Axios
- SignalR client
- Vitest and Playwright

### Local Infrastructure

- Docker Compose
- PostgreSQL 15
- Redis 7
- RabbitMQ 3.13 with management UI
- Mailpit SMTP/web inbox

RabbitMQ publishing from Meeting Service is backed by the `IntegrationEventOutboxMessages` table. Business changes and integration events are saved together, then a dispatcher publishes with publisher confirms, strict routable-message checks, retries, locks, and dead-letter handling. Meeting and Notification consumers also persist processed-event checkpoints to avoid duplicate email or realtime notification side effects after RabbitMQ redelivery.

### Selected Production Platform

- Azure Container Apps or Azure App Service for the API Gateway and backend services
- Azure Static Web Apps or static App Service hosting for the frontends
- Azure Database for PostgreSQL Flexible Server
- Azure Blob Storage
- Azure Key Vault
- Azure Monitor and Application Insights
- Azure Communication Services Email or SMTP provider

## Services And Ports

| Component | Port | Purpose |
| --- | ---: | --- |
| API Gateway | 5000 | YARP routing, Swagger aggregation, security headers |
| User Service | 5001 | Auth, profile, avatars, presence |
| Meeting Service | 5002 | Meetings, calendar, chats, calls, tasks, files, recordings |
| Notification Service | 5003 | RabbitMQ consumers, SignalR notifications, idempotency checkpoints, and WebRTC signaling |
| Organization Service | 5004 | Organizations, tenants, storage config, audit, usage |
| Samvaad app | 5173 | Main user application |
| Samvaad Admin | 5174 | Product-owner organization/admin console |
| PostgreSQL | 5432 | Local databases |
| Redis | 6379 | Cache/session infrastructure |
| RabbitMQ AMQP | 5672 | Durable async event bus |
| RabbitMQ UI | 15672 | Local event bus management |
| Mailpit SMTP | 1025 | Local SMTP testing |
| Mailpit UI | 8025 | Local email inbox |

## Project Layout

```text
OnlineMeetingPlatform/
  src/
    Gateway/
      ApiGateway/
    Services/
      UserService/
      MeetingService/
      NotificationService/
      OrganizationService/
    Shared/
      Samvaad.Common/
    Frontend/
      meeting-app/
      organization-admin/
  tests/
    Server/
      Infrastructure.Tests/
      MeetingService.Tests/
      NotificationService.Tests/
      OrganizationService.Tests/
      UserService.Tests/
    TEST_CASES.md
  docker-compose.yml
  init-db.sql
  run-all-services.ps1
  run-all-tests.ps1
```

## Quick Start

From the repository root:

```powershell
docker-compose up -d
.\run-all-services.ps1
```

Then open:

- Main app: http://localhost:5173
- Admin app: http://localhost:5174
- API Gateway Swagger: http://localhost:5000/swagger
- Mailpit: http://localhost:8025

If you prefer manual startup, see [QUICKSTART.md](QUICKSTART.md).

## Local Meeting Intelligence

Meeting recordings can be transcribed locally and turned into a recap and action items without a paid API. The `meeting-intelligence` worker uses FFmpeg, faster-whisper, and an Ollama model; it consumes the existing `meeting.recording.ready` RabbitMQ event after a recording is uploaded.

Start the local dependencies and download the model once:

```powershell
docker compose up -d postgres redis rabbitmq mailpit ollama
docker compose exec ollama ollama pull qwen2.5:3b
docker compose up -d --build meeting-intelligence
```

Then start the ASP.NET services with `run-all-services.ps1`. For a meeting, enable both recording and transcription before recording. Once the recording has uploaded, the worker stores the timestamped transcript, generated recap, and action items. Participants receive a realtime notification and see the output in the meeting room's Details panel.

The default worker setup is CPU-only and suitable for local development. Its configuration is in [docker-compose.yml](docker-compose.yml); use a smaller Ollama model or a CUDA-capable worker deployment if processing time becomes a concern. Docker Desktop must be running on Windows because the worker reaches the locally started Meeting Service through `host.docker.internal`.

## Testing

Run everything with:

```powershell
.\run-all-tests.ps1
```

The runner covers:

- Server unit and integration tests.
- Infrastructure and assembly checks.
- Meeting app unit tests.
- Organization admin unit tests.
- Meeting app Playwright functional tests.

Latest verified run:

- Date: 2026-05-21
- Suites: 8 passed, 0 failed
- Report: `artifacts/test-reports/20260521-011036/summary.md`

## Local Smoke Users

Recent smoke users created during verification:

- `smoke.owner.20260521010138@samvaad.test`
- `smoke.alex.20260521010138@samvaad.test`
- `smoke.casey.20260521010138@samvaad.test`
- Password: `Password123!`

These are local development records only.

## Documentation

- [QUICKSTART.md](QUICKSTART.md): local setup and daily commands.
- [ARCHITECTURE.md](ARCHITECTURE.md): services, data ownership, and flows.
- [DEPLOYMENT.md](DEPLOYMENT.md): Azure deployment plan and production checklist.
- [PROJECT_SUMMARY.md](PROJECT_SUMMARY.md): current product status.
- [COMPLETION_REPORT.md](COMPLETION_REPORT.md): implemented feature report.
- [FILE_INVENTORY.md](FILE_INVENTORY.md): file and folder reference.
- [tests/TEST_CASES.md](tests/TEST_CASES.md): test coverage matrix.

## Security Notes

- Development uses shared local JWT and internal API keys in appsettings files. Replace every secret for production.
- Production should set explicit CORS origins, HTTPS, secure database credentials, storage credentials, SMTP credentials, and monitoring.
- The application now rejects placeholder production secrets and adds baseline security headers.
- Do not expose Mailpit, local database ports, or development Swagger in public environments.

## GitHub Remote

The project has been pushed before to:

```text
https://github.com/HrishabhTyagi/OnlineMeetingPlatform.git
```

Only push when the owner explicitly asks.
