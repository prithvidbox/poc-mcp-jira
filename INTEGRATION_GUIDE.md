# Jira Enhanced SSE Server - Integration Guide for Third-Party Applications

This guide shows how to integrate the **Enhanced Jira SSE Server** with third-party applications like Claude, ChatGPT, or any other AI/SaaS platform. This server provides **complete Jira project management functionality** through a **Server-Sent Events (SSE) architecture** with **11+ tools** and **25+ API endpoints**.

## 🚀 Quick Start with Docker

### 1. Deploy the SSE Server

```bash
# Clone or download the server files
git clone https://github.com/prithvidbox/poc-mcp-jira.git jira-server
cd jira-server

# Configure environment
cp .env.example .env
# Edit .env and set JWT_SECRET to a secure value

# Deploy with Docker
docker-compose up -d

# Verify deployment
curl http://localhost:3001/health
curl http://localhost:3001/tools  # NEW: Discover all 11 tools
```

### 2. Enhanced Server Endpoints

Once deployed, your SSE server provides **25+ endpoints** organized by functionality:

#### **🔍 Discovery & Health**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /health` | GET | Server health check |
| `GET /tools` | GET | **NEW!** List all 11 tools with schemas (MCP compatible) |
| `GET /sessions` | GET | View active sessions |

#### **🔐 Authentication**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /auth/token` | POST | Authenticate user and get JWT token |

#### **📡 Real-time Communication (SSE)**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /mcp/sse` | GET | Server-Sent Events endpoint |
| `POST /mcp/message` | POST | Send MCP protocol messages |

#### **🎯 Issue Management (8 endpoints)**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /jira/issues/search` | POST | Search issues using JQL |
| `GET /jira/issues/:key` | GET | Get specific issue details |
| `POST /jira/issues` | POST | Create new issue |
| `PUT /jira/issues/:key` | PUT | Update existing issue |
| `GET /jira/issues/my` | GET | Get issues assigned to current user |
| `GET /jira/issues/recent` | GET | Get recently updated issues |
| `GET /jira/issues/:key/transitions` | GET | Get available transitions for issue |
| `POST /jira/issues/:key/transitions` | POST | Transition issue to new status |

#### **📝 Collaboration (2 endpoints)**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `POST /jira/issues/:key/comments` | POST | Add comment to issue |
| `GET /jira/issues/:key/comments` | GET | Get issue comments |

#### **📊 Project Management (4 endpoints)**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /jira/projects` | GET | List all accessible projects |
| `GET /jira/projects/:key` | GET | Get specific project details |
| `GET /jira/projects/:key/issues` | GET | Get issues for specific project |
| `GET /jira/projects/:key/components` | GET | Get project components |

#### **⚙️ Metadata (3 endpoints)**
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `GET /jira/issuetypes` | GET | Get available issue types |
| `GET /jira/priorities` | GET | Get available priorities |
| `GET /jira/statuses` | GET | Get available statuses |

## 🔐 Authentication Flow

### Step 1: User Gets Jira API Token

Your users need to:
1. Go to their Jira account → Account Settings → Security → API tokens
2. Create a new API token
3. Copy the generated token
4. Note their Jira instance URL (e.g., `https://yourcompany.atlassian.net`)

### Step 2: Get JWT Token

```bash
curl -X POST http://localhost:3001/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user@example.com",
    "jiraUrl": "https://yourcompany.atlassian.net",
    "apiToken": "your-jira-api-token",
    "email": "user@example.com"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h",
  "message": "Token created successfully"
}
```

### Step 3: Use Authenticated Endpoints

All subsequent requests need these headers:
```
Authorization: Bearer <jwt-token>
x-user-id: <user-identifier>
x-jira-url: <user-jira-instance-url>
x-jira-token: <user-jira-api-token>
x-jira-email: <user-email>
Content-Type: application/json
```

## 🛠️ Tools Discovery (NEW!)

### Get All Available Tools

The server now provides a **tools discovery endpoint** that lists all 11 available tools with their complete schemas:

```bash
curl http://localhost:3001/tools
```

**Response includes:**
- **11 tools** with complete input schemas
- **Tool categories** (Issue Management, Workflow, Project Management, etc.)
- **MCP-compatible format** for easy integration

**Example response:**
```json
{
  "tools": [
    {
      "name": "search_issues",
      "description": "Search for issues in Jira using JQL (Jira Query Language)",
      "inputSchema": {
        "type": "object",
        "properties": {
          "jql": {"type": "string", "description": "JQL query string"},
          "maxResults": {"type": "number", "description": "Maximum number of results (default: 50)"}
        },
        "required": ["jql"]
      }
    }
    // ... 10 more tools
  ],
  "total": 11,
  "categories": {
    "Issue Management": ["search_issues", "get_issue", "create_issue", "update_issue"],
    "Issue Workflow": ["transition_issue", "get_issue_transitions"],
    "Project Management": ["list_projects", "get_project"],
    "Collaboration": ["add_comment"]
  }
}
```

## 📡 SSE Real-time Integration

### Server-Sent Events Connection

Connect to the SSE endpoint for real-time updates:

```javascript
// Connect to SSE endpoint
const eventSource = new EventSource('http://localhost:3001/mcp/sse', {
  headers: {
    'x-user-id': 'user@example.com',
    'x-jira-url': 'https://yourcompany.atlassian.net',
    'x-jira-token': 'your-jira-api-token',
    'x-jira-email': 'user@example.com'
  }
});

// Listen for connection events
eventSource.onopen = () => {
  console.log('Connected to Jira SSE server');
};

// Listen for messages
eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Jira update:', data);
};

// Handle errors
eventSource.onerror = (error) => {
  console.error('SSE connection error:', error);
};
```

### Send MCP Messages

Send MCP protocol messages to the server:

```javascript
async function sendMCPMessage(method, params) {
  const response = await fetch('http://localhost:3001/mcp/message', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'x-user-id': 'user@example.com',
      'x-jira-url': 'https://yourcompany.atlassian.net',
      'x-jira-token': 'your-jira-api-token',
      'x-jira-email': 'user@example.com'
    },
    body: JSON.stringify({
      method: method,
      params: params
    })
  });
  
  return await response.json();
}

// Example: Call a tool
const result = await sendMCPMessage('tools/call', {
  name: 'search_issues',
  arguments: { jql: 'project = PROJ AND status = Open', maxResults: 10 }
});
```

## 🤖 Integration Examples

### Option 1: Direct API Integration (Recommended for SSE Server)

Since this is an SSE server, the best approach is direct API integration:

```javascript
class JiraSSEClient {
  constructor(baseUrl = 'http://localhost:3001') {
    this.baseUrl = baseUrl;
    this.token = null;
    this.eventSource = null;
  }

  async authenticate(userId, jiraUrl, apiToken, email) {
    const response = await fetch(`${this.baseUrl}/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, jiraUrl, apiToken, email })
    });
    
    const data = await response.json();
    this.token = data.token;
    this.userId = userId;
    this.jiraUrl = jiraUrl;
    this.apiToken = apiToken;
    this.email = email;
    return true;
  }

  connectSSE() {
    this.eventSource = new EventSource(`${this.baseUrl}/mcp/sse`, {
      headers: {
        'Authorization': `Bearer ${this.token}`,
        'x-user-id': this.userId,
        'x-jira-url': this.jiraUrl,
        'x-jira-token': this.apiToken,
        'x-jira-email': this.email
      }
    });

    this.eventSource.onmessage = (event) => {
      console.log('Real-time update:', JSON.parse(event.data));
    };
  }

  async discoverTools() {
    const response = await fetch(`${this.baseUrl}/tools`);
    return await response.json();
  }

  async searchIssues(jql, maxResults = 50) {
    const response = await fetch(`${this.baseUrl}/jira/issues/search`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ jql, maxResults })
    });
    return await response.json();
  }

  async createIssue(projectKey, issueType, summary, description) {
    const response = await fetch(`${this.baseUrl}/jira/issues`, {
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ projectKey, issueType, summary, description })
    });
    return await response.json();
  }

  getHeaders() {
    return {
      'Authorization': `Bearer ${this.token}`,
      'x-user-id': this.userId,
      'x-jira-url': this.jiraUrl,
      'x-jira-token': this.apiToken,
      'x-jira-email': this.email,
      'Content-Type': 'application/json'
    };
  }
}
```

### Option 2: MCP Bridge for Claude Desktop

Create a bridge script for Claude Desktop integration:

```javascript
// jira-mcp-bridge.js
const fetch = require('node-fetch');

class JiraMCPBridge {
  constructor() {
    this.serverUrl = 'http://localhost:3001';
    this.jiraUrl = process.env.JIRA_URL;
    this.apiToken = process.env.JIRA_API_TOKEN;
    this.email = process.env.JIRA_EMAIL;
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
        apiToken: this.apiToken,
        email: this.email
      })
    });
    
    const data = await response.json();
    this.token = data.token;
  }

  async handleMCPRequest(request) {
    if (request.method === 'tools/list') {
      const response = await fetch(`${this.serverUrl}/tools`);
      const data = await response.json();
      return { tools: data.tools };
    }

    if (request.method === 'tools/call') {
      const { name, arguments: args } = request.params;
      
      // Map tool names to API endpoints
      const endpointMap = {
        'search_issues': '/jira/issues/search',
        'create_issue': '/jira/issues',
        'get_issue': (args) => `/jira/issues/${args.issueKey}`,
        'update_issue': (args) => `/jira/issues/${args.issueKey}`,
        'list_projects': '/jira/projects',
        'add_comment': (args) => `/jira/issues/${args.issueKey}/comments`,
        // ... add more mappings
      };

      let endpoint = endpointMap[name];
      if (typeof endpoint === 'function') {
        endpoint = endpoint(args);
      }

      if (!endpoint) {
        throw new Error(`Unknown tool: ${name}`);
      }

      const method = name.startsWith('create_') || name.startsWith('add_') ? 'POST' : 
                    name.startsWith('update_') ? 'PUT' : 'GET';

      const response = await fetch(`${this.serverUrl}${endpoint}`, {
        method: method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.token}`,
          'x-user-id': this.userId,
          'x-jira-url': this.jiraUrl,
          'x-jira-token': this.apiToken,
          'x-jira-email': this.email
        },
        body: method !== 'GET' ? JSON.stringify(args) : undefined
      });

      return await response.json();
    }
  }
}

// Use this bridge in Claude Desktop configuration
```

### Option 3: Web Browser Integration

For browser-based applications:

```html
<!DOCTYPE html>
<html>
<head>
    <title>Jira SSE Integration</title>
</head>
<body>
    <div id="status">Connecting...</div>
    <div id="tools"></div>
    <div id="results"></div>

    <script>
        class JiraWebClient {
            constructor() {
                this.baseUrl = 'http://localhost:3001';
                this.token = null;
                this.eventSource = null;
            }

            async authenticate(userId, jiraUrl, apiToken, email) {
                const response = await fetch(`${this.baseUrl}/auth/token`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ userId, jiraUrl, apiToken, email })
                });
                
                const data = await response.json();
                this.token = data.token;
                this.userId = userId;
                this.jiraUrl = jiraUrl;
                this.apiToken = apiToken;
                this.email = email;
                
                document.getElementById('status').textContent = 'Authenticated';
                return true;
            }

            async loadTools() {
                const response = await fetch(`${this.baseUrl}/tools`);
                const data = await response.json();
                
                const toolsDiv = document.getElementById('tools');
                toolsDiv.innerHTML = `<h3>Available Tools (${data.total}):</h3>`;
                
                data.tools.forEach(tool => {
                    const toolDiv = document.createElement('div');
                    toolDiv.innerHTML = `
                        <h4>${tool.name}</h4>
                        <p>${tool.description}</p>
                        <button onclick="testTool('${tool.name}')">Test</button>
                    `;
                    toolsDiv.appendChild(toolDiv);
                });
            }

            connectSSE() {
                this.eventSource = new EventSource(`${this.baseUrl}/mcp/sse`, {
                    headers: {
                        'Authorization': `Bearer ${this.token}`,
                        'x-user-id': this.userId,
                        'x-jira-url': this.jiraUrl,
                        'x-jira-token': this.apiToken,
                        'x-jira-email': this.email
                    }
                });

                this.eventSource.onmessage = (event) => {
                    const data = JSON.parse(event.data);
                    console.log('SSE Update:', data);
                };
            }
        }

        // Initialize client
        const client = new JiraWebClient();
        
        // Example usage
        async function init() {
            await client.authenticate(
                'web-user', 
                'https://yourcompany.atlassian.net',
                'your-jira-api-token',
                'user@example.com'
            );
            await client.loadTools();
            client.connectSSE();
        }
        
        init();
    </script>
</body>
</html>
```

### Python Integration

```python
import requests
import json

class JiraClient:
    def __init__(self, base_url="http://localhost:3001"):
        self.base_url = base_url
        self.token = None
        self.user_id = None
        self.jira_url = None
        self.api_token = None
        self.email = None
    
    def authenticate(self, user_id, jira_url, api_token, email):
        """Authenticate user and get JWT token"""
        response = requests.post(f"{self.base_url}/auth/token", json={
            "userId": user_id,
            "jiraUrl": jira_url,
            "apiToken": api_token,
            "email": email
        })
        
        if response.status_code == 200:
            data = response.json()
            self.token = data["token"]
            self.user_id = user_id
            self.jira_url = jira_url
            self.api_token = api_token
            self.email = email
            return True
        return False
    
    def _get_headers(self):
        """Get authentication headers"""
        return {
            "Authorization": f"Bearer {self.token}",
            "x-user-id": self.user_id,
            "x-jira-url": self.jira_url,
            "x-jira-token": self.api_token,
            "x-jira-email": self.email,
            "Content-Type": "application/json"
        }
    
    def search_issues(self, jql, max_results=50):
        """Search issues using JQL"""
        response = requests.post(
            f"{self.base_url}/jira/issues/search",
            headers=self._get_headers(),
            json={"jql": jql, "maxResults": max_results}
        )
        return response.json()
    
    def create_issue(self, project_key, issue_type, summary, description=None):
        """Create a new issue"""
        data = {
            "projectKey": project_key,
            "issueType": issue_type,
            "summary": summary
        }
        if description:
            data["description"] = description
        
        response = requests.post(
            f"{self.base_url}/jira/issues",
            headers=self._get_headers(),
            json=data
        )
        return response.json()
    
    def get_my_issues(self, max_results=50):
        """Get issues assigned to current user"""
        response = requests.get(
            f"{self.base_url}/jira/issues/my?maxResults={max_results}",
            headers=self._get_headers()
        )
        return response.json()
    
    def list_projects(self):
        """List all accessible projects"""
        response = requests.get(
            f"{self.base_url}/jira/projects",
            headers=self._get_headers()
        )
        return response.json()

# Usage example
client = JiraClient()
if client.authenticate(
    "user@example.com", 
    "https://yourcompany.atlassian.net",
    "your-jira-api-token",
    "user@example.com"
):
    issues = client.search_issues("project = PROJ AND status = Open")
    print(json.dumps(issues, indent=2))
```

### JavaScript/Node.js Integration

```javascript
class JiraClient {
    constructor(baseUrl = 'http://localhost:3001') {
        this.baseUrl = baseUrl;
        this.token = null;
        this.userId = null;
        this.jiraUrl = null;
        this.apiToken = null;
        this.email = null;
    }

    async authenticate(userId, jiraUrl, apiToken, email) {
        const response = await fetch(`${this.baseUrl}/auth/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId, jiraUrl, apiToken, email })
        });

        if (response.ok) {
            const data = await response.json();
            this.token = data.token;
            this.userId = userId;
            this.jiraUrl = jiraUrl;
            this.apiToken = apiToken;
            this.email = email;
            return true;
        }
        return false;
    }

    getHeaders() {
        return {
            'Authorization': `Bearer ${this.token}`,
            'x-user-id': this.userId,
            'x-jira-url': this.jiraUrl,
            'x-jira-token': this.apiToken,
            'x-jira-email': this.email,
            'Content-Type': 'application/json'
        };
    }

    async searchIssues(jql, maxResults = 50) {
        const response = await fetch(`${this.baseUrl}/jira/issues/search`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ jql, maxResults })
        });
        return await response.json();
    }

    async createIssue(projectKey, issueType, summary, description) {
        const response = await fetch(`${this.baseUrl}/jira/issues`, {
            method: 'POST',
            headers: this.getHeaders(),
            body: JSON.stringify({ projectKey, issueType, summary, description })
        });
        return await response.json();
    }

    async getMyIssues(maxResults = 50) {
        const response = await fetch(`${this.baseUrl}/jira/issues/my?maxResults=${maxResults}`, {
            headers: this.getHeaders()
        });
        return await response.json();
    }

    async listProjects() {
        const response = await fetch(`${this.baseUrl}/jira/projects`, {
            headers: this.getHeaders()
        });
        return await response.json();
    }
}

// Usage
const client = new JiraClient();
await client.authenticate(
    'user@example.com',
    'https://yourcompany.atlassian.net',
    'your-jira-api-token',
    'user@example.com'
);
const issues = await client.searchIssues('project = PROJ AND status = Open');
console.log(issues);
```

### cURL Examples

```bash
# 1. Authenticate
TOKEN=$(curl -s -X POST http://localhost:3001/auth/token \
  -H "Content-Type: application/json" \
  -d '{
    "userId":"user@example.com",
    "jiraUrl":"https://yourcompany.atlassian.net",
    "apiToken":"your-jira-api-token",
    "email":"user@example.com"
  }' | jq -r '.token')

# 2. Search issues
curl -X POST http://localhost:3001/jira/issues/search \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-user-id: user@example.com" \
  -H "x-jira-url: https://yourcompany.atlassian.net" \
  -H "x-jira-token: your-jira-api-token" \
  -H "x-jira-email: user@example.com" \
  -d '{"jql": "project = PROJ AND status = Open", "maxResults": 5}'

# 3. Create issue
curl -X POST http://localhost:3001/jira/issues \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-user-id: user@example.com" \
  -H "x-jira-url: https://yourcompany.atlassian.net" \
  -H "x-jira-token: your-jira-api-token" \
  -H "x-jira-email: user@example.com" \
  -d '{
    "projectKey": "PROJ",
    "issueType": "Task",
    "summary": "New task from API",
    "description": "Created via MCP server"
  }'

# 4. Get my issues
curl -X GET "http://localhost:3001/jira/issues/my?maxResults=10" \
  -H "Authorization: Bearer $TOKEN" \
  -H "x-user-id: user@example.com" \
  -H "x-jira-url: https://yourcompany.atlassian.net" \
  -H "x-jira-token: your-jira-api-token" \
  -H "x-jira-email: user@example.com"
```

## 🔧 Configuration

### Environment Variables

Create a `.env` file:

```env
# Server Configuration
PORT=3001
NODE_ENV=production
TRANSPORT_MODE=sse

# JWT Secret (CHANGE THIS!)
JWT_SECRET=your-super-secret-jwt-key-here

# Optional: Custom header names
JIRA_URL_HEADER=x-jira-url
JIRA_TOKEN_HEADER=x-jira-token
JIRA_EMAIL_HEADER=x-jira-email
USER_ID_HEADER=x-user-id
```

### Docker Deployment Options

**Option 1: Docker Compose (Recommended)**
```bash
docker-compose up -d
```

**Option 2: Docker Run**
```bash
docker build -t jira-server .
docker run -d -p 3001:3001 \
  -e JWT_SECRET=your-secret-key \
  -e NODE_ENV=production \
  jira-server
```

**Option 3: Docker with Custom Port**
```bash
docker run -d -p 8080:3001 \
  -e PORT=3001 \
  -e JWT_SECRET=your-secret-key \
  jira-server
```

## 📊 Monitoring

### Health Check
```bash
curl http://localhost:3001/health
```

Response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "activeSessions": 3,
  "mode": "multitenant-sse-only"
}
```

### Session Management
```bash
# View active sessions
curl http://localhost:3001/sessions

# Delete specific session
curl -X DELETE http://localhost:3001/sessions/{sessionId}
```

## 🚨 Troubleshooting

### Common Issues

1. **Authentication Failed**
   - Verify Jira API token is valid and has correct permissions
   - Check JWT secret is set in environment
   - Ensure headers are properly formatted
   - Verify Jira URL is correct (include https://)

2. **Connection Refused**
   - Verify server is running: `docker ps`
   - Check port mapping: `docker port <container-name>`
   - Verify firewall settings

3. **CORS Issues**
   - Server includes CORS headers by default
   - For custom domains, update CORS settings in code

4. **JQL Errors**
   - Verify JQL syntax is correct
   - Check user has permission to access projects/issues
   - Use simple queries first (e.g., "project = PROJ")

### Debug Commands

```bash
# Check if server is running
docker ps | grep jira

# View server logs
docker-compose logs -f jira-mcp-server

# Test connectivity
curl -v http://localhost:3001/health

# Check container health
docker inspect <container-id> | grep Health -A 10
```

## 🔒 Security Best Practices

1. **Change JWT Secret**: Use a strong, unique secret in production
2. **Use HTTPS**: Deploy behind a reverse proxy with SSL
3. **Rate Limiting**: Implement rate limiting for production use
4. **Network Security**: Use Docker networks to isolate containers
5. **API Token Security**: Store Jira API tokens securely
6. **Monitoring**: Set up logging and monitoring for production

## 📈 Scaling

### Horizontal Scaling
```yaml
# docker-compose.yml
services:
  jira-mcp-server:
    # ... existing config
    deploy:
      replicas: 3
  
  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
    # Load balancer configuration
```

### Production Deployment
- Use container orchestration (Kubernetes, Docker Swarm)
- Implement Redis for session storage in multi-instance deployments
- Set up proper logging and monitoring
- Use environment-specific configurations

## 📞 Support

For issues or questions:
1. Check the troubleshooting section above
2. Review server logs: `docker-compose logs -f`
3. Test with the included `client-example.html`
4. Verify Jira API token permissions

## 🎯 Use Cases

This server is perfect for:
- **AI Assistants**: Claude, ChatGPT, custom AI apps
- **SaaS Applications**: Multi-user platforms needing Jira integration
- **Automation Tools**: Zapier-like workflow automation
- **Analytics Platforms**: Project management analysis tools
- **Development Tools**: Custom Jira functionality and integrations

The multitenant architecture ensures each user's data remains isolated while providing a simple REST API for integration.

## 📋 JQL Examples

### Common JQL Queries

```bash
# Issues assigned to current user
"assignee = currentUser()"

# Open issues in specific project
"project = PROJ AND status = Open"

# Issues created this week
"created >= -1w"

# High priority bugs
"priority = High AND type = Bug"

# Issues updated today
"updated >= startOfDay()"

# Issues in specific sprint
"sprint = 'Sprint 1'"

# Issues with specific component
"component = 'Frontend'"

# Issues reported by specific user
"reporter = 'john.doe@company.com'"
```

### Advanced JQL

```bash
# Complex query with multiple conditions
"project = PROJ AND status IN (Open, 'In Progress') AND assignee = currentUser() AND priority IN (High, Critical)"

# Issues due this week
"due >= startOfWeek() AND due <= endOfWeek()"

# Recently resolved issues
"status = Resolved AND resolved >= -7d"

# Issues without assignee
"assignee is EMPTY"

# Issues with specific labels
"
