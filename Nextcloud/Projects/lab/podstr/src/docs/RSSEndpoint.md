# RSS Feed Server Endpoint

This document describes the new server-side RSS feed endpoint that makes `/rss.xml` accessible to command-line tools like `wget` and `curl`.

## Overview

The new implementation provides a proper server-side endpoint for the RSS feed, replacing the previous React component approach. This ensures compatibility with all RSS readers, podcast directories, and command-line tools.

## Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Client Tools  │───▶│  Express Server  │───▶│  RSS Endpoint   │
│ (curl, wget,    │    │  (src/server.ts) │    │  (/rss.xml)     │
│  podcast apps)  │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                │
                                ▼
                       ┌─────────────────┐
                       │   Static Files  │
                       │   (dist/rss.xml)│
                       └─────────────────┘
```

## Features

### ✅ **Command-Line Tool Compatibility**
- **curl**: `curl https://podstr.example/rss.xml`
- **wget**: `wget https://podstr.example/rss.xml`
- **HTTP clients**: Any standard HTTP client library

### ✅ **Proper HTTP Headers**
```http
HTTP/1.1 200 OK
Content-Type: application/rss+xml; charset=utf-8
Cache-Control: public, max-age=300, stale-while-revalidate=600
Last-Modified: Mon, 04 Aug 2025 03:19:22 GMT
```

### ✅ **Caching Strategy**
- **Browser Cache**: 5 minutes (max-age=300)
- **Stale Cache**: 10 minutes stale-while-revalidate
- **CDN Friendly**: Proper cache headers for distribution
- **ETag Support**: Conditional requests supported

### ✅ **Production Optimization**
- **Static Files**: Pre-generated RSS files in production
- **Fast Delivery**: Direct file serving without processing
- **Fallback Support**: Dynamic generation if static file unavailable
- **Health Monitoring**: Built-in health check endpoint

## Endpoints

### 1. **Primary RSS Feed**
```
GET /rss.xml
```

**Response:**
```http
HTTP/1.1 200 OK
Content-Type: application/rss+xml; charset=utf-8
Cache-Control: public, max-age=300, stale-while-revalidate=600
Last-Modified: Mon, 04 Aug 2025 03:19:22 GMT

<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>PODSTR Podcast</title>
    <description>A Nostr-powered podcast...</description>
    <!-- Full RSS content -->
  </channel>
</rss>
```

### 2. **Health Check Endpoint**
```
GET /rss-health
```

**Response:**
```json
{
  "status": "ok",
  "endpoint": "/rss.xml",
  "timestamp": "2025-08-04T03:19:22.210Z",
  "environment": "production",
  "rssFileExists": true,
  "rssStats": {
    "size": 2157,
    "lastModified": "2025-08-04T03:19:22.000Z"
  },
  "accessible": true,
  "headers": {
    "Content-Type": "application/rss+xml; charset=utf-8",
    "Cache-Control": "public, max-age=300, stale-while-revalidate=600"
  }
}
```

## Usage Examples

### **Command-Line Tools**

#### **curl**
```bash
# Basic request
curl https://podstr.example/rss.xml

# Save to file
curl -o podcast.xml https://podstr.example/rss.xml

# Follow redirects
curl -L https://podstr.example/rss.xml

# Show headers
curl -I https://podstr.example/rss.xml

# Check if modified since
curl -z "Mon, 04 Aug 2025 03:19:22 GMT" https://podstr.example/rss.xml
```

#### **wget**
```bash
# Basic download
wget https://podstr.example/rss.xml

# Continue interrupted download
wget -c https://podstr.example/rss.xml

# Show headers
wget -S https://podstr.example/rss.xml

# Timestamp-based download
wget -N https://podstr.example/rss.xml
```

#### **HTTPie**
```bash
# Pretty-printed response
http https://podstr.example/rss.xml

# Show headers
http --headers https://podstr.example/rss.xml

# Follow redirects
http --follow https://podstr.example/rss.xml
```

### **Programming Languages**

#### **Python**
```python
import requests

# Fetch RSS feed
response = requests.get('https://podstr.example/rss.xml')
response.raise_for_status()

print(f"Content-Type: {response.headers['content-type']}")
print(f"Content-Length: {response.headers['content-length']}")
print(f"RSS Feed: {response.text[:100]}...")
```

#### **JavaScript/Node.js**
```javascript
// Fetch API
const response = await fetch('https://podstr.example/rss.xml');
const rssContent = await response.text();

console.log('Content-Type:', response.headers.get('content-type'));
console.log('RSS Feed:', rssContent.substring(0, 100) + '...');

// Axios
const axios = require('axios');
const response = await axios.get('https://podstr.example/rss.xml');
console.log(response.data);
```

#### **PHP**
```php
<?php
// cURL
$ch = curl_init('https://podstr.example/rss.xml');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HEADER, false);
$rssContent = curl_exec($ch);
curl_close($ch);

echo "RSS Feed: " . substr($rssContent, 0, 100) . "...\n";

// file_get_contents
$rssContent = file_get_contents('https://podstr.example/rss.xml');
echo $rssContent;
?>
```

### **Podcast Directories**

#### **Apple Podcasts**
```bash
# Submit to Apple Podcasts
# The RSS feed at /rss.xml is fully compatible
curl -I https://podstr.example/rss.xml
```

#### **Spotify for Podcasters**
```bash
# Spotify can consume the RSS feed directly
wget https://podstr.example/rss.xml -O podcast-feed.xml
```

#### **Google Podcasts**
```bash
# Google Podcasts Manager
curl -s https://podstr.example/rss.xml | xmllint --format -
```

## Server Implementation

### **Development Mode**
```typescript
// Dynamic generation for development
app.get('/rss.xml', async (req, res) => {
  // Generate RSS on the fly
  const rssContent = await generateRSSFeed(episodes);
  res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
  res.send(rssContent);
});
```

### **Production Mode**
```typescript
// Static file serving for production
app.get('/rss.xml', async (req, res) => {
  try {
    const rssPath = path.resolve('dist', 'rss.xml');
    const stats = await fs.stat(rssPath);
    
    res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.setHeader('Last-Modified', stats.mtime.toUTCString());
    res.setHeader('Cache-Control', 'public, max-age=300');
    
    res.sendFile(rssPath);
  } catch (error) {
    // Fallback to dynamic generation
    const rssContent = await generateRSSFeed([]);
    res.send(rssContent);
  }
});
```

### **Error Handling**
```typescript
// Graceful error handling
app.get('/rss.xml', async (req, res) => {
  try {
    // Try to serve RSS feed
    const rssContent = await getRSSFeed();
    res.send(rssContent);
  } catch (error) {
    console.error('RSS generation error:', error);
    
    // Return minimal valid RSS feed
    res.status(200).setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
    res.send(`<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>PODSTR Podcast</title>
    <description>Temporarily unavailable</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
  </channel>
</rss>`);
  }
});
```

## Build Process

### **RSS Generation**
```bash
# Build includes RSS generation
npm run build

# This runs:
# 1. vite build (React app)
# 2. cp dist/index.html dist/404.html
# 3. tsx scripts/build-rss.ts (RSS feed)
```

### **Generated Files**
```
dist/
├── index.html          # React app
├── 404.html           # Error page
├── rss.xml            # RSS feed
├── rss-health.json    # Health check data
├── .nojekyll          # GitHub Pages compatibility
└── assets/            # JS/CSS assets
```

## Performance Optimization

### **Caching Headers**
```http
Cache-Control: public, max-age=300, stale-while-revalidate=600
ETag: "33a64df551425fcc55e4d42a148795d9"
Last-Modified: Mon, 04 Aug 2025 03:19:22 GMT
```

### **Conditional Requests**
```bash
# Clients can send conditional requests
curl -H "If-None-Match: \"33a64df551425fcc55e4d42a148795d9\"" \
     https://podstr.example/rss.xml

# Returns 304 Not Modified if unchanged
```

### **CDN Integration**
The RSS endpoint is CDN-friendly with proper cache headers:
- **Edge Caching**: Can be cached at CDN edge locations
- **Origin Shield**: Reduces load on origin server
- **Global Delivery**: Fast access worldwide

## Monitoring and Debugging

### **Health Check**
```bash
# Check RSS endpoint health
curl https://podstr.example/rss-health

# Response includes status, file info, and accessibility
```

### **Log Monitoring**
```typescript
// Server logs RSS access
console.log(`RSS feed requested by ${req.ip}`);
console.log(`User-Agent: ${req.get('User-Agent')}`);
console.log(`Response size: ${rssContent.length} bytes`);
```

### **Error Tracking**
```typescript
// Track RSS generation errors
app.get('/rss.xml', async (req, res) => {
  try {
    await serveRSSFeed(req, res);
  } catch (error) {
    console.error('RSS feed error:', error);
    // Track error with monitoring service
    trackError('rss-generation', error);
  }
});
```

## Testing

### **Automated Testing**
```typescript
// Test script for RSS endpoint
describe('RSS Endpoint', () => {
  it('should return valid RSS XML', async () => {
    const response = await fetch('/rss.xml');
    expect(response.headers.get('content-type')).toContain('application/rss+xml');
    expect(await response.text()).toMatch(/<rss version="2.0">/);
  });

  it('should support conditional requests', async () => {
    const response1 = await fetch('/rss.xml');
    const etag = response1.headers.get('etag');
    
    const response2 = await fetch('/rss.xml', {
      headers: { 'If-None-Match': etag }
    });
    
    expect(response2.status).toBe(304);
  });
});
```

### **Manual Testing**
```bash
# Test script
npm run test-rss

# Manual curl tests
curl -I https://localhost:8080/rss.xml
curl -s https://localhost:8080/rss-health | jq .
```

## Deployment

### **Development Server**
```bash
# Start development server with RSS endpoint
npm run dev
# Server runs on http://localhost:8080
# RSS feed at http://localhost:8080/rss.xml
```

### **Production Server**
```bash
# Build and start production server
npm run build
npm start
# RSS feed served from static files
```

### **Docker Deployment**
```dockerfile
FROM node:18-alpine

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build

EXPOSE 8080
CMD ["npm", "start"]
```

## Security Considerations

### **Content Security**
- **XML External Entities (XXE)**: Disabled by default
- **XML Injection**: Proper escaping of all content
- **Content-Type**: Strict `application/rss+xml` header

### **Rate Limiting**
```typescript
// Optional rate limiting for RSS endpoint
import rateLimit from 'express-rate-limit';

const rssRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many RSS feed requests, please try again later.'
});

app.get('/rss.xml', rssRateLimit, serveRSSFeed);
```

### **Access Control**
```typescript
// Optional access control
app.get('/rss.xml', (req, res, next) => {
  // Allow all access by default
  // Add restrictions if needed
  next();
});
```

## Conclusion

The new RSS feed server endpoint provides:

- ✅ **Universal Compatibility**: Works with curl, wget, and all RSS readers
- ✅ **Performance Optimized**: Static files with proper caching
- ✅ **Production Ready**: Health checks, error handling, monitoring
- ✅ **Standards Compliant**: Valid RSS 2.0 + Podcasting 2.0
- ✅ **Easy Integration**: Simple HTTP GET endpoint

This implementation ensures that the RSS feed is accessible to any client, from command-line tools to sophisticated podcast platforms, while maintaining high performance and reliability.