# Online Meeting Platform - Microservices Architecture

A modern, scalable online meeting platform built with **ASP.NET Core** microservices, **React** frontend, **SignalR** for real-time communication, and containerized with **Docker**.

## Technology Stack

### Backend
- **ASP.NET Core 8.0** - Microservices framework
- **SignalR** - Real-time communication (WebSocket)
- **Entity Framework Core** - ORM
- **PostgreSQL** - Primary database
- **Redis** - Caching & session management
- **JWT** - Authentication
- **YARP** - API Gateway (Reverse Proxy)
- **MediatR** - CQRS pattern
- **FluentValidation** - Input validation
- **Serilog** - Structured logging
- **AutoMapper** - Object mapping

### Frontend
- **React 18** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool (fast development)
- **Tailwind CSS** - Styling
- **React Query** - Server state management
- **SignalR Client** - Real-time updates
- **Zustand** - Client state management

### Infrastructure
- **Docker** - Containerization
- **Docker Compose** - Local orchestration
- **PostgreSQL** - Database
- **Redis** - Cache & sessions

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend                           │
│                   (Vite + TypeScript)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ HTTP/WebSocket
┌─────────────────────▼───────────────────────────────────────┐
│              YARP API Gateway                                │
│         (Route aggregation & load balancing)                 │
└──────┬──────────────────┬──────────────┬────────────────────┘
       │                  │              │
       ▼                  ▼              ▼
┌─────────────────┐ ┌─────────────┐ ┌──────────────────┐
│  User Service   │ │ Meeting     │ │ Notification     │
│  - Auth         │ │ Service     │ │ Service          │
│  - Profile      │ │ - Meetings  │ │ - Email          │
│  - JWT Tokens   │ │ - Recording │ │ - WebSocket Push │
└────────┬────────┘ └──────┬──────┘ └────────┬─────────┘
         │                 │                  │
         └─────────────────┼──────────────────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                 ▼                 ▼
    ┌──────────┐   ┌──────────────┐  ┌─────────┐
    │PostgreSQL│   │    Redis     │  │ Message │
    │ Database │   │    Cache     │  │  Queue  │
    └──────────┘   └──────────────┘  └─────────┘
```

## Microservices

### 1. **User Service** (Port 5001)
- User registration & authentication
- Profile management
- JWT token generation
- Integrates with Auth0/OIDC (optional)

### 2. **Meeting Service** (Port 5002)
- Create & manage meetings
- Meeting lifecycle management
- Recording management
- Participant tracking

### 3. **Notification Service** (Port 5003)
- Real-time notifications via SignalR
- Email notifications
- Event-driven architecture

### 4. **API Gateway** (Port 5000)
- YARP-based reverse proxy
- Request routing
- Rate limiting
- Authentication middleware

## Getting Started

### Prerequisites
- .NET 8.0 SDK
- Node.js 18+
- Docker & Docker Compose
- PostgreSQL (or use Docker)

### Quick Start (Local Development)

#### 1. Clone & Navigate
```bash
cd D:\Projects\OnlineMeetingPlatform
```

#### 2. Start Infrastructure (Docker Compose)
```bash
docker-compose up -d
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)

#### 3. Start Backend Services

**Terminal 1 - User Service:**
```bash
cd src/Services/UserService
dotnet run --configuration Debug
```

**Terminal 2 - Meeting Service:**
```bash
cd src/Services/MeetingService
dotnet run --configuration Debug
```

**Terminal 3 - Notification Service:**
```bash
cd src/Services/NotificationService
dotnet run --configuration Debug
```

**Terminal 4 - API Gateway:**
```bash
cd src/Gateway/ApiGateway
dotnet run --configuration Debug
```

#### 4. Start Frontend

**Terminal 5 - React Frontend:**
```bash
cd src/Frontend/meeting-app
npm install
npm run dev
```

### Default URLs
- **Frontend**: http://localhost:5173
- **API Gateway**: http://localhost:5000
- **User Service**: http://localhost:5001
- **Meeting Service**: http://localhost:5002
- **Notification Service**: http://localhost:5003
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## Project Structure

```
OnlineMeetingPlatform/
├── src/
│   ├── Services/
│   │   ├── UserService/
│   │   │   ├── Controllers/
│   │   │   ├── Services/
│   │   │   ├── Models/
│   │   │   ├── Data/
│   │   │   └── Program.cs
│   │   ├── MeetingService/
│   │   │   ├── Controllers/
│   │   │   ├── Services/
│   │   │   ├── Models/
│   │   │   ├── Data/
│   │   │   └── Program.cs
│   │   └── NotificationService/
│   │       ├── Hubs/
│   │       ├── Services/
│   │       ├── Models/
│   │       └── Program.cs
│   ├── Gateway/
│   │   ├── ApiGateway/
│   │   │   ├── Program.cs
│   │   │   └── yarp-routes.json
│   │   └── Shared/
│   │       ├── Constants/
│   │       ├── Models/
│   │       └── Extensions/
│   └── Frontend/
│       └── meeting-app/
│           ├── src/
│           │   ├── components/
│           │   ├── pages/
│           │   ├── services/
│           │   ├── store/
│           │   └── App.tsx
│           ├── package.json
│           └── vite.config.ts
├── docker-compose.yml
├── Dockerfile
└── README.md
```

## API Documentation

### User Service (`/api/users`)
- `POST /register` - Register new user
- `POST /login` - User login
- `GET /profile` - Get user profile
- `PUT /profile` - Update profile
- `GET /verify-token` - Verify JWT token

### Meeting Service (`/api/meetings`)
- `POST /` - Create meeting
- `GET /{id}` - Get meeting details
- `GET /` - List meetings
- `PUT /{id}` - Update meeting
- `DELETE /{id}` - Delete meeting
- `POST /{id}/join` - Join meeting
- `POST /{id}/leave` - Leave meeting
- `GET /{id}/participants` - List participants

### Notification Service (SignalR Hub)
- `SendNotification` - Send real-time notification
- `SendMeetingInvite` - Notify users about meeting invite
- `ParticipantJoined` - Notify meeting participants
- `ParticipantLeft` - Notify participant leave

## Development Guidelines

### Adding New Microservice
1. Create service folder in `src/Services/{ServiceName}`
2. Add `Program.cs` with dependency injection
3. Implement controllers & services
4. Add database migrations
5. Register routes in YARP Gateway
6. Update `docker-compose.yml`

### Database Migrations
```bash
cd src/Services/{ServiceName}
dotnet ef migrations add MigrationName
dotnet ef database update
```

### Deployment

#### Docker Build
```bash
docker build -t meeting-platform:latest .
```

#### Docker Compose Production
```bash
docker-compose -f docker-compose.prod.yml up -d
```

## Security Considerations
- ✅ JWT authentication on all endpoints
- ✅ HTTPS/TLS enforcement in production
- ✅ CORS properly configured
- ✅ SQL injection protection via EF Core
- ✅ Rate limiting on API Gateway
- ✅ Input validation on all endpoints
- ✅ Secrets management via environment variables

## Monitoring & Logging
- **Serilog** for structured logging
- **Application Insights** integration (optional)
- **Docker logs** for container monitoring

## Contributing
1. Create feature branch
2. Commit with meaningful messages
3. Push to branch
4. Create Pull Request

## License
MIT

## Support
For issues and questions, please open an issue on GitHub.
