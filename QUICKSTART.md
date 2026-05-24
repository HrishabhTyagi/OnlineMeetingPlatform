# Samvaad Quickstart

This guide starts the full local Samvaad system: infrastructure, backend services, the main user app, and the admin app.

## Prerequisites

- .NET 8 SDK
- Node.js and npm
- Docker Desktop
- PowerShell

The current local setup has been verified with:

- .NET SDK 10.0.203 running .NET 8 projects
- Node.js v24.15.0
- npm 11.12.1
- PowerShell 5.1

## 1. Start Local Infrastructure

From the repository root:

```powershell
cd D:\Projects\OnlineMeetingPlatform
docker-compose up -d
docker-compose ps
```

Docker Compose starts:

| Container | Port | Purpose |
| --- | ---: | --- |
| `meeting_postgres` | 5432 | PostgreSQL databases |
| `meeting_redis` | 6379 | Redis |
| `meeting_rabbitmq` | 5672, 15672 | RabbitMQ event bus and management UI |
| `meeting_mailpit` | 1025, 8025 | SMTP test inbox |

Open Mailpit at http://localhost:8025 to inspect local emails.
Open RabbitMQ Management at http://localhost:15672 with `samvaad` / `samvaad123` to inspect exchanges, quorum queues, and dead-letter queues.
Meeting Service stores outgoing integration events in `IntegrationEventOutboxMessages`; if RabbitMQ or a consumer queue is unavailable, the dispatcher retries instead of losing the event.
Meeting and Notification services also store processed-event checkpoints to avoid duplicate work after RabbitMQ redelivery.

## 2. Start All Local Apps

The recommended path is the service launcher:

```powershell
.\run-all-services.ps1
```

The launcher closes existing local app processes on the expected ports, checks Docker Compose containers, then starts:

- User Service on http://localhost:5001
- Meeting Service on http://localhost:5002
- Notification Service on http://localhost:5003
- Organization Service on http://localhost:5004
- API Gateway on http://localhost:5000
- Samvaad app on http://localhost:5173
- Samvaad Admin on http://localhost:5174

## 3. Manual Startup Alternative

Use this only when you want to debug a single service directly.

```powershell
cd D:\Projects\OnlineMeetingPlatform\src\Services\UserService
dotnet run
```

```powershell
cd D:\Projects\OnlineMeetingPlatform\src\Services\MeetingService
dotnet run
```

```powershell
cd D:\Projects\OnlineMeetingPlatform\src\Services\NotificationService
dotnet run
```

```powershell
cd D:\Projects\OnlineMeetingPlatform\src\Services\OrganizationService
dotnet run
```

```powershell
cd D:\Projects\OnlineMeetingPlatform\src\Gateway\ApiGateway
dotnet run
```

```powershell
cd D:\Projects\OnlineMeetingPlatform\src\Frontend\meeting-app
npm install
npm run dev
```

```powershell
cd D:\Projects\OnlineMeetingPlatform\src\Frontend\organization-admin
npm install
npm run dev
```

## 4. Open The Apps

- Samvaad user app: http://localhost:5173
- Personal dashboard: http://localhost:5173/personal/dashboard
- Personal chat: http://localhost:5173/personal/chat
- Personal meet page: http://localhost:5173/personal/meet
- Organization workspace: `http://localhost:5173/org/{organizationSlug}/dashboard`
- Samvaad Admin: http://localhost:5174
- Gateway Swagger: http://localhost:5000/swagger
- Mailpit: http://localhost:8025
- RabbitMQ Management: http://localhost:15672

## 5. Create Or Use Test Accounts

Register from the UI or call the API:

```powershell
Invoke-RestMethod `
  -Method Post `
  -Uri http://localhost:5000/api/auth/register `
  -ContentType application/json `
  -Body '{
    "email": "owner@samvaad.test",
    "firstName": "Asha",
    "lastName": "Mehta",
    "password": "Password123!"
  }'
```

Recent local smoke users:

- `smoke.owner.20260521010138@samvaad.test`
- `smoke.alex.20260521010138@samvaad.test`
- `smoke.casey.20260521010138@samvaad.test`
- Password: `Password123!`

## 6. Common Local Flows To Verify

1. Register two users.
2. Start a direct chat.
3. Send a multi-line/code message.
4. Upload or paste an image/file into chat.
5. Create a task from a message.
6. Schedule a meeting from the calendar.
7. Accept or decline the invite from another account.
8. Join the meeting in two browser tabs.
9. Start video, mute/unmute, share screen, raise hand, send reaction.
10. Call an available user directly from the ongoing meeting.
11. Cancel an accidental call and confirm the apology message.
12. Start and stop recording, then confirm the recording link persists.
13. Check email output in Mailpit.

## 7. Run Tests

Run all server, client, functional, and infrastructure tests:

```powershell
.\run-all-tests.ps1
```

Useful options:

```powershell
.\run-all-tests.ps1 -SkipFunctional
.\run-all-tests.ps1 -InstallClientDependencies
.\run-all-tests.ps1 -InstallPlaywrightBrowsers
```

## 8. Troubleshooting

### API returns 401 for valid login token

Make sure all services use the same development JWT secret and have been restarted. The local development secret is shared across services in `appsettings.Development.json`.

### API returns 500 for meeting calls

Make sure the latest Meeting Service migrations, including `20260520103000_MeetingCallLogs`, `20260524010000_IntegrationEventOutbox`, and `20260524013000_IntegrationEventConsumerCheckpoints`, have been applied to `meeting_meetings`.

```powershell
dotnet ef database update `
  --project .\src\Services\MeetingService\MeetingService.csproj `
  --startup-project .\src\Services\MeetingService\MeetingService.csproj
```

### Frontend cannot find `react-refresh`

Install client dependencies in both frontend apps:

```powershell
cd src\Frontend\meeting-app
npm install

cd ..\organization-admin
npm install
```

### Email is not received

Local email is sent to Mailpit, not a real inbox. Open http://localhost:8025.

If an email-producing event is stuck, open RabbitMQ Management and also check the `IntegrationEventOutboxMessages` table for rows with `FailedAtUtc`, `LastError`, or a future `AvailableAtUtc`.

You can also call `GET http://localhost:5000/api/messaging/outbox/summary` with a signed-in user's bearer token to see outbox health, and `POST /api/messaging/outbox/{id}/retry` to requeue a failed event.

### Ports are already in use

Use the launcher, which closes known app processes first:

```powershell
.\run-all-services.ps1
```

### Stop everything

Stop app processes with Ctrl+C if you started them manually, then:

```powershell
docker-compose down
```
