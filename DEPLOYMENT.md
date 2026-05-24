# Samvaad Deployment Guide

This guide covers local deployment and the selected Azure production path for Samvaad.

## Selected Cloud Target

Azure is the chosen deployment platform for Samvaad.

Recommended Azure baseline:

| Layer | Azure service | Notes |
| --- | --- | --- |
| User frontend | Azure Static Web Apps or static App Service hosting | Hosts `meeting-app` |
| Admin frontend | Azure Static Web Apps or a separate static App Service site | Hosts `organization-admin` |
| API Gateway | Azure Container Apps or Azure App Service | Public backend entrypoint |
| Backend services | Azure Container Apps or Azure App Service | User, Meeting, Notification, Organization |
| Database | Azure Database for PostgreSQL Flexible Server | Service databases on managed PostgreSQL |
| Cache | Azure Cache for Redis | Optional at small scale, useful as usage grows |
| Event bus | RabbitMQ container first; Azure Service Bus optional later | RabbitMQ keeps early Azure cost lower |
| Files/recordings | Azure Blob Storage | Organization-aware containers or prefixes |
| Secrets | Azure Key Vault | JWT, database, SMTP, storage, OAuth secrets |
| Email | Azure Communication Services Email or SMTP provider | Invites, license requests, document sharing |
| Realtime | SignalR in app containers; optionally Azure SignalR Service later | Start simple, externalize when scale requires it |
| Monitoring | Azure Monitor and Application Insights | Logs, traces, alerts |
| Edge/security | Azure Front Door or Application Gateway | TLS, custom domains, WAF when needed |

## Local Development Deployment

Use this for development and QA on a single machine.

```powershell
cd D:\Projects\OnlineMeetingPlatform
docker-compose up -d
.\run-all-services.ps1
```

Open:

- Main app: http://localhost:5173
- Admin app: http://localhost:5174
- API Gateway: http://localhost:5000
- Gateway Swagger: http://localhost:5000/swagger
- Mailpit: http://localhost:8025
- RabbitMQ Management: http://localhost:15672

## Local Infrastructure

| Service | Container | Port |
| --- | --- | ---: |
| PostgreSQL | `meeting_postgres` | 5432 |
| Redis | `meeting_redis` | 6379 |
| RabbitMQ AMQP | `meeting_rabbitmq` | 5672 |
| RabbitMQ UI | `meeting_rabbitmq` | 15672 |
| Mailpit SMTP | `meeting_mailpit` | 1025 |
| Mailpit UI | `meeting_mailpit` | 8025 |

Databases:

- `meeting_users`
- `meeting_meetings`
- `meeting_notifications`
- `meeting_organizations`

## Environment Configuration

Production must override development values.

### Required Backend Settings

- `ConnectionStrings:DefaultConnection`
- `JwtSettings:SecretKey`
- `JwtSettings:Issuer`
- `JwtSettings:Audience`
- `Security:AllowedOrigins`
- `Security:MaxRequestBodyBytes`
- `InternalService:ApiKey`
- Notification Service `ConnectionStrings:DefaultConnection` when RabbitMQ is enabled, so notification event de-duplication is persistent
- SMTP or Azure Communication Services Email settings
- `RabbitMq` settings for durable event publishing and consumers
- `IntegrationOutbox` settings for event batch size, retry count, polling, and lock duration
- Azure Blob Storage or organization storage settings
- Calendar sync credentials for Google and/or Outlook if enabled

Use Azure Key Vault for production secrets wherever possible.

### Required Frontend Settings

The current frontend defaults to `http://localhost:5000/api`. For Azure, configure the API base URL through build-time environment settings or hosting configuration before publishing.

## Azure Production Shape

Minimum Azure production components:

- Static hosting for `meeting-app`.
- Static hosting for `organization-admin`.
- API Gateway deployed to Azure Container Apps or App Service.
- User Service deployed to Azure Container Apps or App Service.
- Meeting Service deployed to Azure Container Apps or App Service.
- Notification Service deployed to Azure Container Apps or App Service.
- Organization Service deployed to Azure Container Apps or App Service.
- Azure Database for PostgreSQL Flexible Server.
- Azure Blob Storage for attachments and recordings.
- Azure Key Vault for secrets.
- Azure Monitor/Application Insights.
- Email provider.
- RabbitMQ event bus container or managed RabbitMQ-compatible broker.
- Optional Azure Cache for Redis.
- Optional Azure Front Door/Application Gateway.

Recommended network shape:

```text
Internet
  |
  v
Azure Front Door / HTTPS ingress
  |
  +--> meeting-app static frontend
  +--> organization-admin static frontend
  +--> API Gateway
          |
          +--> User Service
          +--> Meeting Service
          +--> Notification Service
          +--> Organization Service
```

Only the edge, frontend apps, and API Gateway should be public. PostgreSQL, Redis, SMTP credentials, storage credentials, and Key Vault should remain private or access-restricted.

RabbitMQ should also stay private. Expose only AMQP traffic to Samvaad backend services and keep the management UI behind local access, a VPN, or a private admin network. Keep `RequireRoutableMessages` enabled so the Meeting Service outbox retries events when no matching durable queue exists yet.

Use `/api/messaging/outbox/summary` from an authenticated admin/operator account to monitor pending, locked, failed, and recently processed outbox events.

## Azure Cost-Conscious Path

For an early SaaS pilot on Azure, keep the architecture simple:

- Use Azure Static Web Apps for the user/admin frontends if it fits the routing and build needs.
- Use Azure Container Apps for the API Gateway and four services so they can scale down when idle.
- Start with one small Azure Database for PostgreSQL Flexible Server.
- Use Azure Blob Storage for attachments and recordings from day one.
- Use Key Vault for secrets.
- Delay Azure SignalR Service until realtime traffic requires it.
- Run RabbitMQ as a low-cost container first; move to Azure Service Bus only if a customer requires a managed Azure queue.
- Keep Redis optional until caching/session pressure justifies it.
- Keep retention limits strict for recordings and attachments to control storage growth.

Tradeoffs:

- Container Apps can be simpler and cheaper for an early SaaS workload than AKS.
- AKS gives maximum control, but it is usually overkill until customer count and operations needs justify it.
- Managed PostgreSQL costs more than a self-hosted database, but backups, patching, and reliability are worth it for customer data.
- Recording storage can grow quickly; use Samvaad Admin retention and size limits per organization.

## Organization Storage Options

Samvaad is designed so a customer organization can use different storage policies:

- Azure Blob Storage for production scale.
- Customer-owned Azure Storage for organizations that require their own storage account.
- On-prem/local network paths for customers that require their own premises storage.
- Application local storage only for demos and small non-production setups.

For production, configure:

- Provider name.
- Recording and attachment limits.
- Retention days.
- Public base URL or signed URL strategy.
- Access permissions and audit policy.

## Azure Container Deployment Notes

The included `docker-compose.yml` is for local infrastructure only. For Azure, publish built images to Azure Container Registry, then deploy the gateway and services to Azure Container Apps or App Service for Containers.

Recommended flow:

1. Build service images.
2. Push them to Azure Container Registry.
3. Create an Azure Container Apps environment or App Service plans.
4. Configure environment variables from Key Vault.
5. Configure managed identity where possible.
6. Restrict service ingress so only the API Gateway is public.
7. Configure Gateway destination addresses for the deployed service URLs.

Example image build commands:

```powershell
az acr build --registry <acr-name> --image samvaad/userservice:latest src/Services/UserService
az acr build --registry <acr-name> --image samvaad/meetingservice:latest src/Services/MeetingService
az acr build --registry <acr-name> --image samvaad/notificationservice:latest src/Services/NotificationService
az acr build --registry <acr-name> --image samvaad/organizationservice:latest src/Services/OrganizationService
az acr build --registry <acr-name> --image samvaad/apigateway:latest src/Gateway/ApiGateway
```

## Database Migration

Services run EF Core migrations on startup. For controlled production releases, prefer an explicit migration step from the same image/version being deployed:

```powershell
dotnet ef database update --project src\Services\UserService\UserService.csproj
dotnet ef database update --project src\Services\MeetingService\MeetingService.csproj
dotnet ef database update --project src\Services\OrganizationService\OrganizationService.csproj
```

Important migration currently required for calls:

- `20260520103000_MeetingCallLogs`
- `20260524010000_IntegrationEventOutbox`
- `20260524013000_IntegrationEventConsumerCheckpoints`
- Notification Service: `20260524014500_ProcessedNotificationEvents`

## Email

Local:

- SMTP host: `localhost`
- SMTP port: `1025`
- UI: http://localhost:8025

Azure production:

- Use Azure Communication Services Email or a real SMTP/transactional email provider.
- Configure SPF, DKIM, and DMARC for the sending domain.
- Do not expose Mailpit publicly.

## Calendar Sync

Google and Outlook adapters require provider application configuration:

- Client id.
- Client secret.
- Redirect URL.
- Scopes.
- Tenant setting for Outlook.

If these values are empty, the app displays providers as not configured and disables connect actions.

## Security Checklist

- Replace all development secrets.
- Store secrets in Azure Key Vault.
- Use HTTPS everywhere.
- Restrict `Security:AllowedOrigins`.
- Keep PostgreSQL and Redis private.
- Use managed identity where possible.
- Disable public Swagger or protect it.
- Configure auth rate limits.
- Configure upload size limits.
- Configure attachment type restrictions.
- Enable audit log review.
- Back up databases and file storage.
- Use least-privilege storage permissions.
- Monitor failed login attempts and API errors.
- Review organization tenant isolation before onboarding customers.

## Backup And Recovery

PostgreSQL backup:

```powershell
docker exec meeting_postgres pg_dump -U postgres meeting_users > backup_users.sql
docker exec meeting_postgres pg_dump -U postgres meeting_meetings > backup_meetings.sql
docker exec meeting_postgres pg_dump -U postgres meeting_organizations > backup_organizations.sql
```

Azure backup targets:

- Azure Database for PostgreSQL automated backups.
- Blob Storage soft delete/versioning or backup policy.
- Key Vault soft delete and purge protection.
- Exported app/container configuration.
- Application logs retained in Log Analytics.

Suggested targets:

- RPO: 15 minutes for production.
- RTO: 1 hour for small deployments.

## Monitoring

At minimum, monitor:

- API Gateway 4xx/5xx rates.
- Service process health.
- PostgreSQL CPU, memory, disk, connections.
- Redis memory if enabled.
- SignalR connection counts.
- SMTP/email delivery failures.
- Integration outbox pending/failed message counts.
- Meeting and Notification consumer checkpoint errors.
- Storage consumption per organization.
- Recording upload failures.
- Background worker errors.

Azure-native monitoring:

- Application Insights for API traces and exceptions.
- Azure Monitor alerts for service health.
- Log Analytics workspace for centralized logs.
- Storage metrics for per-organization growth.
- PostgreSQL metrics and slow query logs.

## Test Before Release

Run:

```powershell
.\run-all-tests.ps1
```

Then manually smoke:

1. Register/login.
2. Create a personal meeting.
3. Create an organization workspace and open `/org/{slug}`.
4. Send direct and group chat messages.
5. Upload/paste/share a document.
6. Create and update a task.
7. Schedule a meeting and accept as another user.
8. Join from two accounts.
9. Direct-call an available user.
10. Cancel a mistaken call.
11. Record and verify the recording link.
12. Confirm emails in SMTP logs/provider.

Latest known passing automated run:

- Report: `artifacts/test-reports/20260521-011036/summary.md`
- Suites: 8 passed, 0 failed

## Azure Services To Provision First

Start with this resource list:

1. Resource group for Samvaad.
2. Azure Container Registry.
3. Azure Database for PostgreSQL Flexible Server.
4. Azure Storage Account for attachments and recordings.
5. Azure Key Vault.
6. Azure Container Apps environment.
7. Container apps for API Gateway, User, Meeting, Notification, and Organization services.
8. Static hosting for `meeting-app`.
9. Static hosting for `organization-admin`.
10. Application Insights and Log Analytics.
11. Email provider setup.
12. Custom domains and TLS certificates.

## Production Readiness Notes

Samvaad has a broad local feature set, but deployment readiness depends on environment hardening:

- Decide where each organization's recordings and files live in Azure Blob Storage or customer-owned storage.
- Decide whether organizations get shared Azure tenant URLs, dedicated Azure app hosts, or both.
- Configure backup/restore and retention before storing real customer data.
- Configure TURN/STUN infrastructure for reliable WebRTC across networks.
- Validate email deliverability with the production domain.
- Run load and security testing before selling to larger organizations.
