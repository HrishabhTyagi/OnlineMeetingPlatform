# Samvaad File Inventory

Root: `D:\Projects\OnlineMeetingPlatform`

## Root Files

| Path | Purpose |
| --- | --- |
| `README.md` | Main product and developer overview |
| `QUICKSTART.md` | Local setup and troubleshooting |
| `ARCHITECTURE.md` | Service and data architecture |
| `DEPLOYMENT.md` | Deployment and production guidance |
| `PROJECT_SUMMARY.md` | Current feature/status summary |
| `COMPLETION_REPORT.md` | Implemented feature report |
| `FILE_INVENTORY.md` | This file inventory |
| `docker-compose.yml` | Local PostgreSQL, Redis, RabbitMQ, and Mailpit |
| `init-db.sql` | Local database creation script |
| `Dockerfile.multi` | Multi-stage build reference |
| `nginx.conf` | Nginx reference config |
| `run-all-services.ps1` | Local service launcher |
| `run-all-tests.ps1` | Complete test runner |

## Source Layout

```text
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
```

## Gateway

### `src/Gateway/ApiGateway`

| File | Purpose |
| --- | --- |
| `ApiGateway.csproj` | Gateway project |
| `Program.cs` | YARP, Swagger, CORS, security setup |
| `appsettings.json` | Routes and clusters |

Gateway routes include:

- User and auth APIs.
- Meeting APIs.
- Conversation APIs.
- Calendar connection APIs.
- Team space APIs.
- License request APIs.
- Organization APIs.
- User avatar files.
- SignalR hubs.
- Service Swagger JSON routes.

## Backend Services

### `src/Services/UserService`

Purpose: identity, users, profile, avatar, and presence.

Important files/folders:

| Path | Purpose |
| --- | --- |
| `Program.cs` | Startup, JWT validation, CORS, rate limiting, static avatar files |
| `Controllers/AuthController.cs` | Register and login |
| `Controllers/UsersController.cs` | Search, profile, avatar, status |
| `Services/AuthService.cs` | JWT and password hashing |
| `Services/UserService.cs` | User persistence logic |
| `Models/User.cs` | User entity and presence constants |
| `Models/DTOs.cs` | Request/response models |
| `Data/UserDbContext.cs` | EF Core context |
| `Data/Migrations/` | User database migrations |
| `appsettings.json` | Production/default config |
| `appsettings.Development.json` | Local development config |

### `src/Services/MeetingService`

Purpose: meetings, chat, calls, tasks, files, recordings, calendar, teams, license requests, and storage.

Important files/folders:

| Path | Purpose |
| --- | --- |
| `Program.cs` | Startup, JWT validation, EF migrations, CORS, hosted workers |
| `Controllers/MeetingsController.cs` | Meetings, invites, calls, recordings, exports |
| `Controllers/ParticipantsController.cs` | Join/leave, roles, hand, reaction, media state |
| `Controllers/ChatController.cs` | Meeting chat |
| `Controllers/ConversationsController.cs` | Direct/group chat, messages, attachments, tasks |
| `Controllers/CalendarConnectionsController.cs` | Google/Outlook calendar connection endpoints |
| `Controllers/TeamSpacesController.cs` | Team spaces, channels, tabs |
| `Controllers/LicenseRequestsController.cs` | License purchase/request flow |
| `Controllers/LobbyController.cs` | Lobby requests |
| `Controllers/MessagingController.cs` | Outbox health, failed event listing, and retry API |
| `Services/MeetingService.cs` | Main business logic |
| `Services/TeamSpaceService.cs` | Team/channel logic |
| `Services/OrganizationStorageService.cs` | Organization-aware file storage |
| `Services/ExternalCalendarSyncService.cs` | Calendar sync adapters |
| `Services/EfIntegrationEventOutbox.cs` | Writes RabbitMQ integration events into the Meeting database transaction |
| `Services/EfIntegrationEventConsumerCheckpointStore.cs` | Prevents duplicate email side effects after RabbitMQ redelivery |
| `Services/IntegrationEventOutboxDispatcher.cs` | Publishes pending outbox events to RabbitMQ with retry/backoff |
| `Services/IntegrationEventOutboxOptions.cs` | Outbox batching, locking, and retry settings |
| `Services/ScheduledConversationMessageDispatcher.cs` | Scheduled message worker |
| `Services/OrganizationStorageRetentionWorker.cs` | Retention worker |
| `Models/Meeting.cs` | Core entity model |
| `Models/DTOs.cs` | Request/response DTOs |
| `Data/MeetingDbContext.cs` | EF Core context |
| `Data/Migrations/20260520103000_MeetingCallLogs.cs` | Call log migration |
| `Data/Migrations/20260524010000_IntegrationEventOutbox.cs` | Transactional integration event outbox migration |
| `Data/Migrations/20260524013000_IntegrationEventConsumerCheckpoints.cs` | Consumer idempotency checkpoint migration |
| `appsettings.json` | Production/default config |
| `appsettings.Development.json` | Local development config |

### `src/Services/NotificationService`

Purpose: realtime notifications and WebRTC signaling.

Important files/folders:

| Path | Purpose |
| --- | --- |
| `Program.cs` | Startup, JWT validation, CORS, SignalR |
| `Data/NotificationDbContext.cs` | EF Core context for notification consumer checkpoints |
| `Data/Migrations/20260524014500_ProcessedNotificationEvents.cs` | Notification consumer idempotency migration |
| `Consumers/RabbitNotificationConsumers.cs` | RabbitMQ event consumers for realtime notifications |
| `Hubs/NotificationHub.cs` | Notification and signaling hub |
| `Models/Notification.cs` | Notification models |
| `Models/ProcessedNotificationEvent.cs` | Processed event checkpoint entity |
| `Services/EfNotificationEventCheckpointStore.cs` | Persistent event de-duplication |
| `Services/InMemoryNotificationEventCheckpointStore.cs` | Development fallback when no DB connection is configured |
| `NotificationService.csproj` | Service project |
| `appsettings.json` | Service configuration |

### `src/Services/OrganizationService`

Purpose: organization tenant records, members, storage configuration, usage, audit, and local hosting metadata.

Important files/folders:

| Path | Purpose |
| --- | --- |
| `Program.cs` | Startup, JWT validation, EF migrations, CORS |
| `Controllers/OrganizationsController.cs` | Organization CRUD/config/usage/audit/member APIs |
| `Data/OrganizationDbContext.cs` | EF Core context |
| `Models/Organization.cs` | Organization and member entities |
| `Models/DTOs.cs` | Request/response DTOs |
| `OrganizationService.csproj` | Service project |
| `appsettings.json` | Service configuration |

## Shared Libraries

### `src/Shared/Samvaad.Common`

Purpose: shared RabbitMQ event contracts and event bus infrastructure.

Important files/folders:

| Path | Purpose |
| --- | --- |
| `Events/ConversationEvents.cs` | Conversation, document, and task integration events |
| `Events/MeetingEvents.cs` | Meeting invite, call, and recording integration events |
| `Events/LicenseEvents.cs` | License request integration event |
| `Messaging/IEventBus.cs` | Shared event bus abstraction |
| `Messaging/IEventHandler.cs` | Shared typed event handler abstraction |
| `Messaging/RabbitEventAttribute.cs` | Attribute wrapper for routing keys and optional queue metadata |
| `Messaging/RabbitMqEventBus.cs` | RabbitMQ publisher with confirms and routable-message validation |
| `Messaging/RabbitMqConsumerHostedService.cs` | Durable consumer/queue setup with manual acknowledgements |

## Frontend Apps

### `src/Frontend/meeting-app`

Purpose: main Samvaad collaboration app.

Important files/folders:

| Path | Purpose |
| --- | --- |
| `src/App.tsx` | Application routes |
| `src/components/AppShell.tsx` | Main shell and navigation |
| `src/components/PersonalScope.tsx` | Personal workspace route scope |
| `src/components/OrganizationScope.tsx` | Organization workspace route scope |
| `src/components/IncomingCallRinger.tsx` | Incoming call UI |
| `src/components/ThemeProvider.tsx` | Theme selection |
| `src/pages/Activity.tsx` | Activity/workspace overview |
| `src/pages/Chat.tsx` | Chat, files, tasks, calls, message actions |
| `src/pages/Calls.tsx` | Call history and actions |
| `src/pages/CreateMeeting.tsx` | Meeting scheduling |
| `src/pages/Dashboard.tsx` | Calendar dashboard |
| `src/pages/MeetingRoom.tsx` | Meeting/call room |
| `src/pages/Login.tsx` | Sign in |
| `src/pages/Register.tsx` | Register |
| `src/services/api.ts` | API client and workspace helpers |
| `src/services/signalR.ts` | SignalR client |
| `src/services/activityFeed.ts` | Activity aggregation |
| `src/store/authStore.ts` | Multi-account auth store |
| `src/setupTests.ts` | Vitest setup |
| `e2e/` | Playwright functional tests |
| `playwright.config.ts` | Playwright config |
| `package.json` | Client dependencies and scripts |

Scripts:

- `npm run dev`
- `npm run build`
- `npm test`
- `npm run test:functional`

### `src/Frontend/organization-admin`

Purpose: product-owner organization admin app.

Important files/folders:

| Path | Purpose |
| --- | --- |
| `src/main.tsx` | Admin app entry and UI |
| `src/main.test.ts` | Admin tests |
| `package.json` | Admin dependencies and scripts |
| `vite.config.ts` | Vite config |

Scripts:

- `npm run dev`
- `npm run build`
- `npm test`

## Tests

```text
tests/
  Server/
    Infrastructure.Tests/
    MeetingService.Tests/
    NotificationService.Tests/
    OrganizationService.Tests/
    UserService.Tests/
  TEST_CASES.md
```

`run-all-tests.ps1` runs all server, client, functional, and infrastructure suites and writes reports to:

```text
artifacts/test-reports/{timestamp}/
```

## Generated Or Local-Only Folders

These are created by local runs and are not source documentation:

- `artifacts/`
- `src/Frontend/meeting-app/test-results/`
- service log files such as `.codex-*.log`
- frontend `node_modules/`
- service `bin/` and `obj/`

## Development Ports

| Component | Port |
| --- | ---: |
| API Gateway | 5000 |
| User Service | 5001 |
| Meeting Service | 5002 |
| Notification Service | 5003 |
| Organization Service | 5004 |
| Samvaad app | 5173 |
| Samvaad Admin | 5174 |
| PostgreSQL | 5432 |
| Redis | 6379 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ UI | 15672 |
| Mailpit SMTP | 1025 |
| Mailpit UI | 8025 |
