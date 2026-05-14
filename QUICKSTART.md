# Quick Start Guide - Online Meeting Platform

## Prerequisites

Before you start, make sure you have installed:
- **.NET 8.0 SDK** - https://dotnet.microsoft.com/download
- **Node.js 18+** - https://nodejs.org/
- **Docker & Docker Desktop** - https://www.docker.com/products/docker-desktop
- **PostgreSQL 15** (Optional - use Docker instead)
- **Redis 7** (Optional - use Docker instead)

## Step 1: Start Infrastructure with Docker Compose

Open PowerShell/Command Prompt and run:

```bash
cd D:\Projects\OnlineMeetingPlatform
docker-compose up -d
```

This will start:
- **PostgreSQL** (Database) - Port 5432
- **Redis** (Cache) - Port 6379

Verify services are running:
```bash
docker-compose ps
```

## Step 2: Start Backend Services

Open 4 separate PowerShell terminals and run each service:

### Terminal 1 - User Service (Port 5001)
```bash
cd D:\Projects\OnlineMeetingPlatform\src\Services\UserService
dotnet run
```

### Terminal 2 - Meeting Service (Port 5002)
```bash
cd D:\Projects\OnlineMeetingPlatform\src\Services\MeetingService
dotnet run
```

### Terminal 3 - Notification Service (Port 5003)
```bash
cd D:\Projects\OnlineMeetingPlatform\src\Services\NotificationService
dotnet run
```

### Terminal 4 - API Gateway (Port 5000)
```bash
cd D:\Projects\OnlineMeetingPlatform\src\Gateway\ApiGateway
dotnet run
```

**Wait for all services to start** - You should see messages like "Now listening on: http://localhost:5001"

## Step 3: Start Frontend

Open a new PowerShell terminal:

```bash
cd D:\Projects\OnlineMeetingPlatform\src\Frontend\meeting-app
npm install
npm run dev
```

The frontend will start at **http://localhost:5173**

## Step 4: Access the Application

1. Open your browser and navigate to: **http://localhost:5173**
2. Click on **"Create one"** to register a new account
3. Fill in your details and click **Register**
4. You'll be redirected to the **Dashboard**

## Testing the Application

### Register a User
- Email: test@example.com
- First Name: John
- Last Name: Doe
- Password: Test@123

### Create a Meeting
- Click **"Create Meeting"** button
- Fill in meeting details:
  - Title: "Team Standup"
  - Description: "Daily standup meeting"
  - Start Time: Tomorrow at 10:00 AM
  - Duration: 30 minutes
  - Max Participants: 50
  - Check "Record this meeting" if you want
- Click **"Create Meeting"**

### API Endpoints

You can test APIs using Postman or cURL:

#### Authentication
```bash
# Register
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "firstName": "John",
  "lastName": "Doe",
  "password": "Password@123"
}

# Login
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "Password@123"
}
```

#### User Profile
```bash
# Get Profile (requires token)
GET http://localhost:5000/api/users/profile
Authorization: Bearer <YOUR_TOKEN>

# Update Profile
PUT http://localhost:5000/api/users/profile
Authorization: Bearer <YOUR_TOKEN>
Content-Type: application/json

{
  "firstName": "Jane",
  "lastName": "Smith",
  "phoneNumber": "+1234567890"
}
```

#### Meetings
```bash
# Create Meeting (requires token)
POST http://localhost:5000/api/meetings
Authorization: Bearer <YOUR_TOKEN>
Content-Type: application/json

{
  "title": "Planning Session",
  "description": "Q1 planning",
  "startTime": "2024-05-01T14:00:00Z",
  "durationMinutes": 60,
  "maxParticipants": 100,
  "isRecorded": true
}

# Get My Meetings
GET http://localhost:5000/api/meetings/organizer/list
Authorization: Bearer <YOUR_TOKEN>

# Get Meeting Details
GET http://localhost:5000/api/meetings/{meetingId}

# Join Meeting
POST http://localhost:5000/api/meetings/{meetingId}/participants/join
Content-Type: application/json

{
  "userEmail": "participant@example.com",
  "userName": "John Doe"
}

# Get Participants
GET http://localhost:5000/api/meetings/{meetingId}/participants
```

## SignalR Real-time Connections

SignalR hub is available at: **ws://localhost:5000/hubs/notifications**

### JavaScript Client Example:
```javascript
import * as signalR from '@microsoft/signalr';

const connection = new signalR.HubConnectionBuilder()
  .withUrl('http://localhost:5000/hubs/notifications', {
    accessTokenFactory: () => authToken
  })
  .withAutomaticReconnect()
  .build();

connection.on('ParticipantJoined', (data) => {
  console.log('Participant joined:', data);
});

connection.on('MeetingInvite', (data) => {
  console.log('Meeting invite:', data);
});

await connection.start();
```

## Environment Variables

Create `.env.local` files if needed:

### Frontend (D:\Projects\OnlineMeetingPlatform\src\Frontend\meeting-app\.env.local)
```
VITE_API_URL=http://localhost:5000
```

### Backend Services
Update `appsettings.json` files as needed for your environment.

## Common Issues & Solutions

### Issue: Connection refused to PostgreSQL
**Solution:**
```bash
docker-compose ps
docker logs meeting_postgres
```

### Issue: "Port 5432 already in use"
**Solution:**
```bash
docker-compose down
# Or specify different port in docker-compose.yml
```

### Issue: npm dependencies not found
**Solution:**
```bash
cd src/Frontend/meeting-app
rm -r node_modules package-lock.json
npm install
```

### Issue: .NET 8.0 SDK not found
**Solution:** Download from https://dotnet.microsoft.com/download

### Issue: Cannot connect to notification hub
**Solution:**
1. Verify the token is valid
2. Check SignalR service is running on port 5003
3. Check browser console for connection errors

## Stopping Services

### Stop Everything
```bash
# Stop Docker containers
docker-compose down

# Stop backend services - Press Ctrl+C in each terminal
# Stop frontend - Press Ctrl+C in the npm dev terminal
```

### Stop Individual Docker Service
```bash
docker-compose stop postgres
docker-compose stop redis
```

## Useful Commands

```bash
# View logs
docker-compose logs postgres
docker-compose logs redis

# View running containers
docker ps

# Stop all containers
docker stop $(docker ps -aq)

# Remove all containers
docker rm $(docker ps -aq)

# View database contents (with psql installed)
psql -h localhost -U postgres -d meeting_users
```

## Architecture Overview

```
┌────────────────────┐
│   React Frontend   │
│  (localhost:5173)  │
└─────────┬──────────┘
          │ HTTP/WebSocket
          ▼
┌─────────────────────────────────┐
│   YARP API Gateway              │
│   (localhost:5000)              │
└────┬────────────┬────────────┬──┘
     │            │            │
     ▼            ▼            ▼
┌─────────┐  ┌────────┐  ┌───────────┐
│ User    │  │Meeting │  │Notification
│Service  │  │Service │  │Service
│ :5001   │  │ :5002  │  │ :5003
└────┬────┘  └───┬────┘  └──────┬────┘
     │           │              │
     └───────────┼──────────────┘
                 │
         ┌───────┴──────────┐
         │                  │
    ┌────▼───┐       ┌──────▼──┐
    │PostgreSQL       │  Redis  │
    │:5432           │  :6379  │
    └─────────┘       └─────────┘
```

## Next Steps

1. **Database Setup**: Migrations will run automatically on first start
2. **Features to Implement**:
   - WebRTC for peer-to-peer video/audio
   - Meeting recordings upload
   - Email notifications
   - User roles (admin, moderator, participant)
   - Meeting waiting rooms
   - Chat functionality

3. **Production Deployment**:
   - Deploy using Docker to Azure Container Instances or AKS
   - Configure Azure SQL Database instead of PostgreSQL
   - Use Azure Redis for caching
   - Implement Azure Application Insights for monitoring

## Support & Documentation

- **Swagger UI** (When running locally):
  - User Service: http://localhost:5001/swagger
  - Meeting Service: http://localhost:5002/swagger
  - Notification Service: http://localhost:5003/swagger

- **Architecture Diagram**: See README.md

## Security Notes

⚠️ **Important**: The current setup uses default/example credentials. For production:
- Change JWT secret key
- Use environment variables for sensitive data
- Enable HTTPS/TLS
- Implement rate limiting
- Add input validation
- Use secure password hashing (already using BCrypt)
- Implement CORS properly for your domain
