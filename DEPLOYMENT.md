# Deployment Guide - Online Meeting Platform

## Local Development Deployment

### Quick Setup Checklist
- [ ] Install .NET 8.0 SDK
- [ ] Install Node.js 18+
- [ ] Install Docker Desktop
- [ ] Clone/navigate to repository
- [ ] Run `docker-compose up -d` for infrastructure
- [ ] Start all 4 backend services in separate terminals
- [ ] Run `npm install && npm run dev` for frontend
- [ ] Access at http://localhost:5173

See **QUICKSTART.md** for detailed steps.

## Production Deployment Options

### Option 1: Docker Compose on Server

**Requirements:**
- Ubuntu/Linux server
- Docker & Docker Compose installed
- 4GB+ RAM
- 20GB+ storage

**Steps:**

1. Upload project to server:
```bash
git clone https://github.com/yourusername/OnlineMeetingPlatform.git
cd OnlineMeetingPlatform
```

2. Update configuration for production:
```bash
# Update environment variables
nano .env.production
```

3. Build Docker images:
```bash
docker-compose -f docker-compose.prod.yml build
```

4. Start services:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

5. Verify:
```bash
docker-compose logs
curl http://localhost:5000/api/auth/login
```

### Option 2: Azure Container Instances (ACI)

**Requirements:**
- Azure subscription
- Azure CLI installed
- Container Registry

**Steps:**

1. Create Azure Container Registry:
```bash
az acr create --resource-group myResourceGroup --name myregistry --sku Basic
```

2. Build and push images:
```bash
az acr build --registry myregistry --image userservice:latest ./src/Services/UserService
az acr build --registry myregistry --image meetingservice:latest ./src/Services/MeetingService
az acr build --registry myregistry --image notificationservice:latest ./src/Services/NotificationService
az acr build --registry myregistry --image apigateway:latest ./src/Gateway/ApiGateway
az acr build --registry myregistry --image frontend:latest ./src/Frontend/meeting-app
```

3. Deploy to ACI:
```bash
# Deploy database
az container create \
  --resource-group myResourceGroup \
  --name postgres \
  --image postgres:15-alpine \
  --environment-variables POSTGRES_PASSWORD=password123 \
  --ports 5432 \
  --memory 2

# Deploy services
az container create \
  --resource-group myResourceGroup \
  --name userservice \
  --image myregistry.azurecr.io/userservice:latest \
  --ports 5001 \
  --memory 1 \
  --environment-variables DATABASE_URL="Host=postgres" \
  --registry-login-server myregistry.azurecr.io \
  --registry-username <username> \
  --registry-password <password>
```

### Option 3: Azure Kubernetes Service (AKS)

**Requirements:**
- Azure subscription
- kubectl installed
- Azure CLI installed

**Steps:**

1. Create AKS cluster:
```bash
az aks create \
  --resource-group myResourceGroup \
  --name myAKSCluster \
  --node-count 3 \
  --vm-set-type VirtualMachineScaleSets \
  --load-balancer-sku standard \
  --enable-managed-identity \
  --network-plugin azure \
  --network-policy azure
```

2. Get credentials:
```bash
az aks get-credentials --resource-group myResourceGroup --name myAKSCluster
```

3. Create Kubernetes manifests (see kubernetes/ folder)

4. Deploy:
```bash
kubectl apply -f kubernetes/namespaces.yaml
kubectl apply -f kubernetes/postgres.yaml
kubectl apply -f kubernetes/redis.yaml
kubectl apply -f kubernetes/services/
kubectl apply -f kubernetes/deployments/
```

5. Verify:
```bash
kubectl get pods --all-namespaces
kubectl get svc --all-namespaces
```

## Database Backup & Recovery

### PostgreSQL Backup

**Backup:**
```bash
docker-compose exec postgres pg_dump -U postgres meeting_users > backup_users.sql
docker-compose exec postgres pg_dump -U postgres meeting_meetings > backup_meetings.sql
```

**Restore:**
```bash
docker-compose exec -T postgres psql -U postgres < backup_users.sql
docker-compose exec -T postgres psql -U postgres < backup_meetings.sql
```

### Automated Backups

Add to crontab (daily at 2 AM):
```bash
0 2 * * * docker-compose -f /path/to/docker-compose.yml exec -T postgres pg_dump -U postgres all_databases > /backups/backup_$(date +\%Y\%m\%d).sql
```

## Monitoring & Alerting

### Azure Monitor

1. Configure Application Insights:
```bash
az resource create \
  --resource-group myResourceGroup \
  --resource-type "Microsoft.Insights/components" \
  --name myAppInsights \
  --properties '{"Application_Type":"web"}'
```

2. Add to appsettings.json:
```json
{
  "ApplicationInsights": {
    "InstrumentationKey": "your-key-here"
  }
}
```

3. Install NuGet package:
```bash
dotnet add package Microsoft.ApplicationInsights.AspNetCore
```

### Logging Configuration

Update Serilog in Program.cs:
```csharp
Log.Logger = new LoggerConfiguration()
    .MinimumLevel.Information()
    .WriteTo.Console()
    .WriteTo.ApplicationInsights(telemetryClient, TelemetryConverter.Traces)
    .WriteTo.File("logs/app-.txt", rollingInterval: RollingInterval.Day)
    .CreateLogger();
```

## SSL/TLS Certificate Management

### Self-Signed Certificate (Development)
```bash
# Generate private key
openssl genrsa -out private.key 2048

# Generate certificate
openssl req -new -x509 -key private.key -out certificate.crt -days 365
```

### Let's Encrypt (Production)

Using Certbot:
```bash
sudo certbot certonly --standalone -d yourdomain.com
```

Update nginx.conf:
```nginx
server {
    listen 443 ssl;
    ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
    ...
}
```

## Performance Optimization

### Database
```sql
-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_meetings_organizer ON meetings(organizer_id);
CREATE INDEX idx_meetings_start_time ON meetings(start_time);
CREATE INDEX idx_participants_meeting ON participants(meeting_id);
```

### Caching Strategy
```csharp
// Cache user data for 1 hour
services.AddStackExchangeRedisCache(options =>
{
    options.Configuration = "localhost:6379";
    options.InstanceName = "meetingapp:";
});
```

### Connection Pooling
```csharp
// PostgreSQL connection pooling
services.AddDbContext<UserDbContext>(options =>
    options.UseNpgsql(connectionString, npgOptions =>
    {
        npgOptions.MaxPoolSize(20);
    })
);
```

## Scaling Strategies

### Horizontal Scaling (Multiple Instances)

**Docker Swarm:**
```bash
docker swarm init
docker stack deploy -c docker-compose.prod.yml meeting-platform
docker service scale meeting-platform_userservice=3
docker service scale meeting-platform_meetingservice=3
docker service scale meeting-platform_notificationservice=2
```

**Kubernetes:**
```bash
kubectl scale deployment userservice --replicas=3 -n production
kubectl scale deployment meetingservice --replicas=3 -n production
kubectl autoscale deployment userservice --min=2 --max=10 -n production
```

### Load Balancing

**NGINX:**
```nginx
upstream backend {
    server userservice:5001;
    server userservice:5001;
    server userservice:5001;
}

server {
    listen 5001;
    location / {
        proxy_pass http://backend;
    }
}
```

## Disaster Recovery Plan

### RTO & RPO Targets
- **RTO (Recovery Time Objective)**: < 1 hour
- **RPO (Recovery Point Objective)**: < 15 minutes

### Backup Strategy
1. Daily full database backups
2. Hourly incremental backups
3. Offsite backup storage (Azure Blob Storage)
4. Regular restore tests

### Failover Plan
1. Automated health checks
2. Service restart on failure
3. Database replication to standby
4. DNS failover to backup location

## Security Checklist for Production

- [ ] Change all default credentials
- [ ] Enable HTTPS/TLS
- [ ] Configure CORS for allowed origins only
- [ ] Enable database encryption at rest
- [ ] Implement rate limiting
- [ ] Set up Web Application Firewall (WAF)
- [ ] Enable audit logging
- [ ] Regular security patches
- [ ] Penetration testing
- [ ] DDoS protection (Azure DDoS Standard)
- [ ] Enable VPN/Private endpoints
- [ ] Configure network security groups
- [ ] Regular security audits
- [ ] Incident response plan

## Cost Optimization (Azure)

### Recommendations
- Use Reserved Instances for predictable workloads
- Implement auto-scaling policies
- Use Azure Spot VMs for non-critical services
- Optimize database SKU based on actual usage
- Delete unused resources
- Use Azure Cost Management for monitoring

### Cost Estimation (Monthly)
- App Service (Premium): ~$100-200
- PostgreSQL (Single Server): ~$50-100
- Redis Cache (Basic): ~$15
- Storage (100GB): ~$2-5
- Data Transfer: ~$5-10
**Total Estimated**: $170-325/month

## Troubleshooting Production Issues

### Service Won't Start
```bash
# Check logs
docker logs container_name
kubectl logs pod_name

# Verify config
cat config.json
env | grep DATABASE
```

### High Latency
```bash
# Check database performance
EXPLAIN ANALYZE SELECT * FROM users;

# Monitor connections
SELECT datname, count(*) FROM pg_stat_activity GROUP BY datname;
```

### Memory Leaks
```bash
# Monitor memory usage
docker stats
kubectl top pods

# Check logs for errors
tail -f logs/error.log
```

## Support Contacts

- **Emergency Support**: +1-XXX-XXX-XXXX
- **Email**: support@example.com
- **Documentation**: https://docs.example.com
- **Status Page**: https://status.example.com
