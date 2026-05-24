# Samvaad Project Summary

## Overview

Samvaad is a collaboration platform for individuals and organizations. It combines chat, meetings, calendar, tasks, recordings, file sharing, calls, whiteboard data, organization workspaces, and a separate SaaS admin console.

The product started as `OnlineMeetingPlatform`; the current product name in the user-facing UI is Samvaad.

## Current Status

- Local full-stack application is implemented.
- API Gateway and four backend services are available.
- Main Samvaad app and Samvaad Admin app are available.
- Azure is the selected production deployment target.
- Local Docker infrastructure includes PostgreSQL, Redis, RabbitMQ, and Mailpit.
- Meeting Service uses a transactional integration outbox before RabbitMQ publishing, so saved chat/meeting/call/task changes are not lost when RabbitMQ is temporarily unavailable.
- Meeting and Notification consumers persist processed-event checkpoints so RabbitMQ redelivery does not duplicate completed email or realtime notification work.
- Automated server, client, functional, and infrastructure tests pass.
- Live two-user smoke flow passed on 2026-05-21 after fixing JWT validation and the meeting call-log migration.

Latest full test report:

```text
artifacts/test-reports/20260521-011036/summary.md
```

Result: 8 suites passed, 0 failed.

## Product Areas

### Identity And Profile

- Register and sign in.
- JWT authentication.
- Multiple saved accounts in one browser session.
- Profile and avatar management.
- Presence/status selection and display.
- Presence changes reflected across chat and meetings.

### Personal And Organization Workspaces

- Personal workspace under `/personal`.
- Organization workspace under `/org/{organizationSlug}`.
- Tenant-aware API headers for organization data.
- Organization data separation for meetings, chats, files, teams, calls, and storage.
- Product-owner admin app for organization configuration.

### Chat

- Direct and group chat.
- Chat request/invite flow.
- Unread counts.
- Pinned messages.
- Important messages.
- Reactions.
- Message editing and deletion.
- Message formatting with preserved line breaks and code blocks.
- Scheduled messages.
- Attachments, pasted screenshots, drag/drop upload, document preview, and email sharing.
- Tabs for chat, files, photos, tasks, and calls.

### Tasks

- Create tasks from comments/messages.
- Link task back to original message.
- Edit title, description, priority, due date, status, and assignee.
- Assign to self, participants, or external email.
- Notes and activity history.
- Filters by status, priority, assignee, due date, and query.
- Reopen completed tasks.

### Calendar And Meetings

- Work-week, full-week, and month calendar views.
- Meeting cards show time, duration, and status.
- Visual differences for ongoing, upcoming, completed, and cancelled meetings.
- Past time slots blocked for scheduling.
- Drag/drop reschedule with confirmation.
- Duplicate/overlapping meeting prevention.
- Invite responses with reason visible to organizer.
- Join links open in a new tab.
- Past meetings cannot be joined, but chats and recordings remain viewable.

### Meeting Room

- Join lobby/pre-join UI.
- Camera, microphone, and screen sharing controls.
- WebRTC signaling through SignalR.
- Recording upload and persistent recording link.
- Participants panel with raised hands sorted to top.
- Organizer and role labels.
- Presenter status shown across app.
- Raise hand and quick reactions.
- Meeting chat.
- Whiteboard data save/export.
- Export chat and whiteboard data.
- Organizer end/leave flow.
- Direct call available users during a meeting.
- Cancel accidental outgoing call and send apology message.

### Admin And SaaS

- Separate Samvaad Admin app.
- Admin sign-in/register flow.
- Organization list and configuration.
- Storage provider, retention, upload limits, guest access, and meeting defaults.
- Usage metrics and audit logs.
- Local tenant hosting action for an organization.
- License purchase/request page in the user app with simulated payment and email notification.

## Services

| Service | Port | Summary |
| --- | ---: | --- |
| API Gateway | 5000 | YARP routing and Swagger aggregation |
| User Service | 5001 | Auth, users, avatars, presence |
| Meeting Service | 5002 | Meetings, chat, calls, tasks, files, calendar, license requests, transactional event outbox |
| Notification Service | 5003 | RabbitMQ event consumers, SignalR realtime events, idempotency checkpoints, and WebRTC signaling |
| Organization Service | 5004 | Organizations, tenant config, usage, audit |

## Frontends

| App | Port | Summary |
| --- | ---: | --- |
| Samvaad app | 5173 | Main collaboration app |
| Samvaad Admin | 5174 | Product-owner admin console |

## Local Infrastructure

| Component | Port |
| --- | ---: |
| PostgreSQL | 5432 |
| Redis | 6379 |
| RabbitMQ AMQP | 5672 |
| RabbitMQ UI | 15672 |
| Mailpit SMTP | 1025 |
| Mailpit UI | 8025 |

## Testing

Run all tests:

```powershell
.\run-all-tests.ps1
```

The runner covers:

- `MeetingService.Tests`
- `UserService.Tests`
- `OrganizationService.Tests`
- `NotificationService.Tests`
- `Infrastructure.Tests`
- Meeting app unit tests
- Organization admin unit tests
- Meeting app Playwright functional tests

## Recently Fixed During Full Smoke Testing

- JWT tokens now include a shared key id and all services resolve the same signing key.
- Development JWT secrets are aligned across User, Meeting, Organization, and Notification services.
- The `MeetingCallLogs` migration now has EF metadata and is applied to the local database.
- The direct-call API path was verified after migration.
- RabbitMQ publishing now uses strict routing, publisher confirms, and an EF Core outbox dispatcher with retries/backoff.
- Added outbox status/retry API and persistent consumer idempotency for Meeting and Notification services.
- Dashboard, chat, meet, and meeting/autojoin pages render without console errors in the in-app browser.

## Recommended Next Steps

- Configure production secrets and storage providers.
- Add Azure-specific frontend API base URL configuration if not already handled by hosting.
- Provision Azure Container Registry, Container Apps/App Service, PostgreSQL Flexible Server, Blob Storage, Key Vault, and Application Insights.
- Add TURN/STUN infrastructure for reliable WebRTC outside local networks.
- Run load/security testing before onboarding real organizations.
- Decide per-customer hosting model on Azure: shared tenant URL, dedicated app host, or hybrid.
