# Deployment Guide

This guide covers deploying fastify-camunda to production environments, including configuration, database setup, monitoring, and operational considerations.

## Prerequisites

Before deploying to production:

- [ ] All tests pass (`pnpm test`)
- [ ] Environment variables configured
- [ ] Database tables created
- [ ] Camunda Platform is accessible
- [ ] BPMN processes deployed to Camunda
- [ ] Monitoring and logging configured

## Environment Configuration

### Required Environment Variables

Create a `.env` file or configure environment in your deployment platform:

```bash
# Environment
NODE_ENV=production

# Server
PORT=8080
HOST=0.0.0.0

# Camunda Configuration
CAMUNDA_BASE_URL=https://camunda.yourdomain.com/engine-rest
CAMUNDA_MAX_TASKS=10
CAMUNDA_LOCK_DURATION_MS=20000
CAMUNDA_ASYNC_RESPONSE_TIMEOUT_MS=30000

# Process Configuration
SYNC_TIMEOUT_MS=25000

# Database Configuration (MSSQL)
DB_HOST=your-db-server.database.windows.net
DB_NAME=camunda_prod
DB_USER=camunda_user
DB_PASSWORD=secure-password-here

# Optional: Authentication (if Camunda requires it)
CAMUNDA_USERNAME=worker-user
CAMUNDA_PASSWORD=worker-password
```

### Environment Variable Details

#### NODE_ENV

- **Values**: `development`, `test`, `production`
- **Default**: `development`
- **Impact**: Affects logging verbosity, error details, and performance optimizations

#### CAMUNDA_BASE_URL

- **Format**: Full URL to Camunda REST API
- **Example**: `https://camunda.company.com/engine-rest`
- **Required**: Yes
- **Notes**: Must be accessible from worker instances

#### SYNC_TIMEOUT_MS

- **Default**: 25000 (25 seconds)
- **Range**: 5000-30000 recommended
- **Impact**: How long clients wait before receiving 202 response
- **Considerations**:
  - Shorter: Faster 202 responses, more polling
  - Longer: More immediate responses, held connections

#### DB\_\* Variables

- All database variables are required
- Connection pool settings in `src/plugins/db.ts`
- Ensure firewall rules allow connections

See [Configuration Reference](../reference/configuration.md) for complete details.

## Database Setup

### Create Tables

Run these SQL scripts on your production database:

```sql
-- Event Log Table
CREATE TABLE event_log (
  id INT IDENTITY(1,1) PRIMARY KEY,
  correlation_id VARCHAR(255) NOT NULL,
  step_name VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL,
  http_method VARCHAR(10),
  endpoint VARCHAR(500),
  request_data NVARCHAR(MAX),
  response_data NVARCHAR(MAX),
  error_message NVARCHAR(MAX),
  created_at DATETIME2 DEFAULT GETDATE(),
  INDEX idx_correlation_id (correlation_id),
  INDEX idx_created_at (created_at)
);

-- Process Store Table
CREATE TABLE process_store (
  correlation_id VARCHAR(255) PRIMARY KEY,
  status VARCHAR(50) NOT NULL,
  data NVARCHAR(MAX),
  error NVARCHAR(MAX),
  started_at DATETIME2 NOT NULL,
  updated_at DATETIME2 NOT NULL,
  INDEX idx_status (status),
  INDEX idx_updated_at (updated_at)
);
```

### Database Permissions

Grant appropriate permissions:

```sql
-- Create dedicated user
CREATE LOGIN camunda_user WITH PASSWORD = 'SecurePassword123!';
CREATE USER camunda_user FOR LOGIN camunda_user;

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON event_log TO camunda_user;
GRANT SELECT, INSERT, UPDATE, DELETE ON process_store TO camunda_user;
```

### Connection Pooling

Configure in `src/plugins/db.ts`:

```typescript
pool: {
  max: 10,           // Maximum connections
  min: 0,            // Minimum connections
  idleTimeoutMillis: 30000  // Close idle connections after 30s
}
```

For production:

- **max**: Set based on expected concurrent requests (10-20 typical)
- **min**: Keep at 0 or low number to save resources
- **idleTimeoutMillis**: 30000-60000 for cloud databases

## Build for Production

### Compile TypeScript

```bash
# Build
pnpm run build

# Output is in dist/ directory
ls dist/src/
```

### Verify Build

```bash
# Test production build locally
NODE_ENV=production node dist/src/start.js
```

## Deployment Options

### Option 1: Traditional Server

Deploy to a VM or bare metal server:

1. **Install Node.js 18+**:

```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
```

2. **Copy files**:

```bash
scp -r dist/ package.json pnpm-lock.yaml user@server:/opt/fastify-camunda/
```

3. **Install dependencies** (production only):

```bash
cd /opt/fastify-camunda
pnpm install --prod
```

4. **Set environment variables**:

```bash
sudo nano /etc/environment
# Add your variables
```

5. **Run with PM2** (process manager):

```bash
# Install PM2
sudo npm install -g pm2

# Start application
pm2 start dist/src/start.js --name fastify-camunda

# Configure auto-restart on server reboot
pm2 startup
pm2 save
```

6. **Monitor**:

```bash
pm2 status
pm2 logs fastify-camunda
pm2 monit
```

### Option 2: Docker

#### Dockerfile

Create `Dockerfile`:

```dockerfile
FROM node:18-alpine AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm

# Copy package files
COPY package.json pnpm-lock.yaml ./

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build
RUN pnpm run build

# Production image
FROM node:18-alpine

WORKDIR /app

RUN npm install -g pnpm

# Copy built files and dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8080/ping', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Run
CMD ["node", "dist/src/start.js"]
```

#### Build and Run

```bash
# Build image
docker build -t fastify-camunda:latest .

# Run container
docker run -d \
  --name fastify-camunda \
  -p 8080:8080 \
  --env-file .env.production \
  fastify-camunda:latest

# View logs
docker logs -f fastify-camunda

# Check health
docker ps
```

#### Docker Compose

Create `docker-compose.yml`:

```yaml
version: "3.8"

services:
  fastify-camunda:
    build: .
    ports:
      - "8080:8080"
    environment:
      NODE_ENV: production
      CAMUNDA_BASE_URL: ${CAMUNDA_BASE_URL}
      DB_HOST: ${DB_HOST}
      DB_NAME: ${DB_NAME}
      DB_USER: ${DB_USER}
      DB_PASSWORD: ${DB_PASSWORD}
    depends_on:
      - db
    restart: unless-stopped
    healthcheck:
      test:
        [
          "CMD",
          "node",
          "-e",
          "require('http').get('http://localhost:8080/ping', (r) => process.exit(r.statusCode === 200 ? 0 : 1))",
        ]
      interval: 30s
      timeout: 3s
      retries: 3

  db:
    image: mcr.microsoft.com/mssql/server:2019-latest
    environment:
      ACCEPT_EULA: "Y"
      SA_PASSWORD: ${DB_PASSWORD}
    ports:
      - "1433:1433"
    volumes:
      - mssql-data:/var/opt/mssql
    restart: unless-stopped

volumes:
  mssql-data:
```

Run with:

```bash
docker-compose up -d
```

### Option 3: Kubernetes

#### Deployment YAML

Create `k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: fastify-camunda
  labels:
    app: fastify-camunda
spec:
  replicas: 3
  selector:
    matchLabels:
      app: fastify-camunda
  template:
    metadata:
      labels:
        app: fastify-camunda
    spec:
      containers:
        - name: fastify-camunda
          image: your-registry/fastify-camunda:latest
          ports:
            - containerPort: 8080
          env:
            - name: NODE_ENV
              value: "production"
            - name: CAMUNDA_BASE_URL
              valueFrom:
                configMapKeyRef:
                  name: fastify-camunda-config
                  key: camunda-url
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: fastify-camunda-secrets
                  key: db-password
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /ping
              port: 8080
            initialDelaySeconds: 10
            periodSeconds: 30
          readinessProbe:
            httpGet:
              path: /ping
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: fastify-camunda-service
spec:
  selector:
    app: fastify-camunda
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
  type: LoadBalancer
```

Deploy:

```bash
kubectl apply -f k8s/deployment.yaml
```

## Monitoring and Logging

### Logging

Fastify-camunda uses Pino for structured logging.

#### Log Levels

- **Production**: `info` (default)
- **Development**: `debug`
- **Error tracking**: `error`, `fatal`

#### Log Format

JSON structured logs:

```json
{
  "level": 30,
  "time": 1698432000000,
  "pid": 12345,
  "hostname": "worker-01",
  "msg": "process started in Camunda",
  "correlationId": "user-123",
  "processInstanceId": "a1b2c3d4"
}
```

#### Centralized Logging

Ship logs to a logging service:

**Using Fluentd**:

```yaml
# fluent.conf
<source>
@type tail
path /var/log/fastify-camunda/*.log
pos_file /var/log/td-agent/fastify-camunda.log.pos
tag fastify.camunda
format json
</source>

<match fastify.camunda>
@type elasticsearch
host elasticsearch.yourdomain.com
port 9200
index_name fastify-camunda
</match>
```

**Using Docker logging driver**:

```bash
docker run -d \
  --log-driver=fluentd \
  --log-opt fluentd-address=localhost:24224 \
  fastify-camunda:latest
```

### Monitoring

#### Health Checks

Built-in health endpoint:

```bash
curl http://localhost:8080/ping
# Returns: "pong"
```

Use for:

- Load balancer health checks
- Container orchestration liveness probes
- Monitoring systems

#### Metrics

Track these metrics:

1. **Process Metrics**:

   - Processes started per minute
   - Process completion rate
   - Average process duration
   - Success vs error rate

2. **API Metrics**:

   - Request rate (requests/sec)
   - Response times (p50, p95, p99)
   - Error rate (5xx responses)
   - 200 vs 202 ratio

3. **System Metrics**:
   - CPU usage
   - Memory usage
   - Database connection pool usage
   - Waitroom size (pending promises)

#### Example: Prometheus Integration

Add Prometheus plugin:

```bash
pnpm add fastify-metrics
```

In `src/server.ts`:

```typescript
import metricsPlugin from "fastify-metrics";

await app.register(metricsPlugin, {
  endpoint: "/metrics",
  defaultMetrics: { enabled: true },
});
```

Scrape metrics:

```yaml
# prometheus.yml
scrape_configs:
  - job_name: "fastify-camunda"
    static_configs:
      - targets: ["localhost:8080"]
    metrics_path: "/metrics"
```

## Scaling Considerations

### Horizontal Scaling

Multiple instances can run in parallel:

```bash
# Docker Compose
docker-compose up --scale fastify-camunda=3

# Kubernetes
kubectl scale deployment fastify-camunda --replicas=5
```

**Current limitations**:

- Waitroom is in-memory (instance-local)
- Process store Map is in-memory (instance-local)

**Solutions**:

1. Use sticky sessions (route same correlationId to same instance)
2. Replace in-memory Map with Redis (future enhancement)

### Vertical Scaling

Increase resources per instance:

```yaml
# Kubernetes
resources:
  limits:
    memory: "1Gi"
    cpu: "1000m"
```

Monitor memory usage:

- Waitroom grows with concurrent requests
- Database connection pool uses memory
- Aim for < 80% memory usage

## Security

### Network Security

1. **Database**: Only allow connections from worker IPs
2. **Camunda**: Use VPN or private network
3. **API**: Use API gateway or reverse proxy
4. **TLS**: Enable HTTPS in production

### Application Security

1. **Environment variables**: Never commit secrets
2. **Database credentials**: Use secrets management (AWS Secrets Manager, Vault)
3. **Input validation**: Zod schemas validate all inputs
4. **Rate limiting**: Add rate limiting plugin

Example rate limiting:

```bash
pnpm add @fastify/rate-limit
```

```typescript
import rateLimit from "@fastify/rate-limit";

await app.register(rateLimit, {
  max: 100,
  timeWindow: "1 minute",
});
```

### Dependency Updates

Keep dependencies updated:

```bash
# Check for updates
pnpm outdated

# Update dependencies
pnpm update

# Run tests after updates
pnpm test
```

## Troubleshooting

### High Memory Usage

**Symptoms**: Memory keeps growing, eventually crashes

**Causes**:

- Waitroom not clearing completed processes
- Database connection leaks
- Large process data stored in memory

**Solutions**:

- Check waitroom cleanup (5s after completion)
- Monitor database connection pool
- Limit data size in process variables

### Database Connection Errors

**Symptoms**: `ConnectionError: Failed to connect`

**Solutions**:

1. Verify database is running and accessible
2. Check firewall rules
3. Verify credentials
4. Check connection pool settings
5. Monitor database resource usage

### Camunda Connection Errors

**Symptoms**: Workers not fetching tasks

**Solutions**:

1. Verify `CAMUNDA_BASE_URL` is correct
2. Check network connectivity
3. Verify Camunda is running
4. Check Camunda authentication if required
5. Review Camunda external task configuration

### Process Timeouts

**Symptoms**: All requests return 202

**Causes**:

- Process takes longer than `SYNC_TIMEOUT_MS`
- Camunda tasks not being processed
- Worker not calling `/api/process/complete`

**Solutions**:

1. Check Camunda task execution
2. Review worker logs for errors
3. Verify final task calls complete endpoint
4. Consider increasing `SYNC_TIMEOUT_MS` if appropriate

## Backup and Recovery

### Database Backups

```sql
-- Backup event log
BACKUP DATABASE camunda_prod TO DISK = '/backups/event_log.bak';

-- Point-in-time recovery
-- Enable if transaction log backups are needed
ALTER DATABASE camunda_prod SET RECOVERY FULL;
```

### Application State

- In-memory data (waitroom, process store Map) is ephemeral
- Database retains all process history
- On restart:
  - In-memory state is lost
  - Database provides historical data
  - New processes start fresh

## Performance Optimization

### Database Indexes

Ensure indexes exist on frequently queried columns:

```sql
-- Already included in table creation
CREATE INDEX idx_correlation_id ON event_log(correlation_id);
CREATE INDEX idx_created_at ON event_log(created_at);
CREATE INDEX idx_status ON process_store(status);
```

### Connection Pooling

Tune pool size based on load:

- Start with 10 connections
- Monitor pool usage
- Increase if seeing connection wait times

### Caching

Consider caching frequently accessed data:

- User lookups
- Reference data
- Configuration

## Next Steps

- **[Monitoring Setup](https://fastify.dev/docs/latest/Guides/Getting-Started/#monitoring)**: Configure detailed monitoring
- **[Architecture Overview](../design/architecture-overview.md)**: Understand system design
- **[Configuration Reference](../reference/configuration.md)**: All configuration options
