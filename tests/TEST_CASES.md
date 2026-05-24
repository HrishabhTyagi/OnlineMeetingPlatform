# Samvaad Test Case Matrix

This matrix documents the current expected test coverage for server, client, functional, and infrastructure behavior.

Run everything:

```powershell
.\run-all-tests.ps1
```

Latest verified full run:

```text
artifacts/test-reports/20260521-011036/summary.md
```

Result: 8 suites passed, 0 failed.

## Server Unit Tests

### User Service

- Register user with valid details.
- Reject duplicate email registration.
- Reject missing email or password.
- Hash and verify passwords.
- Reject invalid passwords on login.
- Generate JWT with user id, email, first name, and last name claims.
- Generate JWT with shared key id for cross-service validation.
- Search users by email, first name, and last name.
- Exclude the current user from search results.
- Return only active users from search.
- Update profile fields.
- Upload and remove avatar path.
- Normalize invalid presence statuses to `Available`.
- Accept valid presence statuses: `Available`, `Busy`, `DoNotDisturb`, `BeRightBack`, `Away`, `Offline`, `InMeeting`, `InCall`, and `Presenting`.

### Meeting Service

- Create online meeting with join link.
- Create offline meeting without join link.
- Normalize duration from start/end time.
- Enforce minimum duration.
- Normalize duplicate attendee emails.
- Create invite and reminder rows for attendees.
- Send invite email for each attendee.
- Sync meeting to external calendars.
- Reject overlapping organizer meetings.
- Update meeting and resync calendars.
- Reject invalid update ranges.
- Soft-delete meeting and delete external calendar events.
- End meeting only by organizer.
- Reject joining completed, cancelled, inactive, or past meetings.
- Restore existing participant on rejoin.
- Assign organizer role to organizer participant.
- Update audio, video, and screen sharing state.
- Update participant roles.
- Raise and lower hand.
- Sort raised hands to the top in participant display.
- Add and clear meeting reactions.
- Add group chat and direct chat messages.
- Reject blank meeting chat messages.
- Update notes.
- Allow whiteboard edits by organizer or presenter.
- Reject whiteboard edits by attendees without permission.
- Upload/update recording metadata.
- Export chat history.
- Export whiteboard data.

### Meeting Calls

- Create ringing call log for organizer.
- Create ringing call log for active participant.
- Reject self calls.
- Reject calls into closed meetings.
- Reject calls to users already in the meeting.
- Reject calls from users who are not in the meeting.
- Mark caller side seen on call creation.
- Allow recipient to accept, decline, or mark no response.
- Allow caller to cancel.
- Persist cancellation reason and accidental-call message.
- Reject caller accepting on behalf of recipient.
- Reject recipient cancelling caller call.
- Keep status history visible to both caller and recipient.
- Filter recent calls by all, missed, accepted, declined, cancelled, and no response.
- Mark call seen per user side.
- Hide a call per user side without deleting it for the other user.
- Clear visible call history per user side.
- Ensure `MeetingCallLogs` migration is discoverable and applied.

### Conversations

- Create direct chat with exactly two parties.
- Reuse existing direct chat.
- Create group chat with members and invited emails.
- Reject conversations without creator.
- Reject direct chat with too many participants.
- Send formatted multi-line messages.
- Reject empty message without attachment.
- Deduplicate queued messages by client message id.
- Edit own message.
- Reject editing another user's message.
- Pin and unpin messages.
- Mark messages as unread.
- Soft-delete own messages.
- Hide deleted pinned messages from message results.
- Add and remove reactions.
- Schedule future message.
- Reject invalid scheduled message.
- Cancel scheduled message.
- Dispatch scheduled messages.
- Search conversations, messages, tasks, documents, and meetings.

### Chat Tasks And Documents

- Create task from a comment.
- Create task without a source comment.
- Reject task from missing source comment.
- Assign task to member by id.
- Assign task to external email.
- Edit title, description, priority, due date, assignee, and status.
- Set completed timestamp when completed.
- Clear completed timestamp when reopened.
- Add task note.
- Log task activity.
- Filter tasks by status, priority, assignee, due date, and query.
- Delete task.
- Share document by email.
- Reject document sharing by unauthorized user.
- Create document share history.
- Audit document sharing.
- Preview supported document/image/text attachments.

### Teams And Channels

- Create team space with owner.
- Add and remove team members.
- Create channel and associated conversation.
- Add tabs of type link, notes, files, and meetings.
- Schedule channel meeting.
- Return channel files from chat attachments.
- Enforce tenant isolation.

### Organization Service

- Create organization with unique slug.
- Generate owner member from authenticated user claims.
- Return organizations sorted by name.
- Resolve organization by id and slug.
- Update storage provider and limits.
- Clamp retention and file-size settings.
- Normalize public base URL.
- Test storage path success and failure.
- Add, update, and remove members.
- Reject duplicate members.
- Return usage metrics and role counts.
- Return audit logs with take limit.
- Delete organization and cascade members.
- Resolve current organization from tenant headers.
- Store local tenant hosting metadata.

### Notification Service

- Only allow a signed-in user to join their own notification group.
- Reject incoming call send when caller id does not match signed-in user.
- Reject call with no recipients.
- Send incoming call payload to each distinct recipient.
- Send call cancellation to recipient.
- Send call response only from recipient.
- Send conversation message to group and recipient notifications.
- Send message update and reaction update.
- Send WebRTC offer, answer, and ICE candidates.
- Send meeting ended, invite, lobby, whiteboard, hand, reaction, and recording notifications.

## Server Integration And Infrastructure Tests

- Infrastructure assemblies load without reflection errors.
- Controllers are discoverable as routed API controllers.
- SignalR hub exposes the expected realtime contract methods.
- EF Core models build for User, Meeting, and Organization DbContexts.
- Migration IDs are unique inside each service assembly.
- `MeetingCallLogs` migration has EF `DbContext` metadata.
- API Gateway YARP routes map every public API surface to a valid cluster.
- API Gateway service Swagger routes are configured.
- Docker Compose declares PostgreSQL, Redis, RabbitMQ, and Mailpit with expected ports, volumes, networks, and health checks.
- RabbitMQ event bus uses durable exchanges, persistent messages, quorum queues, manual acknowledgements, publisher confirms, strict routable-message checks, prefetch limits, and dead-letter queues.
- Meeting Service stores integration events in `IntegrationEventOutboxMessages` before the same save completes.
- Integration outbox dispatcher locks pending rows, retries failed publishes with backoff, and marks successfully published events as processed.
- Meeting Service email consumers persist `IntegrationEventConsumerCheckpoint` rows and skip duplicate completed deliveries.
- Notification Service RabbitMQ consumers persist `ProcessedNotificationEvent` rows and skip duplicate completed deliveries.
- Messaging outbox API reports pending, failed, locked, and recently processed event counts and can requeue failed events.
- Service launcher stops existing local app processes, starts compose services, and validates containers before starting apps.
- Service project files use expected SDKs, target frameworks, and core infrastructure package references.
- API Gateway routes `/api/auth`, `/api/users`, `/api/meetings`, `/api/conversations`, `/api/organizations`, `/api/calendar-connections`, `/api/team-spaces`, `/api/license-requests`, and SignalR hub routes correctly.
- JWT authentication protects secured endpoints.
- JWT issuer, audience, key id, and shared local development secret validate across services.
- Tenant headers isolate meetings, conversations, storage, calls, teams, and organization data.
- Meeting creation returns data visible on organizer calendar.
- Meeting invite email includes accept, tentative, decline, and join links.
- Invite response updates organizer-visible status and reason.
- Accepted invite appears on invitee calendar.
- Direct call creates call log, sends SignalR notification, accepts into meeting, and updates call history.
- Missed call is persisted after timeout.
- Cancelled accidental call creates cancellation status and apology message.
- Recording upload persists metadata and posts/keeps a retrievable recording link.
- Whiteboard saves and reloads after meeting.
- Document upload, preview, email sharing, and audit log work together.
- Task creation from message links back to the original chat message.
- Organization storage configuration affects recording and attachment paths.
- Calendar sync calls provider adapters for Google and Outlook.

## Client Unit Tests

- API helpers build organization-scoped paths and URLs.
- API helpers append query strings to existing meeting links.
- API asset resolver handles relative, absolute, data, and blob URLs.
- Auth store supports multiple accounts.
- Auth store switches, removes, and logs out accounts correctly.
- Presence status badges render supported statuses.
- Message formatter preserves line breaks and code blocks.
- Attachment helpers detect image files and size limits.
- Calendar utilities compute week, month, and day slots.
- Meeting status helpers classify ongoing, upcoming, completed, and cancelled meetings.
- Call status helpers label missed and no-response calls correctly.
- Theme selection persists per user.
- Incoming call ringer accepts, declines, cancels, times out, and displays status.

## Client Integration Tests

- Login stores token and user.
- Dashboard loads tenant organization and meetings.
- Calendar month and work-week views render meeting cards in correct cells.
- Past calendar slots cannot open schedule dialog and show not-allowed cursor.
- Drag/drop reschedule asks for confirmation.
- Duplicate meeting time is rejected.
- Chat loads conversations, messages, files, photos, tasks, and calls tabs.
- Chat preserves multi-line pasted code.
- Chat queues unsent messages and retries.
- Chat supports paste screenshot preview, replacement, and removal.
- Chat supports drag/drop documents.
- Message reaction bar opens and updates UI.
- Message edit starts from up-arrow shortcut.
- Message scheduler creates scheduled banner.
- Calls page filters, marks seen, clears, and calls back.
- Incoming call ringer accepts, declines, times out, and shows missed call.
- Meeting room joins from a call notification.
- Meeting room can start/stop video, mute, share screen, record, raise hand, react, and chat.
- Participant panel sorts raised hands to the top.
- Organizer can end or leave from one menu.
- Call people panel rings available users and reports no response.
- Whiteboard opens and supports drawing permissions.
- Document viewer opens supported files.
- License page submits simulated purchase request.

## Client Functional Tests

- New user registers, signs in, and lands on dashboard.
- User creates organization-scoped meeting from calendar cell.
- Attendee receives invite, accepts, and sees meeting in calendar.
- Organizer and attendee join the meeting from separate accounts.
- Organizer calls another available user directly from ongoing meeting.
- Called user accepts in a new tab and joins the same meeting.
- Missed call appears in Calls page and chat Calls tab.
- Chat message with document attachment appears for sender and receiver.
- Pasted screenshot previews before sending.
- Task created from message appears in Tasks tab and can be completed.
- Recording link is available after upload and persists after reload.
- Raised hand indicator appears on participant tile and top summary.
- Presenter status appears consistently across chat, calendar, and meeting.
- Theme switch changes chat, calendar, meet, and calls surfaces.
- Organization admin configures storage, members, usage, audit, and local tenant hosting.
- License purchase request sends fake payment email request.

## Manual Smoke Flow

The latest successful smoke flow created fresh local users and verified:

- Auth/register.
- Profile/status.
- User search.
- Conversation create.
- Multiline message.
- Edit important message.
- Pin message.
- Reaction.
- Task create/update/note.
- Scheduled message.
- Attachment upload.
- Share document by email.
- Global search.
- Meeting create.
- Invite response.
- Calendar visible to attendee.
- Join meeting.
- Direct call ring/accept.
- Raised hand/reaction/presenter status.
- Meeting chat.
- Accidental call cancellation message.
- Recording upload.
- Calendar providers.
- Dashboard, chat, meet, and meeting/autojoin pages render without browser console errors.

## Direct Commands

Server tests:

```powershell
dotnet test tests\Server\MeetingService.Tests\MeetingService.Tests.csproj
dotnet test tests\Server\UserService.Tests\UserService.Tests.csproj
dotnet test tests\Server\OrganizationService.Tests\OrganizationService.Tests.csproj
dotnet test tests\Server\NotificationService.Tests\NotificationService.Tests.csproj
dotnet test tests\Server\Infrastructure.Tests\Infrastructure.Tests.csproj
```

Client tests:

```powershell
cd src\Frontend\meeting-app
npm test
npm run test:functional

cd ..\organization-admin
npm test
```
