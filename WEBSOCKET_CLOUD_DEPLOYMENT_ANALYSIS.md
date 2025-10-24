# WebSocket Cloud Deployment Analysis & Improvements

## Executive Summary

**Current Status**: The WebSocket implementation is **MOSTLY READY** for cloud deployment with some **CRITICAL** improvements needed for production AWS/OCI environments.

**Risk Level**: MEDIUM - Current implementation will work but needs hardening for production reliability, security, and scalability.

---

## Current Architecture Analysis

### ✅ Strengths (Already Production-Ready)

1. **Robust Reconnection Logic** (Lines 711-755)
   - Exponential backoff: 5s → 10s → 20s → 40s → 80s
   - Max 5 reconnection attempts before giving up
   - Automatic token refresh on expiry (code 4001)
   - Multi-person fallback mechanism (tries different tokens)

2. **Health Monitoring** (Lines 605-674)
   - Connection health checks every 60 seconds
   - Zombie connection detection (5min timeout)
   - Auto re-subscription after 30s silence
   - Real-time connection state tracking

3. **Connection State Management** (Lines 13-18, 433-439)
   - Reactive UI state (connected/connecting/disconnected/error)
   - Tracks last update timestamp
   - Displays current person and symbol count

4. **Clean Architecture**
   - Singleton pattern prevents multiple connections
   - Separation of concerns (frontend WebSocket + backend proxy)
   - Event-driven message handling

5. **Token Management**
   - Automatic token refresh on expiry
   - Multi-person fallback (if one token fails, tries another)
   - Force refresh capability (line 233)

---

## 🚨 CRITICAL Issues for Cloud Deployment

### 1. **Missing Load Balancer / Sticky Sessions Configuration**

**Problem**: WebSocket connections require persistent connections. Cloud load balancers (AWS ALB, OCI LB) can break WebSocket connections if not configured properly.

**Impact**: HIGH - WebSocket connections will randomly disconnect

**Solution Required**:
```javascript
// Add connection persistence tracking
class QuestradeWebSocket {
  constructor() {
    // ... existing code
    this.connectionId = null; // Track connection ID for sticky sessions
    this.backendHealth = null; // Track backend health for failover
  }

  async connect(symbols, onQuoteUpdate) {
    // Add connection metadata for load balancer
    const headers = {
      'X-Connection-ID': this.connectionId || this.generateConnectionId(),
      'X-Client-Version': '2.0.0',
      'X-Session-Timeout': '1800000' // 30 minutes
    };
    // ... rest of connection logic
  }

  generateConnectionId() {
    this.connectionId = `ws-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    return this.connectionId;
  }
}
```

**Cloud Configuration Needed**:
- **AWS ALB**: Enable sticky sessions with 30min cookie duration
- **OCI Load Balancer**: Enable session persistence on port 4005
- **nginx**: Use `ip_hash` or `sticky` directive

---

### 2. **No WebSocket Upgrade Timeout Handling**

**Problem**: Line 410-415 has a 10-second authentication timeout, but no timeout for the WebSocket upgrade itself.

**Impact**: MEDIUM - Slow cloud network connections might timeout before WebSocket upgrade completes

**Solution**:
```javascript
setupEventHandlers(accessToken) {
  return new Promise((resolve, reject) => {
    // Add WebSocket upgrade timeout
    const upgradeTimeout = setTimeout(() => {
      reject(new Error('WebSocket upgrade timeout'));
      if (this.ws) {
        this.ws.close();
      }
    }, 5000); // 5 seconds for upgrade

    this.ws.onopen = () => {
      clearTimeout(upgradeTimeout); // Clear upgrade timeout
      console.log('[QT WebSocket] ✅ Connection opened, authenticating...');

      // Existing authentication timeout (keep this)
      const authTimeout = setTimeout(() => {
        if (!this.isAuthenticated) {
          reject(new Error('Authentication timeout'));
        }
      }, 10000);

      this.ws.send(accessToken);
    };
    // ... rest of handlers
  });
}
```

---

### 3. **Hardcoded URLs - No Environment Configuration**

**Problem**:
- Line 104: `/api-auth/persons` - hardcoded
- Line 238: `/api-auth/auth/access-token/${personName}` - hardcoded
- Line 277: `/api-market/symbols/lookup` - hardcoded
- Line 320: `/api-market/symbols/stream-port` - hardcoded

**Impact**: HIGH - Cannot deploy to different cloud environments without code changes

**Solution**:
```javascript
// Add at top of file
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
const WS_BASE_URL = import.meta.env.VITE_WS_BASE_URL || '';

class QuestradeWebSocket {
  constructor() {
    // ... existing code
    this.apiBaseUrl = API_BASE_URL;
    this.wsBaseUrl = WS_BASE_URL;
  }

  async fetchAvailablePersons() {
    const url = `${this.apiBaseUrl}/api-auth/persons`;
    const response = await fetch(url);
    // ...
  }
}
```

**Environment Files Needed**:
```bash
# .env.production
VITE_API_BASE_URL=https://api.yourdomain.com
VITE_WS_BASE_URL=wss://ws.yourdomain.com

# .env.development
VITE_API_BASE_URL=http://localhost:5500
VITE_WS_BASE_URL=ws://localhost:5500
```

---

### 4. **No Graceful Degradation for WebSocket Failures**

**Problem**: If WebSocket fails after 5 reconnection attempts, the app has NO fallback mechanism.

**Impact**: MEDIUM - Users lose real-time updates permanently until page refresh

**Solution**:
```javascript
class QuestradeWebSocket {
  constructor() {
    // ... existing code
    this.fallbackToPolling = false;
    this.pollingInterval = null;
  }

  scheduleReconnect(forceRefresh = false) {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[QT WebSocket] ❌ Max reconnect attempts reached');

      // Enable polling fallback
      this.enablePollingFallback();
      return;
    }
    // ... existing reconnection logic
  }

  enablePollingFallback() {
    console.warn('[QT WebSocket] 📊 Falling back to HTTP polling (30s interval)');
    this.fallbackToPolling = true;

    setConnectionState({
      status: 'degraded',
      lastUpdate: Date.now(),
      person: this.currentPerson,
      symbolCount: this.subscribedSymbolIds.size
    });

    // Poll for updates every 30 seconds
    this.pollingInterval = setInterval(async () => {
      try {
        const symbols = Array.from(this.allSymbols);
        const response = await fetch(`${this.apiBaseUrl}/api-market/quotes/batch`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols })
        });

        const data = await response.json();
        if (data.success && this.onQuoteUpdate) {
          this.onQuoteUpdate(data.data);
        }
      } catch (error) {
        console.error('[QT WebSocket] Polling failed:', error);
      }
    }, 30000);
  }

  disconnect() {
    // ... existing code
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
  }
}
```

---

### 5. **Missing Request/Response IDs for Message Tracking**

**Problem**: No way to correlate requests with responses in logs (debugging nightmare in production)

**Impact**: LOW - Debugging issues in production will be difficult

**Solution**:
```javascript
subscribeToSymbols() {
  if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
    console.error('[QT WebSocket] Cannot subscribe - connection not open');
    return;
  }

  const symbolIdsArray = Array.from(this.subscribedSymbolIds);
  const requestId = `sub-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

  console.log(`[QT WebSocket] [${requestId}] Subscribing to ${symbolIdsArray.length} symbols:`, symbolIdsArray);

  const subscribeMessage = {
    requestId: requestId,
    mode: 'streaming',
    ids: symbolIdsArray,
    timestamp: Date.now()
  };

  this.ws.send(JSON.stringify(subscribeMessage));
  console.log(`[QT WebSocket] [${requestId}] ✅ Subscription request sent`);
}
```

---

### 6. **No Rate Limiting Protection**

**Problem**: If Questrade rate limits (429), code tries next person but doesn't implement exponential backoff for rate limit retries.

**Impact**: MEDIUM - Could get all tokens rate-limited simultaneously

**Solution**:
```javascript
async connectWithFallback() {
  if (!this.availablePersons || this.availablePersons.length === 0) {
    await this.fetchAvailablePersons();
  }

  let rateLimitDelay = 0;

  for (const person of this.availablePersons) {
    try {
      // Add delay for rate limit protection
      if (rateLimitDelay > 0) {
        console.log(`[QT WebSocket] ⏳ Waiting ${rateLimitDelay}ms before trying next person (rate limit protection)`);
        await new Promise(resolve => setTimeout(resolve, rateLimitDelay));
      }

      console.log(`[QT WebSocket] Trying to connect with ${person}'s token...`);
      await this.connectWithPerson(person);
      console.log(`[QT WebSocket] ✅ Successfully connected using ${person}'s token`);
      return; // Success!
    } catch (error) {
      if (error.message === 'Rate limited') {
        // Increase delay for next person
        rateLimitDelay = Math.min(rateLimitDelay + 2000, 10000); // Max 10s
        console.warn(`[QT WebSocket] Rate limited on ${person}, increasing delay to ${rateLimitDelay}ms`);
      }
      console.warn(`[QT WebSocket] Failed with ${person}:`, error.message);
    }
  }
  throw new Error('Failed to connect with any person token');
}
```

---

### 7. **No Metrics/Monitoring Integration**

**Problem**: No integration with CloudWatch (AWS) or OCI Monitoring for observability

**Impact**: HIGH - Cannot monitor WebSocket health in production

**Solution**:
```javascript
class QuestradeWebSocket {
  constructor() {
    // ... existing code
    this.metrics = {
      connectionsAttempted: 0,
      connectionsSucceeded: 0,
      connectionsFailed: 0,
      messagesReceived: 0,
      messagesSent: 0,
      reconnectionCount: 0,
      averageLatency: 0,
      lastQuoteTime: null,
      tokenRefreshCount: 0
    };
  }

  async connect(symbols, onQuoteUpdate) {
    this.metrics.connectionsAttempted++;
    // ... existing code
  }

  handleMessage(message) {
    this.metrics.messagesReceived++;
    this.metrics.lastQuoteTime = Date.now();
    // ... existing code
  }

  // Export metrics for monitoring
  getMetrics() {
    return {
      ...this.metrics,
      uptime: Date.now() - this.startTime,
      status: this.getStatus()
    };
  }

  // Send metrics to CloudWatch/OCI Monitoring (call this every 1 minute)
  async sendMetrics() {
    try {
      await fetch(`${this.apiBaseUrl}/api/metrics/websocket`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(this.getMetrics())
      });
    } catch (error) {
      console.error('[QT WebSocket] Failed to send metrics:', error);
    }
  }
}
```

---

### 8. **No Connection Quality Monitoring**

**Problem**: No way to detect degraded connections (high latency, packet loss)

**Impact**: MEDIUM - Poor user experience on slow connections

**Solution**:
```javascript
startHealthMonitoring() {
  // ... existing health check code

  // Add latency tracking
  this.latencyCheck = setInterval(() => {
    if (!this.isConnected()) return;

    const pingStart = Date.now();
    const pingMessage = {
      type: 'ping',
      timestamp: pingStart
    };

    // Send ping and measure response time
    this.ws.send(JSON.stringify(pingMessage));

    // Expect pong response within 5 seconds
    this.lastPingTime = pingStart;
  }, 30000); // Ping every 30 seconds
}

handleMessage(message) {
  // ... existing message handling

  // Handle pong response
  if (message.type === 'pong' && this.lastPingTime) {
    const latency = Date.now() - this.lastPingTime;
    console.log(`[QT WebSocket] 🏓 Latency: ${latency}ms`);

    this.metrics.averageLatency = (this.metrics.averageLatency + latency) / 2;

    // Warn on high latency
    if (latency > 2000) {
      console.warn(`[QT WebSocket] ⚠️ High latency detected: ${latency}ms`);

      setConnectionState(prev => ({
        ...prev,
        quality: 'poor',
        latency: latency
      }));
    }
  }

  // ... rest of message handling
}
```

---

## Cloud-Specific Considerations

### AWS Deployment

#### 1. **Application Load Balancer (ALB) Configuration**
```yaml
# AWS ALB Target Group Settings
Protocol: HTTP
Port: 4005
Health Check:
  Path: /health
  Interval: 30
  Timeout: 5
  Healthy Threshold: 2
  Unhealthy Threshold: 3

Attributes:
  stickiness.enabled: true
  stickiness.type: lb_cookie
  stickiness.lb_cookie.duration_seconds: 1800  # 30 minutes
  deregistration_delay.timeout_seconds: 30
```

#### 2. **CloudWatch Alarms**
```yaml
Alarms:
  - Name: WebSocket-HighReconnectionRate
    Metric: ReconnectionCount
    Threshold: 10 per 5 minutes
    Action: SNS notification

  - Name: WebSocket-ConnectionFailures
    Metric: ConnectionsFailed
    Threshold: 5 failures in 1 minute
    Action: SNS notification + Auto-restart

  - Name: WebSocket-HighLatency
    Metric: AverageLatency
    Threshold: > 2000ms
    Action: SNS notification
```

#### 3. **Security Groups**
```yaml
Inbound Rules:
  - Port: 4005 (WebSocket Proxy)
    Protocol: TCP
    Source: ALB Security Group

  - Port: 443 (HTTPS/WSS)
    Protocol: TCP
    Source: 0.0.0.0/0 (or VPC CIDR)

Outbound Rules:
  - Port: 443 (Questrade API)
    Protocol: TCP
    Destination: 0.0.0.0/0
```

---

### OCI Deployment

#### 1. **Load Balancer Configuration**
```yaml
Backend Set:
  Policy: LEAST_CONNECTIONS  # Better for WebSocket
  Health Checker:
    Protocol: HTTP
    Port: 4005
    URL Path: /health
    Interval: 10000  # 10 seconds
    Timeout: 3000

  Session Persistence:
    Cookie Name: OCILB
    Max Age: 1800  # 30 minutes
```

#### 2. **Network Security List (NSL)**
```yaml
Ingress Rules:
  - Source: 0.0.0.0/0
    Protocol: TCP
    Destination Port: 443 (WSS)

  - Source: VCN CIDR
    Protocol: TCP
    Destination Port: 4005 (Internal WebSocket Proxy)

Egress Rules:
  - Destination: 0.0.0.0/0
    Protocol: TCP
    Destination Port: 443 (Questrade API)
```

#### 3. **Monitoring & Alerting**
```yaml
Metric Streams:
  - Name: websocket_connections
    Query: "connection_count{service='websocket-proxy'}"
    Interval: 60s

  - Name: websocket_reconnections
    Query: "reconnection_rate{service='websocket-proxy'}"
    Interval: 60s

Alarms:
  - Condition: reconnection_rate > 10 per 5min
    Action: Send notification to ONS topic
```

---

## Environment Variables for Cloud

### Frontend (Vite)
```bash
# .env.production (AWS/OCI)
VITE_API_BASE_URL=https://api.yourportfolio.com
VITE_WS_BASE_URL=wss://api.yourportfolio.com
VITE_WS_RECONNECT_MAX_ATTEMPTS=10  # More attempts in prod
VITE_WS_RECONNECT_TIMEOUT=120000   # 2 minutes max wait
VITE_ENABLE_POLLING_FALLBACK=true
VITE_POLLING_INTERVAL=30000        # 30s polling fallback
```

### Backend Services
```bash
# questrade-websocket-proxy/.env
PORT=4005
NODE_ENV=production
CORS_ORIGIN=https://yourportfolio.com
WS_PING_INTERVAL=30000
WS_CONNECTION_TIMEOUT=300000  # 5 minutes
HEALTH_CHECK_INTERVAL=10000   # 10 seconds
MAX_CONNECTIONS_PER_IP=5
ENABLE_METRICS=true
METRICS_ENDPOINT=/api/metrics
LOG_LEVEL=info  # or 'debug' for troubleshooting
```

---

## Recommended Improvements Priority

### P0 - Critical (Before Production Deploy)
1. ✅ Add environment variable configuration
2. ✅ Implement graceful degradation (polling fallback)
3. ✅ Add connection quality monitoring
4. ✅ Configure load balancer sticky sessions
5. ✅ Add metrics/monitoring integration

### P1 - High (First Week of Production)
6. ✅ Add request/response IDs for debugging
7. ✅ Implement rate limit exponential backoff
8. ✅ Add WebSocket upgrade timeout handling
9. ✅ Add connection persistence tracking
10. ✅ Set up CloudWatch/OCI monitoring dashboards

### P2 - Medium (First Month)
11. Add distributed tracing (OpenTelemetry)
12. Implement message queue for offline messages
13. Add WebSocket connection pooling
14. Implement circuit breaker pattern
15. Add automated failover testing

---

## Testing Checklist Before Production

### Connection Resilience
- [ ] Test reconnection after network interruption (unplug ethernet)
- [ ] Test reconnection after laptop sleep/wake
- [ ] Test reconnection after token expiry
- [ ] Test multi-person fallback mechanism
- [ ] Test maximum reconnection attempts (should fail gracefully)
- [ ] Test polling fallback after WebSocket failure

### Load Testing
- [ ] Test 10 concurrent users
- [ ] Test 50 concurrent users (if applicable)
- [ ] Test 100 concurrent users (if applicable)
- [ ] Measure memory usage over 24 hours
- [ ] Test connection during market open (high volatility)

### Cloud Environment
- [ ] Test through AWS ALB with sticky sessions
- [ ] Test through OCI Load Balancer
- [ ] Test from different geographic regions
- [ ] Test WebSocket upgrade timeout
- [ ] Test connection through CDN/proxy

### Error Scenarios
- [ ] Test with invalid token
- [ ] Test with rate-limited token (429)
- [ ] Test with expired token (1017)
- [ ] Test with no available persons
- [ ] Test with invalid symbol IDs
- [ ] Test backend service restart during connection

### Monitoring
- [ ] Verify CloudWatch/OCI metrics are being sent
- [ ] Verify alarms trigger on failures
- [ ] Verify logs are aggregated correctly
- [ ] Test dashboard displays connection health

---

## Estimated Implementation Time

| Priority | Task | Time Estimate |
|----------|------|---------------|
| P0 | Environment variables | 2 hours |
| P0 | Polling fallback | 4 hours |
| P0 | Connection quality monitoring | 3 hours |
| P0 | Load balancer configuration | 2 hours |
| P0 | Metrics integration | 4 hours |
| P1 | Request/response IDs | 2 hours |
| P1 | Rate limit backoff | 2 hours |
| P1 | Upgrade timeout | 1 hour |
| P1 | CloudWatch dashboards | 3 hours |
| **Total P0+P1** | | **23 hours (~3 days)** |

---

## Conclusion

**Recommendation**: Implement **P0 improvements (15 hours / 2 days)** before deploying to AWS/OCI. The current implementation will technically work, but these improvements significantly reduce production risk and improve observability.

**Risk Without P0 Improvements**:
- Medium risk of connection drops due to load balancer misconfiguration
- High risk of difficult debugging due to lack of metrics
- Medium risk of poor user experience during WebSocket failures

**Timeline Recommendation**:
1. **Day 1-2**: Implement P0 improvements
2. **Day 3**: Test in staging environment
3. **Day 4**: Deploy to production with monitoring
4. **Week 2**: Implement P1 improvements based on production metrics

---

## Additional Resources

- [AWS ALB WebSocket Support](https://docs.aws.amazon.com/elasticloadbalancing/latest/application/application-load-balancers.html#websocket-support)
- [OCI Load Balancer Session Persistence](https://docs.oracle.com/en-us/iaas/Content/Balance/Tasks/managingsessionpersistence.htm)
- [Questrade WebSocket API Docs](https://www.questrade.com/api/documentation/streaming)
- [WebSocket Best Practices](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_servers)
