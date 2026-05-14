# Architecture Guide - Online Meeting Platform

## System Architecture

### Microservices Pattern

The application follows a **microservices architecture** with the following benefits:
- **Scalability**: Each service can scale independently
- **Resilience**: Failure in one service doesn't crash others
- **Flexibility**: Technology stack can differ per service
- **Maintainability**: Teams can own specific services

```
Client Applications
       │
       ▼
   ┌─────────────────────────────┐
   │   API Gateway (YARP)        │
   │  - Route Management         │
   │  - Load Balancing           │
   │  - Rate Limiting            │
   └──┬──────────┬────────────┬──┘
      │          │            │
      ▼          ▼            ▼
   ┌──────┐  ┌────────┐   ┌──────────┐
   │User  │  │Meeting │   │Notification
   │Svc   │  │Svc     │   │Svc
   └──────┘  └────────┘   └──────────┘
      │          │            │
      └──────────┼────────────┘
                 │
        ┌────────▼────────┐
        │  Data Layer     │
        ├─────────────────┤
        │ PostgreSQL      │ (Primary DB)
        │ Redis           │ (Cache & Sessions)
        │ Message Queue   │ (Event Bus)
        └─────────────────┘
```

## Service Breakdown

### 1. User Service (Port 5001)
**Responsibilities:**
- User registration and authentication
- JWT token generation and validation
- User profile management
- Account settings

**Database:** PostgreSQL (meeting_users)

**Key Entities:**
```csharp
User
├── Id (GUID)
├── Email (unique)
├── FirstName
├── LastName
├── PasswordHash
├── IsEmailVerified
├── ProfilePictureUrl
├── CreatedAt
└── UpdatedAt
```

**APIs:**
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `GET /api/users/profile` - Get authenticated user profile
- `PUT /api/users/profile` - Update profile
- `GET /api/users/{id}` - Get public user info

### 2. Meeting Service (Port 5002)
**Responsibilities:**
- Meeting lifecycle management (CRUD)
- Meeting scheduling
- Participant management
- Recording metadata

**Database:** PostgreSQL (meeting_meetings)

**Key Entities:**
```csharp
Meeting
├── Id (GUID)
├── OrganizerId (FK to User)
├── Title
├── Description
├── StartTime
├── EndTime
├── DurationMinutes
├── Status (Scheduled, InProgress, Completed, Cancelled)
├── MeetingLink
├── IsRecorded
├── RecordingUrl
├── MaxParticipants
└── Participants (1:Many relationship)

Participant
├── Id (GUID)
├── MeetingId (FK to Meeting)
├── UserId (FK to User)
├── UserEmail
├── UserName
├── JoinedAt
├── LeftAt
├── IsAudioEnabled
├── IsVideoEnabled
└── IsScreenSharing
```

**APIs:**
- `POST /api/meetings` - Create meeting
- `GET /api/meetings/{id}` - Get meeting details
- `PUT /api/meetings/{id}` - Update meeting
- `DELETE /api/meetings/{id}` - Delete meeting
- `GET /api/meetings/organizer/list` - List user's meetings
- `POST /api/meetings/{id}/participants/join` - Join meeting
- `POST /api/meetings/{id}/participants/{pid}/leave` - Leave meeting
- `GET /api/meetings/{id}/participants` - Get participants

### 3. Notification Service (Port 5003)
**Responsibilities:**
- Real-time notifications via SignalR
- Event broadcasting
- Participant status updates
- Meeting state changes

**Technology:** ASP.NET Core SignalR

**SignalR Hub: `/hubs/notifications`**

**Supported Methods:**
```typescript
// Client Methods (called from frontend)
JoinMeetingGroup(meetingId: string)
LeaveMeetingGroup(meetingId: string)
JoinUserNotifications(userId: string)
SendPrivateMessage(userId: string, message: string)
NotifyParticipantJoined(meetingId: string, participantName: string)
NotifyParticipantLeft(meetingId: string, participantName: string)
NotifyScreenShareStarted(meetingId: string, participantName: string)
NotifyScreenShareEnded(meetingId: string, participantName: string)
NotifyMeetingStarted(meetingId: string, meetingTitle: string)
NotifyMeetingEnded(meetingId: string)
BroadcastMeetingInvite(userId: string, meetingId: string, title: string, organizerName: string)

// Server Events (received by frontend)
ReceiveNotification(message: string)
ParticipantJoined(data: { ParticipantName, Timestamp })
ParticipantLeft(data: { ParticipantName, Timestamp })
ScreenShareStarted(data: { ParticipantName, Timestamp })
ScreenShareEnded(data: { ParticipantName, Timestamp })
MeetingStarted(data: { MeetingTitle, Timestamp })
MeetingEnded(data: { Timestamp })
MeetingInvite(data: { MeetingId, MeetingTitle, OrganizerName, Timestamp })
```

### 4. API Gateway (Port 5000)
**Technology:** YARP (Yet Another Reverse Proxy)

**Responsibilities:**
- Route aggregation
- Request forwarding
- Load balancing
- Health checking

**Route Configuration:**
```json
/api/users/* → http://localhost:5001
/api/auth/* → http://localhost:5001
/api/meetings/* → http://localhost:5002
/hubs/* → http://localhost:5003
```

## Data Flow Diagrams

### Meeting Creation Flow
```
1. User (Frontend)
   └─→ POST /api/meetings
       └─→ API Gateway
           └─→ Meeting Service
               ├─→ Create Meeting (DB)
               ├─→ Generate Meeting Link
               └─→ Return Meeting DTO
                   └─→ Frontend updates state
```

### Real-time Participant Join Flow
```
1. Participant opens Meeting Page
   └─→ Connect to SignalR Hub
       └─→ Notification Service
           └─→ JoinMeetingGroup(meetingId)

2. Participant clicks "Join"
   └─→ POST /api/meetings/{id}/participants/join
       └─→ Meeting Service
           ├─→ Add Participant (DB)
           └─→ Return Participant DTO

3. Meeting Service invokes SignalR
   └─→ Broadcast to Meeting Group
       └─→ "ParticipantJoined" event
           └─→ All connected clients receive update
               └─→ UI updates participant list
```

### Authentication Flow
```
1. User submits login form
   └─→ POST /api/auth/login
       └─→ User Service
           ├─→ Find user by email
           ├─→ Verify password (BCrypt)
           ├─→ Generate JWT token
           └─→ Return { userId, token, expiresAt }

2. Frontend stores token
   └─→ localStorage.setItem('authToken', token)

3. Subsequent requests
   └─→ Authorization: Bearer <token>
       └─→ API Gateway validates JWT
           └─→ Forwards to service
               └─→ Service extracts user ID from claims
```

## Database Schema

### PostgreSQL Databases

**Database 1: meeting_users**
```sql
-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    is_email_verified BOOLEAN DEFAULT FALSE,
    profile_picture_url VARCHAR(500),
    phone_number VARCHAR(20),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);
```

**Database 2: meeting_meetings**
```sql
-- Meetings table
CREATE TABLE meetings (
    id UUID PRIMARY KEY,
    organizer_id UUID NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP,
    duration_minutes INT,
    status VARCHAR(20) DEFAULT 'Scheduled',
    meeting_link VARCHAR(500),
    is_recorded BOOLEAN DEFAULT FALSE,
    recording_url VARCHAR(500),
    max_participants INT DEFAULT 100,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP
);

-- Participants table
CREATE TABLE participants (
    id UUID PRIMARY KEY,
    meeting_id UUID NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
    user_id UUID NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    left_at TIMESTAMP,
    is_audio_enabled BOOLEAN DEFAULT TRUE,
    is_video_enabled BOOLEAN DEFAULT TRUE,
    is_screen_sharing BOOLEAN DEFAULT FALSE
);
```

## Redis Usage

**Cache Keys Pattern:**
```
user:{userId} → User data cache
meeting:{meetingId} → Meeting data cache
session:{sessionId} → User session data
participants:{meetingId} → Active participants in meeting
```

## Security Considerations

### Authentication
- JWT tokens with 24-hour expiration
- Token refresh mechanism (can be implemented)
- BCrypt password hashing (11 rounds)

### Authorization
- JWT claims-based authorization
- Per-endpoint authorization attributes
- Role-based access control (future)

### Data Protection
- HTTPS/TLS in production
- SQL injection prevention via EF Core parameterization
- CORS policy enforcement
- Input validation on all endpoints

### API Security
- Rate limiting (to be implemented)
- Request validation
- Error handling without exposing internals
- Logging of security events

## Deployment Architecture (Production)

```
┌──────────────────────────────────────────────────────┐
│              Azure Container Registry                │
│  (Docker images for all services)                   │
└──────────────────────┬───────────────────────────────┘
                       │
┌──────────────────────▼───────────────────────────────┐
│         Azure Kubernetes Service (AKS)              │
├──────────────────────────────────────────────────────┤
│ ┌──────────┐  ┌──────────┐  ┌──────────┐           │
│ │User Pods │  │Meeting   │  │Notif.    │           │
│ │(Replicas)│  │Pods      │  │Pods      │           │
│ └──────────┘  └──────────┘  └──────────┘           │
│                                                      │
│ ┌────────────────────────────────────────────┐      │
│ │  Ingress / Load Balancer                  │      │
│ └────────────────────────────────────────────┘      │
└──────────────────────────────────────────────────────┘
         │
         ├─────────────────┬──────────────┐
         │                 │              │
         ▼                 ▼              ▼
    ┌─────────────┐  ┌──────────┐  ┌─────────┐
    │ Azure SQL   │  │ Azure    │  │ Azure   │
    │ Database    │  │ Cache    │  │ Storage │
    │ (Postgres)  │  │(Redis)   │  │(Blobs)  │
    └─────────────┘  └──────────┘  └─────────┘
```

## Scaling Strategy

### Horizontal Scaling
- Each microservice can run multiple replicas
- Load balancer distributes traffic
- Stateless services for easy scaling

### Vertical Scaling
- Increase pod resource limits
- Database optimization
- Connection pooling

### Caching Strategy
- Redis for session storage
- In-memory caching for frequently accessed data
- Cache invalidation on updates

## Monitoring & Logging

**Tools:**
- Serilog for structured logging
- Application Insights for APM
- Docker logs for containerized services
- Database query logging

**Metrics to Monitor:**
- API response times
- Error rates
- Database connection pool
- Cache hit rates
- SignalR connections

## Future Enhancements

1. **WebRTC Integration**
   - Peer-to-peer video/audio
   - Screen sharing
   - TURN/STUN servers

2. **Message Queue**
   - RabbitMQ or Azure Service Bus
   - Async event processing
   - Meeting started/ended events

3. **Advanced Features**
   - Meeting recordings to Azure Blob Storage
   - Email notifications
   - Chat history
   - Meeting transcriptions

4. **Mobile App**
   - React Native
   - Native mobile experience
   - Push notifications

5. **Analytics**
   - Meeting analytics
   - User engagement metrics
   - Performance dashboards
