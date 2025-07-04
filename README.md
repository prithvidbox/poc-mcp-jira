# Multitenant Jira MCP Server

A **multitenant** Model Context Protocol (MCP) server for Atlassian Jira integration with support for both stdio and Server-Sent Events (SSE) transport modes. This server allows multiple users to connect with their own Jira credentials, making it perfect for SaaS applications where each user needs isolated access to their own Jira instance.

## 🌟 Key Features

- **🏢 Multitenant Architecture**: Each user connects with their own Jira URL, email, and API token
- **🔐 JWT Authentication**: Secure token-based authentication system
- **📡 Dual Transport Support**: Works with both stdio (for MCP clients) and SSE (for web applications)
- **🐳 Docker Ready**: Fully containerized with Docker and Docker Compose
- **⚡ Session Management**: Automatic session cleanup and management
- **🔄 Real-time Communication**: SSE support for real-time updates
- **📊 Health Monitoring**: Built-in health checks and session monitoring

## 🛠️ Tools Available

### Issue Management
- `search_issues` - Search for issues using JQL (Jira Query Language)
- `get_issue` - Get detailed information about a specific issue
- `create_issue` - Create new issues in Jira
- `update_issue` - Update existing issues
- `get_my_issues` - Get issues assigned to the current user
- `get_recent_issues` - Get recently updated issues

### Issue Workflow
- `transition_issue` - Transition issues to different statuses
- `get_issue_transitions` - Get available transitions for an issue

### Project Management
- `list_projects` - List all accessible Jira projects
- `get_project` - Get detailed information about a specific project

### Collaboration
- `add_comment` - Add comments to Jira issues

## 🏗️ Architecture

### Multitenant Design
- Each user provides their own Jira URL, email, and API token
- Server maintains isolated sessions per user
- Automatic session cleanup after inactivity
- JWT tokens for secure authentication

### Authentication Flow
1. User provides `userId`, `jiraUrl`, `email`, and `apiToken`
2. Server validates the credentials by testing a Jira API call
3. Server creates a JWT token and session
4. User uses the JWT token for subsequent requests
5. Server manages Jira client instances per user session

## 🚀 Quick Start

### Option 1: Docker Deployment (Recommended for Production)

1. **Clone and Setup**:
   ```bash
   git clone <repository>
   cd jira-server
   cp .env.example .env
   ```

2. **Configure Environment**:
   Edit `.env` and set your JWT secret:
   ```env
   JWT_SECRET=your-super-secret-jwt-key-change-this
   TRANSPORT_MODE=sse
   PORT=3001
   ```

3. **Deploy with Docker**:
   ```bash
   docker-compose up -d
   ```

4. **Verify Deployment**:
   ```bash
   curl http://localhost:3001/health
   ```

### Option 2: Local Development

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment**:
   ```bash
   cp .env.example .env
   # Edit .env with your settings
   ```

3. **Build and Run**:
   ```bash
   npm run build
   TRANSPORT_MODE=sse npm start
   ```

## 🤖 Connecting to Claude Desktop via SSE

This Jira MCP server runs as an **SSE (Server-Sent Events) service** in Docker and connects to Claude Desktop through HTTP endpoints, not as a direct MCP stdio server.

### Prerequisites

1. **Get Your Jira API Token**:
   - Go to your Atlassian account settings
   - Navigate to Security → API tokens
   - Create a new API token
   - Copy the token (this will be your API token)
   - Note your Jira URL (e.g., `https://yourcompany.atlassian.net`)
   - Note your email address used for Jira

2. **Start the SSE Server**:
   ```bash
   # Using Docker (recommended)
   docker-compose up -d
   
   # Verify it's running
   curl http://localhost:3001/health
   curl http://localhost:3001/tools
   ```

### Integration Options

Since this is an **SSE-based server**, you have several options to connect it with Claude Desktop:

#### Option 1: Use as Web API (Recommended)

The server provides a complete REST API that you can use with Claude Desktop through custom integrations or browser-based interactions:

1. **Direct API Usage**: Use the `/tools` endpoint to discover capabilities
2. **Authentication**: Use the `/auth/token` endpoint for JWT tokens
3. **Real-time Updates**: Connect via `/mcp/sse` for live data

#### Option 2: Create MCP Bridge (Advanced)

Create a simple MCP stdio bridge that connects to your SSE server:

```javascript
// jira-mcp-bridge.js
const fetch = require('node-fetch');

class JiraMCPBridge {
  constructor() {
    this.serverUrl = 'http://localhost:3001';
    this.jiraUrl = process.env.JIRA_URL;
    this.email = process.env.JIRA_EMAIL;
    this.apiToken = process.env.JIRA_API_TOKEN;
    this.userId = process.env.USER_ID || 'claude-user';
    this.token = null;
  }

  async initialize() {
    // Authenticate with the SSE server
    const response = await fetch(`${this.serverUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: this.userId,
        jiraUrl: this.jiraUrl,
        email: this.email,
        apiToken: this.apiToken
      })
    });
    
    const data = await response.json();
    this.token = data.token;
  }

  async callTool(name, args) {
    const response = await fetch(`${this.serverUrl}/mcp/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
        'x-user-id': this.userId,
        'x-jira-url': this.jiraUrl,
        'x-jira-api-token': this.apiToken
      },
      body: JSON.stringify({
        method: 'tools/call',
        params: { name, arguments: args }
      })
    });
    
    return await response.json();
  }
}

// Use this bridge in Claude Desktop configuration
```

#### Option 3: Browser Extension Integration

Since the server runs on `http://localhost:3001`, you can create browser-based integrations:

1. **Web Interface**: Use the provided HTML clients
2. **Browser Extension**: Create a Chrome/Firefox extension
3. **Bookmarklet**: Quick access to Jira functions

### Testing the SSE Server

Verify your server is working correctly:

```bash
# 1. Check server health
curl http://localhost:3001/health

# 2. Get available tools (11 tools)
curl http://localhost:3001/tools

# 3. Test authentication
curl -X POST http://localhost:3001/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "jiraUrl": "https://yourcompany.atlassian.net",
    "email": "your-email@company.com",
    "apiToken": "your-jira-api-token"
  }'

# 4. Test SSE connection
curl -N http://localhost:3001/mcp/sse \
  -H "x-user-id: test-user" \
  -H "x-jira-url: https://yourcompany.atlassian.net" \
  -H "x-jira-api-token: your-jira-api-token"
```

### Available Endpoints for Integration

Your running SSE server provides these endpoints:

#### **Discovery & Health**
- `GET /health` - Server health check
- `GET /tools` - List all 11 available tools with schemas
- `GET /sessions` - View active sessions

#### **Authentication**
- `POST /auth/token` - Get JWT authentication token

#### **Real-time Communication**
- `GET /mcp/sse` - Server-Sent Events endpoint
- `POST /mcp/message` - Send MCP protocol messages

#### **Direct Jira API** (15+ endpoints)
- `GET /jira/projects` - List projects
- `POST /jira/issues/search` - Search issues
- `POST /jira/issues` - Create issue
- `GET /jira/issues/:issueKey` - Get specific issue
- ... (and more endpoints)

### Integration with AI Platforms

Since this is an SSE server, you can integrate it with various AI platforms:

#### **Custom Claude Integration**
```javascript
// Example: Custom integration script
const jiraAPI = {
  baseUrl: 'http://localhost:3001',
  jiraUrl: 'https://yourcompany.atlassian.net',
  email: 'your-email@company.com',
  apiToken: 'your-jira-api-token',
  
  async searchIssues(jql) {
    const response = await fetch(`${this.baseUrl}/jira/issues/search`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-jira-url': this.jiraUrl,
        'x-jira-api-token': this.apiToken,
        'x-user-id': 'claude-user'
      },
      body: JSON.stringify({ jql, maxResults: 10 })
    });
    return await response.json();
  }
};
```

#### **ChatGPT Integration**
The server can be used with ChatGPT through custom actions or API calls.

#### **Other AI Platforms**
Any AI platform that can make HTTP requests can use this server.

### Example Usage Scenarios

Once your SSE server is running, you can:

1. **Search Jira Issues**:
   ```bash
   curl -X POST http://localhost:3001/jira/issues/search \
     -H "Content-Type: application/json" \
     -H "x-jira-url: https://yourcompany.atlassian.net" \
     -H "x-jira-api-token: your-token" \
     -H "x-user-id: user123" \
     -d '{"jql":"project = PROJ AND status = Open","maxResults":5}'
   ```

2. **Create Jira Issues**:
   ```bash
   curl -X POST http://localhost:3001/jira/issues \
     -H "Content-Type: application/json" \
     -H "x-jira-url: https://yourcompany.atlassian.net" \
     -H "x-jira-api-token: your-token" \
     -H "x-user-id: user123" \
     -d '{
       "projectKey": "PROJ",
       "issueType": "Task",
       "summary": "New task from API",
       "description": "Created via MCP server"
     }'
   ```

3. **Real-time Updates**:
   ```javascript
   const eventSource = new EventSource('http://localhost:3001/mcp/sse', {
     headers: {
       'x-user-id': 'user123',
       'x-jira-url': 'https://yourcompany.atlassian.net',
       'x-jira-api-token': 'your-token'
     }
   });
   
   eventSource.onmessage = (event) => {
     console.log('Jira update:', JSON.parse(event.data));
   };
   ```

This SSE-based architecture provides maximum flexibility for integrating with various AI platforms and custom applications while maintaining the security and isolation of the multitenant design.

## 🔐 Authentication API

### Get Authentication Token

**POST** `/auth/token`

```json
{
  "userId": "unique-user-identifier",
  "jiraUrl": "https://yourcompany.atlassian.net",
  "email": "your-email@company.com",
  "apiToken": "your-jira-api-token"
}
```

**Response**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "sessionId": "session_1234567890_abcdef",
  "expiresIn": "24h",
  "message": "Token created successfully"
}
```

## 🌐 API Endpoints

### SSE Transport Mode

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/auth/token` | POST | Get JWT authentication token |
| `/mcp/sse` | GET | Server-Sent Events endpoint |
| `/mcp/message` | POST | Send MCP protocol messages |
| `/health` | GET | Health check endpoint |
| `/tools` | GET | List all available tools with schemas |
| `/sessions` | GET | View active sessions |
| `/sessions/:id` | DELETE | Delete specific session |

### Direct Jira API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/jira/projects` | GET | List all accessible projects |
| `/jira/issues/search` | POST | Search issues using JQL |
| `/jira/issues` | POST | Create new issue |
| `/jira/issues/:issueKey` | GET | Get specific issue details |

### Required Headers for Authenticated Requests

```
Authorization: Bearer <jwt-token>
x-user-id: <user-identifier>
x-jira-url: <jira-instance-url>
x-jira-api-token: <user-jira-api-token>
Content-Type: application/json
```

## 💻 Client Integration

### Web Application Example

```javascript
// 1. Authenticate
const authResponse = await fetch('http://localhost:3001/auth/token', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: 'user123',
    jiraUrl: 'https://yourcompany.atlassian.net',
    email: 'user@company.com',
    apiToken: 'your-jira-api-token'
  })
});
const { token } = await authResponse.json();

// 2. Connect via SSE
const eventSource = new EventSource('http://localhost:3001/mcp/sse', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'x-user-id': 'user123',
    'x-jira-url': 'https://yourcompany.atlassian.net',
    'x-jira-api-token': 'your-jira-api-token'
  }
});

// 3. Send MCP messages
const response = await fetch('http://localhost:3001/mcp/message', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    'x-user-id': 'user123',
    'x-jira-url': 'https://yourcompany.atlassian.net',
    'x-jira-api-token': 'your-jira-api-token'
  },
  body: JSON.stringify({
    method: 'tools/call',
    params: {
      name: 'search_issues',
      arguments: { jql: 'project = PROJ AND status = Open', maxResults: 10 }
    }
  })
});
```

### SaaS Application Integration

For SaaS applications, you can integrate this MCP server as a microservice:

```javascript
class JiraMCPClient {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.tokens = new Map(); // Store tokens per user
  }

  async authenticateUser(userId, jiraUrl, email, apiToken) {
    const response = await fetch(`${this.baseUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, jiraUrl, email, apiToken })
    });
    
    const { token } = await response.json();
    this.tokens.set(userId, { token, jiraUrl, email, apiToken });
    return token;
  }

  async callTool(userId, toolName, args) {
    const userAuth = this.tokens.get(userId);
    if (!userAuth) throw new Error('User not authenticated');

    const response = await fetch(`${this.baseUrl}/mcp/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userAuth.token}`,
        'x-user-id': userId,
        'x-jira-url': userAuth.jiraUrl,
        'x-jira-api-token': userAuth.apiToken
      },
      body: JSON.stringify({
        method: 'tools/call',
        params: { name: toolName, arguments: args }
      })
    });

    return await response.json();
  }
}

// Usage in your SaaS app
const mcpClient = new JiraMCPClient();

// When user connects their Jira
await mcpClient.authenticateUser('user123', jiraUrl, email, apiToken);

// Use Jira functionality
const issues = await mcpClient.callTool('user123', 'search_issues', {
  jql: 'assignee = currentUser() AND status = Open',
  maxResults: 10
});
```

## 🐳 Docker Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `PORT` | Server port | `3001` | No |
| `TRANSPORT_MODE` | Transport mode: `stdio` or `sse` | `sse` | No |
| `JWT_SECRET` | JWT signing secret | `your-jwt-secret-change-in-production` | **Yes** |
| `API_KEY_HEADER` | Custom API key header name | `x-jira-api-token` | No |
| `USER_ID_HEADER` | Custom user ID header name | `x-user-id` | No |
| `JIRA_URL_HEADER` | Custom Jira URL header name | `x-jira-url` | No |
| `NODE_ENV` | Node environment | `development` | No |

### Docker Commands

```bash
# Build and run with Docker Compose
docker-compose up -d

# View logs
docker-compose logs -f

# Scale the service
docker-compose up -d --scale jira-mcp-server=3

# Stop services
docker-compose down

# Build custom image
docker build -t my-jira-mcp .

# Run with custom settings
docker run -p 3001:3001 \
  -e JWT_SECRET=my-secret \
  -e TRANSPORT_MODE=sse \
  my-jira-mcp
```

## 🔧 Session Management

### Automatic Cleanup
- Sessions expire after 1 hour of inactivity
- Cleanup runs every 5 minutes
- Memory-efficient session storage

### Manual Session Management

```bash
# View all active sessions
curl http://localhost:3001/sessions

# Delete specific session
curl -X DELETE http://localhost:3001/sessions/{sessionId}
```

## 🏥 Monitoring & Health Checks

### Health Endpoint
```bash
curl http://localhost:3001/health
```

**Response**:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "activeSessions": 5,
  "mode": "multitenant-sse-only"
}
```

### Session Monitoring
```bash
curl http://localhost:3001/sessions
```

**Response**:
```json
{
  "sessions": [
    {
      "sessionId": "session_1234567890_abcdef",
      "userId": "user123",
      "jiraUrl": "https://company.atlassian.net",
      "lastAccess": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 1
}
```

## 🔒 Security Considerations

### Production Deployment
- **Change JWT Secret**: Use a strong, unique JWT secret
- **HTTPS Only**: Deploy behind HTTPS in production
- **Rate Limiting**: Implement rate limiting for API endpoints
- **Input Validation**: Validate all user inputs
- **Logging**: Implement comprehensive logging for audit trails

### API Token Security
- Users' Jira API tokens are stored in memory only
- Sessions are automatically cleaned up
- No persistent storage of sensitive data
- JWT tokens have expiration times

## 🧪 Testing

### Using cURL

```bash
# 1. Get authentication token
TOKEN=$(curl -s -X POST http://localhost:3001/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user",
    "jiraUrl": "https://yourcompany.atlassian.net",
    "email": "your-email@company.com",
    "apiToken": "your-jira-api-token"
  }' | jq -r '.token')

# 2. Search issues
curl -X POST http://localhost:3001/mcp/message \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-user-id: test-user" \
  -H "x-jira-url: https://yourcompany.atlassian.net" \
  -H "x-jira-api-token: your-jira-api-token" \
  -d '{
    "method": "tools/call",
    "params": {
      "name": "search_issues",
      "arguments": {"jql": "project = PROJ AND status = Open", "maxResults": 5}
    }
  }'
```

## 🚨 Troubleshooting

### Common Issues

1. **Authentication Errors**
   - Verify Jira URL is correct (include https://)
   - Check API token is valid and not expired
   - Ensure email matches the Jira account
   - Verify JWT secret is set correctly

2. **Connection Issues**
   - Verify server is running on correct port
   - Check CORS settings for web clients
   - Ensure Docker containers are healthy

3. **Session Issues**
   - Check session timeout settings
   - Verify user ID consistency
   - Monitor session cleanup logs

### Debug Mode

Enable debug logging:
```env
NODE_ENV=development
```

View detailed logs:
```bash
docker-compose logs -f jira-mcp-server
```

## 📈 Scaling

### Horizontal Scaling
- Stateless design allows multiple instances
- Use load balancer for distribution
- Consider Redis for session storage in large deployments

### Performance Optimization
- Implement connection pooling
- Add caching layer for frequent requests
- Monitor memory usage and session counts

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement your changes
4. Add tests for new functionality
5. Update documentation
6. Submit a pull request

## 📄 License

MIT License - see LICENSE file for details

---

## 🎯 Perfect for SaaS Applications

This multitenant MCP server is specifically designed for SaaS applications where:
- Multiple users need Jira integration
- Each user has their own Jira instance
- Secure, isolated access is required
- Real-time communication is needed
- Scalability and reliability are important

The server handles all the complexity of managing multiple Jira connections while providing a clean, secure API for your application to consume.
