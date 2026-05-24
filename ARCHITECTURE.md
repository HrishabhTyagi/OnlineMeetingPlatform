# Samvaad Architecture

Samvaad uses a microservice architecture with a YARP API Gateway, independent ASP.NET Core services, PostgreSQL databases, RabbitMQ async events, SignalR realtime messaging, and React frontends. Azure is the selected production platform.

## High-Level Topology

```text
Browser
  |
  | HTTP, WebSocket, WebRTC media/signaling
  v
Samvaad app (5173)        Samvaad Admin (5174)
  |                         |
  +-----------+-------------+
              |
              v
        API Gateway (5000)
              |
   +----------+----------+----------+----------+
   |          |          |          |          |
   v          v          v          v          v
User      Meeting    Notification Organization Swagger aggregation
Service   Service    Service      Service
5001      5002       5003         5004
   |          |          |          |
   +----------+----------+----------+
              |
              v
PostgreSQL, Redis, RabbitMQ, Mailpit
```

## Service Ownership

### API Gateway

Location: `src/Gateway/ApiGateway`

Responsibilities:

- Reverse proxy routing with YARP.
- Aggregated Swagger entries for User, Meeting, Notification, and Organization services.
- CORS and security header handling.
- Routes for REST APIs, static avatar files, and SignalR hubs.

Key routes:

- `/api/auth/**` and `/api/users/**` to User Service.
- `/api/meetings/**`, `/api/conversations/**`, `/api/team-spaces/**`, `/api/calendar-connections/**`, and `/api/license-requests/**` to Meeting Service.
- `/api/messaging/**` to Meeting Service for RabbitMQ outbox monitoring and retry operations.
- `/api/organizations/**` to Organization Service.
- `/hubs/**` to Notification Service.

### User Service

Location: `src/Services/UserService`

Responsibilities:

- Register and login users.
- Hash and verify passwords.
- Issue JWT tokens with shared local key metadata.
- Manage profile, avatar, and user search.
- Store and update user presence/status.
- Rate-limit auth endpoints.

Database: `meeting_users`

Main entities:

- `User`

### Meeting Service

Location: `src/Services/MeetingService`

Responsibilities:

- Meeting scheduling, update, cancellation, end, and participant join/leave.
- Calendar overlap prevention and calendar display data.
- Meeting invite emails and response status/reason.
- Transactional RabbitMQ outbox publishing for invite emails, chat notifications, call notifications, task assignment, recording-ready notifications, document-share emails, and license requests.
- Direct and group conversations.
- Chat messages, formatting, edit, delete, pin, important flag, reactions, unread markers, scheduled messages.
- Attachments, document previews, share-via-email history.
- Tasks created from chat comments with notes and activity history.
- Meeting chat, recordings, whiteboard data, exports, lobby, raised hand, reactions, participant roles.
- In-meeting direct calls and call history.
- Team spaces, channels, tabs, and channel meetings.
- License purchase/request email flow.
- Google and Outlook calendar connection/sync adapter endpoints.
- Organization-aware storage paths and retention worker.

Database: `meeting_meetings`

Main entities:

- `Meeting`
- `Participant`
- `MeetingInvite`
- `MeetingChatMessage`
- `MeetingCallLog`
- `Conversation`
- `ConversationMember`
- `ConversationMessage`
- `ConversationMessageReaction`
- `ScheduledConversationMessage`
- `ConversationTask`
- `ConversationTaskNote`
- `ConversationTaskActivity`
- `ConversationDocumentShare`
- `TeamSpace`, `TeamChannel`, `TeamChannelTab`
- `CalendarConnection`, `ExternalCalendarEvent`
- `PlatformAuditLog`
- `IntegrationEventOutboxMessage`
- `IntegrationEventConsumerCheckpoint`

### Notification Service

Location: `src/Services/NotificationService`

Responsibilities:

- SignalR hub at `/hubs/notifications`.
- User notification groups and meeting groups.
- Incoming call, call cancel, call response, missed call, conversation, meeting, whiteboard, hand, reaction, recording, and invite events.
- RabbitMQ event consumers that convert backend events into SignalR notifications.
- Persistent event checkpoints so duplicate RabbitMQ deliveries do not fan out completed notifications again.
- WebRTC offer, answer, and ICE candidate signaling.

Database: `meeting_notifications`

Main entities:

- `ProcessedNotificationEvent`

## RabbitMQ Consistency Model

Samvaad uses RabbitMQ for async service communication and keeps data consistent through these rules:

- Meeting Service writes business data and outgoing integration events into PostgreSQL together through `IntegrationEventOutboxMessages`.
- The outbox dispatcher publishes pending events to RabbitMQ with publisher confirms and strict routable-message checks.
- Consumers use durable quorum queues, manual acknowledgements, prefetch, and dead-letter queues.
- Meeting Service email consumers write `IntegrationEventConsumerCheckpoint` rows so duplicate deliveries do not resend completed emails.
- Notification Service writes `ProcessedNotificationEvent` rows so duplicate deliveries do not fan out completed realtime notifications again.
- `GET /api/messaging/outbox/summary` exposes pending, failed, locked, and recently processed outbox counts.
- `POST /api/messaging/outbox/{id}/retry` requeues a failed outbox event.

### Organization Service

Location: `src/Services/OrganizationService`

Responsibilities:

- Organization records, slugs, and membership.
- Resolve organizations by id or slug.
- Current organization resolution from tenant headers.
- Product-owner SaaS configuration.
- Storage provider, local/on-prem/cloud path configuration, limits, retention, guest access, and meeting defaults.
- Usage metrics and audit logs.
- Local tenant hosting metadata and launch actions.

Database: `meeting_organizations`

Main entities:

- `Organization`
- `OrganizationMember`
- `OrganizationAuditLog`

## Frontend Applications

### Samvaad User App

Location: `src/Frontend/meeting-app`

Primary routes:

- `/personal/dashboard`
- `/personal/activity`
- `/personal/chat`
- `/personal/meet`
- `/personal/calls`
- `/personal/create-meeting`
- `/personal/teams`
- `/personal/meeting/{meetingId}`
- `/org/{organizationSlug}/dashboard`
- `/org/{organizationSlug}/chat`
- `/org/{organizationSlug}/meet`
- `/org/{organizationSlug}/meeting/{meetingId}`

Key UI areas:

- Compact shell/navigation.
- Personal and organization workspace switching.
- Calendar week/full-week/month views.
- Chat with tabs for chat, files, photos, tasks, and calls.
- Calls page and incoming call ringer.
- Meeting room with responsive main stage and side panel.
- Theme selection.
- License request page.

### Samvaad Admin

Location: `src/Frontend/organization-admin`

Purpose:

- Product-owner/admin sign-in and registration.
- Organization list and configuration.
- Storage, retention, feature flags, meeting defaults, guest access, usage, audit, and local hosting controls.
- Company-facing license request follow-up.

## Workspace And Tenant Model

Samvaad supports both individual and company use:

- Personal workspace: no organization header, routes under `/personal`.
- Organization workspace: selected organization is stored client-side and sent with `X-Organization-Id` and `X-Organization-Slug`; routes include `/org/{slug}`.
- Meeting, chat, files, recordings, teams, calls, and tasks are filtered by tenant where applicable.
- Organization settings control storage and retention behavior for tenant data.

## Authentication Model

1. User registers or logs in through User Service.
2. User Service returns a JWT.
3. Frontend stores the active account in session storage and supports multiple saved accounts.
4. API Gateway forwards the bearer token.
5. Services validate issuer, audience, lifetime, and a shared signing key.
6. Development uses a shared local key id: `samvaad-shared-jwt-key`.
7. Production must provide a strong shared secret through secure configuration.

## Realtime And Calling Model

SignalR handles coordination:

- User notification groups for incoming calls, chat alerts, invite notifications, task notifications, and call responses.
- Meeting groups for participant changes, raised hands, reactions, whiteboard updates, recording changes, and meeting end events.
- WebRTC signaling messages are relayed through Notification Service.

Browser media is handled in the meeting app:

- Camera/microphone through browser media APIs.
- Screen sharing through display capture.
- Peer signaling through SignalR.
- Call logs persisted in Meeting Service.

## Calendar And Meeting Flow

1. User selects a future calendar slot or uses New meeting.
2. Meeting Service validates time range and organizer overlap.
3. Meeting and invites are stored.
4. Emails are sent through SMTP; local development uses Mailpit.
5. Connected Google/Outlook adapters are invoked when configured.
6. Attendees can accept, decline, or mark tentative with a reason.
7. Accepted invites appear in the attendee calendar list.
8. Past meetings cannot be joined, but chats and recordings remain accessible.

## Chat, Files, And Tasks Flow

1. User sends direct or group message.
2. Message is persisted with formatting, attachment metadata, important/pinned flags, reply linkage, and optional client message id for retry/deduplication.
3. Meeting Service stores a transactional outbox event with the message.
4. The outbox dispatcher publishes the event to RabbitMQ with publisher confirms and strict routing checks.
5. Notification Service consumes the event and sends SignalR notifications to active recipients.
6. Unread counts update until the conversation is marked read.
7. Messages can become tasks; tasks retain a source-message reference.
8. Files can be previewed, downloaded, shared by email, and audited.

## Storage Model

Local development stores files under service-managed storage paths and exposes API URLs through the gateway.

Organization configuration supports:

- Storage provider selection.
- Attachment and recording size limits.
- Retention settings.
- Local/on-prem/cloud path metadata.
- Public base URL normalization.

Production storage provider implementations should be wired to the chosen provider credentials and network policies.

## Database Initialization

`init-db.sql` creates:

- `meeting_users`
- `meeting_meetings`
- `meeting_notifications`
- `meeting_organizations`

Each EF Core service applies its own migrations on startup.

## Security Boundaries

- JWT required for secured endpoints.
- Services reject placeholder secrets outside development.
- CORS origins are configurable.
- Security headers are applied by services/gateway.
- Organization data is tenant-scoped.
- File uploads block unsafe extension/content-type combinations.
- Auth endpoints are rate-limited.
- Organizers/presenters have elevated meeting permissions.
- Unauthorized users cannot edit/delete protected meeting, chat, recording, or whiteboard data.

## Testing Architecture

Test layers:

- Server unit tests for each service.
- Infrastructure tests for assemblies, routes, docker compose, migrations, and project references.
- Client unit tests with Vitest.
- Functional tests with Playwright.
- Manual smoke flow for multi-user chat, calls, meetings, files, and calendar.

Run all tests:

```powershell
.\run-all-tests.ps1
```

## Azure Production Mapping

| Architecture component | Azure target |
| --- | --- |
| Samvaad user app | Azure Static Web Apps or static App Service hosting |
| Samvaad Admin | Azure Static Web Apps or static App Service hosting |
| API Gateway | Azure Container Apps or Azure App Service |
| User Service | Azure Container Apps or Azure App Service |
| Meeting Service | Azure Container Apps or Azure App Service |
| Notification Service | Azure Container Apps or Azure App Service |
| Organization Service | Azure Container Apps or Azure App Service |
| PostgreSQL databases | Azure Database for PostgreSQL Flexible Server |
| File/recording storage | Azure Blob Storage |
| Secrets | Azure Key Vault |
| Logs and metrics | Azure Monitor and Application Insights |
| Email | Azure Communication Services Email or SMTP provider |
| Edge/TLS/WAF | Azure Front Door or Application Gateway |
