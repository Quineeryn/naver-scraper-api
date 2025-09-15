# 🛍️ Naver Scraper API

A high-performance, enterprise-grade REST API for scraping Naver Shopping search results with advanced anti-detection capabilities.

## ✨ Key Features

- **🔍 RESTful API** - Simple endpoint: `/naver?query=iphone&pageSize=50&cursor=1`
- **🍪 Smart Cookie Management** - Automated session cookie harvesting and rotation
- **🔄 Proxy Rotation** - Built-in support for Zyte and custom proxy pools
- **🥷 Stealth Mode** - Advanced fingerprint evasion with puppeteer-extra stealth plugin
- **⚡ High Performance** - Request throttling, intelligent retries, and circuit breaker patterns
- **🧪 Load Testing Ready** - Built-in performance testing with autocannon integration
- **📊 Production Ready** - Comprehensive logging, caching, and error handling

## 🏗️ Architecture

Built with modern Node.js stack:
- **TypeScript** for type safety and developer experience
- **Express.js** for robust API framework
- **Puppeteer** with stealth plugin for browser automation
- **Axios** with proxy support for HTTP requests

## 🚀 Quick Start

### 1. Installation

```bash
git clone https://github.com/your-username/naver-scraper-api.git
cd naver-scraper-api
npm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

Configure your `.env` file:

```env
# Proxy Configuration
PROXIES=proxy1:port:user:pass,proxy2:port:user:pass

# Browser Headers (Get from DevTools → Network → Request Headers)
NAVER_USER_AGENT=Mozilla/5.0 (Windows NT 10.0; Win64; x64)...
NAVER_REFERER=https://search.shopping.naver.com/ns/search?query=iphone

# Cookie (Leave empty to use auto-harvested cookies)
NAVER_COOKIE=
```

### 3. Cookie Harvesting

Naver requires authenticated session cookies. Use our automated harvester:

```bash
# Interactive mode (browser opens, manual login possible)
HEADLESS=false npm run harvest

# Automated mode (fully headless)
HEADLESS=true npm run harvest
```

**Output files:**
- `session.cookie` - Formatted cookie string for the scraper
- `cookies.json` - Complete cookie data for debugging

### 4. Launch the API

```bash
# Production build
npm run build
npm start

# Development mode with hot reload
npm run dev
```

Your API will be available at `http://localhost:3000`

## 📡 API Usage

### Query-based Search

```bash
curl "http://localhost:3000/naver?query=iphone&pageSize=50&cursor=1"
```

### Raw URL Mode

```bash
curl "http://localhost:3000/naver?url=https%3A%2F%2Fsearch.shopping.naver.com%2Fns%2Fv1%2Fsearch%2Fpaged-composite-cards%3Fcursor%3D1%26pageSize%3D50%26query%3Diphone"
```

### Parameters

| Parameter | Type | Description | Default |
|-----------|------|-------------|---------|
| `query` | string | Search term for Naver Shopping | - |
| `pageSize` | number | Number of results per page | 50 |
| `cursor` | number | Page number for pagination | 1 |
| `url` | string | Complete Naver URL (URL-encoded) | - |

## 🧪 Performance Testing

### Load Testing

Run comprehensive load tests with configurable parameters:

```bash
# Basic load test
npx tsx load-test.ts

# Custom configuration
TOTAL_REQUESTS=2000 CONCURRENCY=50 TIMEOUT_MS=10000 npx tsx load-test.ts
```

**Environment Variables:**
- `TOTAL_REQUESTS` - Total number of requests to send
- `CONCURRENCY` - Number of concurrent connections
- `TIMEOUT_MS` - Request timeout in milliseconds

### Soak Testing

Extended stress testing with mixed query patterns:

```bash
./scripts/soak-test.sh http://localhost:3000
```

**Test Characteristics:**
- 📊 80% fixed queries, 20% random queries
- ⏱️ Up to 1-hour duration
- 📈 Gradual load ramping
- 📝 Detailed logging (`soak-*.log` files)

## 🔧 How It Works

### Request Flow

1. **API Request** → Client sends request to `/naver` endpoint
2. **Cookie Loading** → System loads session cookies from `session.cookie`
3. **Header Spoofing** → Applies realistic browser headers and user-agent rotation
4. **Proxy Routing** → Routes request through available proxy pool
5. **Stealth Execution** → Applies evasion techniques:
   - Puppeteer stealth plugin
   - Random delays and throttling
   - Circuit breaker with exponential backoff
   - TTL caching for optimization
6. **Response Proxy** → Returns clean JSON response to client

### Anti-Detection Features

- **Browser Fingerprinting** - Mimics real browser characteristics
- **Request Patterns** - Randomized delays and realistic timing
- **Header Rotation** - Dynamic user-agent and referer switching
- **Proxy Management** - Automatic IP rotation and health checking
- **Circuit Breaking** - Prevents cascade failures and rate limiting

## 📁 Project Structure

```
naver-scraper-api/
├── 📁 scripts/
│   └── soak-test.sh              # Extended stress testing
├── 📁 src/
│   ├── 📁 routes/
│   │   └── naver.route.ts        # API route handlers
│   ├── 📁 services/
│   │   └── scraper.service.ts    # Core scraping logic
│   ├── 📁 utils/
│   │   ├── cache.ts              # TTL caching system
│   │   ├── circuitBreaker.ts     # Failure protection
│   │   ├── delay.ts              # Random delay utilities
│   │   ├── proxy.ts              # Proxy pool management
│   │   ├── semaphore.ts          # Concurrency control
│   │   ├── userAgent.ts          # User-agent rotation
│   │   └── cookie-harvester.ts   # Automated cookie collection
│   └── index.ts                  # Express server entry point
├── 📁 test/
│   └── load-test.ts              # Performance testing suite
├── 📄 .env.example               # Environment template
├── 📄 session.cookie             # Harvested cookie data
├── 📄 cookies.json               # Full cookie dump
├── 📄 package.json
└── 📄 tsconfig.json
```

## 🔧 Configuration

### Proxy Setup

**Proxy:**
```env
Format: http://user:pass@host:port
```

### Performance Tuning

Key configuration options in your code:

- **Circuit Breaker**: Failure threshold and recovery timing
- **Cache TTL**: Response caching duration
- **Concurrency**: Maximum parallel requests
- **Retry Logic**: Backoff strategy and attempt limits

## 📊 Monitoring & Logging

The API provides comprehensive logging for:

- 🔍 Request/response cycles
- 🔄 Proxy rotation and health
- 🍪 Cookie refresh cycles
- ⚡ Performance metrics
- 🚨 Error tracking and circuit breaker events

Log files are automatically generated during soak testing for performance analysis.

Built with ❤️
