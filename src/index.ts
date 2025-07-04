#!/usr/bin/env node

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import express from 'express';
import cors from 'cors';
import jwt from 'jsonwebtoken';
import fetch from 'node-fetch';
import { config } from 'dotenv';

// Load environment variables
config();

const PORT = process.env.PORT || 3001;
const JWT_SECRET = process.env.JWT_SECRET || 'your-jwt-secret-change-in-production';
const TRANSPORT_MODE = process.env.TRANSPORT_MODE || 'sse';
const API_KEY_HEADER = process.env.API_KEY_HEADER || 'x-jira-api-token';
const USER_ID_HEADER = process.env.USER_ID_HEADER || 'x-user-id';
const JIRA_URL_HEADER = process.env.JIRA_URL_HEADER || 'x-jira-url';
const SESSION_TIMEOUT = parseInt(process.env.SESSION_TIMEOUT || '3600000'); // 1 hour

interface JiraSession {
  sessionId: string;
  userId: string;
  jiraUrl: string;
  apiToken: string;
  email: string;
  lastAccess: Date;
}

interface JiraIssue {
  id: string;
  key: string;
  fields: {
    summary: string;
    description?: any;
    status: {
      name: string;
      statusCategory: {
        name: string;
      };
    };
    priority?: {
      name: string;
    };
    assignee?: {
      displayName: string;
      emailAddress: string;
    };
    reporter?: {
      displayName: string;
      emailAddress: string;
    };
    project: {
      key: string;
      name: string;
    };
    issuetype: {
      name: string;
    };
    created: string;
    updated: string;
  };
}

interface JiraProject {
  id: string;
  key: string;
  name: string;
  projectTypeKey: string;
  lead?: {
    displayName: string;
    emailAddress: string;
  };
}

// Session management
const sessions = new Map<string, JiraSession>();

// Cleanup expired sessions
setInterval(() => {
  const now = new Date();
  for (const [sessionId, session] of sessions.entries()) {
    if (now.getTime() - session.lastAccess.getTime() > SESSION_TIMEOUT) {
      sessions.delete(sessionId);
      console.log(`Cleaned up expired session: ${sessionId}`);
    }
  }
}, 5 * 60 * 1000); // Check every 5 minutes

// Jira API helper class
class JiraClient {
  private baseUrl: string;
  private email: string;
  private apiToken: string;

  constructor(jiraUrl: string, email: string, apiToken: string) {
    this.baseUrl = jiraUrl.endsWith('/') ? jiraUrl.slice(0, -1) : jiraUrl;
    this.email = email;
    this.apiToken = apiToken;
  }

  private getAuthHeaders() {
    const auth = Buffer.from(`${this.email}:${this.apiToken}`).toString('base64');
    return {
      'Authorization': `Basic ${auth}`,
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };
  }

  async searchIssues(jql: string, maxResults: number = 50): Promise<{ issues: JiraIssue[], total: number }> {
    const url = `${this.baseUrl}/rest/api/3/search`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        jql,
        maxResults,
        fields: ['summary', 'description', 'status', 'priority', 'assignee', 'reporter', 'project', 'issuetype', 'created', 'updated']
      })
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    return {
      issues: data.issues || [],
      total: data.total || 0
    };
  }

  async getIssue(issueKey: string): Promise<JiraIssue> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as JiraIssue;
  }

  async createIssue(projectKey: string, issueType: string, summary: string, description?: string, priority?: string): Promise<JiraIssue> {
    const url = `${this.baseUrl}/rest/api/3/issue`;
    const issueData: any = {
      fields: {
        project: { key: projectKey },
        issuetype: { name: issueType },
        summary: summary
      }
    };

    if (description) {
      issueData.fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: description
              }
            ]
          }
        ]
      };
    }

    if (priority) {
      issueData.fields.priority = { name: priority };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(issueData)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json() as any;
    return await this.getIssue(result.key);
  }

  async updateIssue(issueKey: string, fields: any): Promise<void> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ fields })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }

  async transitionIssue(issueKey: string, transitionId: string): Promise<void> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        transition: { id: transitionId }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }

  async getProjects(): Promise<JiraProject[]> {
    const url = `${this.baseUrl}/rest/api/3/project`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as JiraProject[];
  }

  async getProject(projectKey: string): Promise<JiraProject> {
    const url = `${this.baseUrl}/rest/api/3/project/${projectKey}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    return await response.json() as JiraProject;
  }

  async addComment(issueKey: string, comment: string): Promise<void> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/comment`;
    const response = await fetch(url, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        body: {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: comment
                }
              ]
            }
          ]
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Jira API error: ${response.status} ${response.statusText} - ${errorText}`);
    }
  }

  async getIssueTransitions(issueKey: string): Promise<any[]> {
    const url = `${this.baseUrl}/rest/api/3/issue/${issueKey}/transitions`;
    const response = await fetch(url, {
      method: 'GET',
      headers: this.getAuthHeaders()
    });

    if (!response.ok) {
      throw new Error(`Jira API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json() as any;
    return data.transitions || [];
  }
}

// MCP Tools Definition
const JIRA_TOOLS = [
  {
    name: 'search_issues',
    description: 'Search for issues in Jira using JQL (Jira Query Language)',
    inputSchema: {
      type: 'object',
      properties: {
        jql: {
          type: 'string',
          description: 'JQL query string (e.g., "project = PROJ AND status = Open")'
        },
        maxResults: {
          type: 'number',
          description: 'Maximum number of results to return (default: 50)'
        }
      },
      required: ['jql']
    }
  },
  {
    name: 'get_issue',
    description: 'Get detailed information about a specific Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'Jira issue key (e.g., "PROJ-123")'
        }
      },
      required: ['issueKey']
    }
  },
  {
    name: 'create_issue',
    description: 'Create a new issue in Jira',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: {
          type: 'string',
          description: 'Project key where the issue will be created'
        },
        issueType: {
          type: 'string',
          description: 'Issue type (e.g., "Bug", "Task", "Story")'
        },
        summary: {
          type: 'string',
          description: 'Issue summary/title'
        },
        description: {
          type: 'string',
          description: 'Issue description (optional)'
        },
        priority: {
          type: 'string',
          description: 'Issue priority (e.g., "High", "Medium", "Low") (optional)'
        }
      },
      required: ['projectKey', 'issueType', 'summary']
    }
  },
  {
    name: 'update_issue',
    description: 'Update an existing Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'Jira issue key to update'
        },
        summary: {
          type: 'string',
          description: 'Updated summary (optional)'
        },
        description: {
          type: 'string',
          description: 'Updated description (optional)'
        },
        priority: {
          type: 'string',
          description: 'Updated priority (optional)'
        }
      },
      required: ['issueKey']
    }
  },
  {
    name: 'transition_issue',
    description: 'Transition an issue to a different status',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'Jira issue key to transition'
        },
        transitionId: {
          type: 'string',
          description: 'Transition ID (use get_issue_transitions to find available transitions)'
        }
      },
      required: ['issueKey', 'transitionId']
    }
  },
  {
    name: 'get_issue_transitions',
    description: 'Get available transitions for an issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'Jira issue key'
        }
      },
      required: ['issueKey']
    }
  },
  {
    name: 'list_projects',
    description: 'List all accessible Jira projects',
    inputSchema: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_project',
    description: 'Get detailed information about a specific project',
    inputSchema: {
      type: 'object',
      properties: {
        projectKey: {
          type: 'string',
          description: 'Project key'
        }
      },
      required: ['projectKey']
    }
  },
  {
    name: 'add_comment',
    description: 'Add a comment to a Jira issue',
    inputSchema: {
      type: 'object',
      properties: {
        issueKey: {
          type: 'string',
          description: 'Jira issue key'
        },
        comment: {
          type: 'string',
          description: 'Comment text'
        }
      },
      required: ['issueKey', 'comment']
    }
  },
  {
    name: 'get_my_issues',
    description: 'Get issues assigned to the current user',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of results (default: 50)'
        }
      }
    }
  },
  {
    name: 'get_recent_issues',
    description: 'Get recently updated issues',
    inputSchema: {
      type: 'object',
      properties: {
        maxResults: {
          type: 'number',
          description: 'Maximum number of results (default: 50)'
        }
      }
    }
  }
];

// Helper function to get Jira client from session
function getJiraClient(sessionId: string): JiraClient {
  const session = sessions.get(sessionId);
  if (!session) {
    throw new McpError(ErrorCode.InvalidRequest, 'Invalid or expired session');
  }
  
  session.lastAccess = new Date();
  return new JiraClient(session.jiraUrl, session.email, session.apiToken);
}

// MCP Server setup
const server = new Server(
  {
    name: 'jira-mcp-server',
    version: '0.1.0',
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: JIRA_TOOLS,
  };
});

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  
  // For stdio mode, we need to get session info from environment or args
  let sessionId = 'default';
  let jiraUrl = process.env.JIRA_URL || '';
  let email = process.env.JIRA_EMAIL || '';
  let apiToken = process.env.JIRA_API_TOKEN || '';
  
  // In SSE mode, session would be managed differently
  if (TRANSPORT_MODE === 'stdio' && (!jiraUrl || !email || !apiToken)) {
    throw new McpError(ErrorCode.InvalidRequest, 'Jira credentials not configured. Set JIRA_URL, JIRA_EMAIL, and JIRA_API_TOKEN environment variables.');
  }
  
  // Create or get session
  if (!sessions.has(sessionId) && jiraUrl && email && apiToken) {
    sessions.set(sessionId, {
      sessionId,
      userId: 'stdio-user',
      jiraUrl,
      email,
      apiToken,
      lastAccess: new Date()
    });
  }
  
  const jiraClient = getJiraClient(sessionId);

  try {
    switch (name) {
      case 'search_issues': {
        const { jql, maxResults = 50 } = args as { jql: string; maxResults?: number };
        const result = await jiraClient.searchIssues(jql, maxResults);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'get_issue': {
        const { issueKey } = args as { issueKey: string };
        const issue = await jiraClient.getIssue(issueKey);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(issue, null, 2)
            }
          ]
        };
      }

      case 'create_issue': {
        const { projectKey, issueType, summary, description, priority } = args as {
          projectKey: string;
          issueType: string;
          summary: string;
          description?: string;
          priority?: string;
        };
        const issue = await jiraClient.createIssue(projectKey, issueType, summary, description, priority);
        return {
          content: [
            {
              type: 'text',
              text: `Issue created successfully: ${issue.key}\n${JSON.stringify(issue, null, 2)}`
            }
          ]
        };
      }

      case 'update_issue': {
        const { issueKey, summary, description, priority } = args as {
          issueKey: string;
          summary?: string;
          description?: string;
          priority?: string;
        };
        
        const fields: any = {};
        if (summary) fields.summary = summary;
        if (description) {
          fields.description = {
            type: 'doc',
            version: 1,
            content: [
              {
                type: 'paragraph',
                content: [
                  {
                    type: 'text',
                    text: description
                  }
                ]
              }
            ]
          };
        }
        if (priority) fields.priority = { name: priority };
        
        await jiraClient.updateIssue(issueKey, fields);
        const updatedIssue = await jiraClient.getIssue(issueKey);
        
        return {
          content: [
            {
              type: 'text',
              text: `Issue ${issueKey} updated successfully\n${JSON.stringify(updatedIssue, null, 2)}`
            }
          ]
        };
      }

      case 'transition_issue': {
        const { issueKey, transitionId } = args as { issueKey: string; transitionId: string };
        await jiraClient.transitionIssue(issueKey, transitionId);
        const updatedIssue = await jiraClient.getIssue(issueKey);
        
        return {
          content: [
            {
              type: 'text',
              text: `Issue ${issueKey} transitioned successfully\n${JSON.stringify(updatedIssue, null, 2)}`
            }
          ]
        };
      }

      case 'get_issue_transitions': {
        const { issueKey } = args as { issueKey: string };
        const transitions = await jiraClient.getIssueTransitions(issueKey);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(transitions, null, 2)
            }
          ]
        };
      }

      case 'list_projects': {
        const projects = await jiraClient.getProjects();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(projects, null, 2)
            }
          ]
        };
      }

      case 'get_project': {
        const { projectKey } = args as { projectKey: string };
        const project = await jiraClient.getProject(projectKey);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(project, null, 2)
            }
          ]
        };
      }

      case 'add_comment': {
        const { issueKey, comment } = args as { issueKey: string; comment: string };
        await jiraClient.addComment(issueKey, comment);
        return {
          content: [
            {
              type: 'text',
              text: `Comment added to issue ${issueKey} successfully`
            }
          ]
        };
      }

      case 'get_my_issues': {
        const { maxResults = 50 } = args as { maxResults?: number };
        const session = sessions.get(sessionId);
        const jql = `assignee = "${session?.email}" ORDER BY updated DESC`;
        const result = await jiraClient.searchIssues(jql, maxResults);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      case 'get_recent_issues': {
        const { maxResults = 50 } = args as { maxResults?: number };
        const jql = 'ORDER BY updated DESC';
        const result = await jiraClient.searchIssues(jql, maxResults);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      }

      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new McpError(ErrorCode.InternalError, `Jira API error: ${errorMessage}`);
  }
});

// Express server for SSE mode
if (TRANSPORT_MODE === 'sse') {
  const app = express();
  
  app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', API_KEY_HEADER, USER_ID_HEADER, JIRA_URL_HEADER],
    credentials: true
  }));
  
  app.use(express.json());

  // Authentication endpoint
  app.post('/auth/token', async (req, res) => {
    try {
      const { userId, jiraUrl, email, apiToken } = req.body;
      
      if (!userId || !jiraUrl || !email || !apiToken) {
        return res.status(400).json({ 
          error: 'Missing required fields: userId, jiraUrl, email, apiToken' 
        });
      }

      // Test Jira connection
      const testClient = new JiraClient(jiraUrl, email, apiToken);
      try {
        await testClient.getProjects(); // Test API call
      } catch (error) {
        return res.status(401).json({ 
          error: 'Invalid Jira credentials or URL' 
        });
      }

      const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const token = jwt.sign({ sessionId, userId }, JWT_SECRET, { expiresIn: '24h' });
      
      sessions.set(sessionId, {
        sessionId,
        userId,
        jiraUrl,
        email,
        apiToken,
        lastAccess: new Date()
      });

      res.json({
        token,
        sessionId,
        expiresIn: '24h',
        message: 'Token created successfully'
      });
    } catch (error) {
      console.error('Auth error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Health check endpoint
  app.get('/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      activeSessions: sessions.size,
      mode: 'multitenant-sse-only'
    });
  });

  // Tools discovery endpoint
  app.get('/tools', (req, res) => {
    const toolCategories = {
      'Issue Management': ['search_issues', 'get_issue', 'create_issue', 'update_issue', 'get_my_issues', 'get_recent_issues'],
      'Issue Workflow': ['transition_issue', 'get_issue_transitions'],
      'Project Management': ['list_projects', 'get_project'],
      'Collaboration': ['add_comment']
    };

    res.json({
      tools: JIRA_TOOLS,
      total: JIRA_TOOLS.length,
      categories: toolCategories,
      version: '1.0.0',
      description: 'Jira MCP Server - Complete project management and issue tracking API with multitenant support'
    });
  });

  // Sessions endpoint
  app.get('/sessions', (req, res) => {
    const sessionList = Array.from(sessions.values()).map(session => ({
      sessionId: session.sessionId,
      userId: session.userId,
      jiraUrl: session.jiraUrl,
      lastAccess: session.lastAccess
    }));
    
    res.json({
      sessions: sessionList,
      total: sessionList.length
    });
  });

  // Delete session endpoint
  app.delete('/sessions/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    if (sessions.delete(sessionId)) {
      res.json({ message: 'Session deleted successfully' });
    } else {
      res.status(404).json({ error: 'Session not found' });
    }
  });

  // SSE endpoint
  app.get('/mcp/sse', (req, res) => {
    const userId = req.headers[USER_ID_HEADER] as string;
    const jiraUrl = req.headers[JIRA_URL_HEADER] as string;
    const apiToken = req.headers[API_KEY_HEADER] as string;
    
    if (!userId || !jiraUrl || !apiToken) {
      return res.status(400).json({ 
        error: `Missing required headers: ${USER_ID_HEADER}, ${JIRA_URL_HEADER}, ${API_KEY_HEADER}` 
      });
    }

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': `Content-Type, ${API_KEY_HEADER}, ${USER_ID_HEADER}, ${JIRA_URL_HEADER}`
    });

    // Send initial connection message
    res.write(`data: ${JSON.stringify({
      type: 'connection',
      message: 'Connected to Jira MCP Server',
      timestamp: new Date().toISOString(),
      availableTools: JIRA_TOOLS.length
    })}\n\n`);

    // Keep connection alive
    const keepAlive = setInterval(() => {
      res.write(`data: ${JSON.stringify({
        type: 'ping',
        timestamp: new Date().toISOString()
      })}\n\n`);
    }, 30000);

    req.on('close', () => {
      clearInterval(keepAlive);
    });
  });

  // MCP message endpoint
  app.post('/mcp/message', async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      const userId = req.headers[USER_ID_HEADER] as string;
      const jiraUrl = req.headers[JIRA_URL_HEADER] as string;
      const apiToken = req.headers[API_KEY_HEADER] as string;

      if (!authHeader || !userId || !jiraUrl || !apiToken) {
        return res.status(401).json({ error: 'Missing authentication headers' });
      }

      const token = authHeader.replace('Bearer ', '');
      let decoded: any;
      
      try {
        decoded = jwt.verify(token, JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ error: 'Invalid token' });
      }

      const session = sessions.get(decoded.sessionId);
      if (!session) {
        return res.status(401).json({ error: 'Session not found' });
      }

      session.lastAccess = new Date();

      const { method, params } = req.body;

      if (method === 'tools/list') {
        return res.json({ tools: JIRA_TOOLS });
      }

      if (method === 'tools/call') {
        const jiraClient = new JiraClient(session.jiraUrl, session.email, session.apiToken);
        const { name, arguments: args } = params;

        // Handle tool calls (similar to MCP handler above)
        let result;
        switch (name) {
          case 'search_issues': {
            const { jql, maxResults = 50 } = args;
            result = await jiraClient.searchIssues(jql, maxResults);
            break;
          }
          case 'get_issue': {
            const { issueKey } = args;
            result = await jiraClient.getIssue(issueKey);
            break;
          }
          case 'create_issue': {
            const { projectKey, issueType, summary, description, priority } = args;
            result = await jiraClient.createIssue(projectKey, issueType, summary, description, priority);
            break;
          }
          case 'list_projects': {
            result = await jiraClient.getProjects();
            break;
          }
          case 'get_my_issues': {
            const { maxResults = 50 } = args;
            const jql = `assignee = "${session.email}" ORDER BY updated DESC`;
            result = await jiraClient.searchIssues(jql, maxResults);
            break;
          }
          // Add more cases as needed
          default:
            return res.status(400).json({ error: `Unknown tool: ${name}` });
        }

        res.json({ result });
      }
    } catch (error) {
      console.error('MCP message error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // Direct Jira API endpoints for easier integration
  app.get('/jira/projects', async (req, res) => {
    try {
      const userId = req.headers[USER_ID_HEADER] as string;
      const jiraUrl = req.headers[JIRA_URL_HEADER] as string;
      const apiToken = req.headers[API_KEY_HEADER] as string;

      if (!userId || !jiraUrl || !apiToken) {
        return res.status(400).json({ error: 'Missing required headers' });
      }

      const jiraClient = new JiraClient(jiraUrl, userId, apiToken);
      const projects = await jiraClient.getProjects();
      res.json(projects);
    } catch (error) {
      console.error('Projects error:', error);
      res.status(500).json({ error: 'Failed to fetch projects' });
    }
  });

  app.post('/jira/issues/search', async (req, res) => {
    try {
      const userId = req.headers[USER_ID_HEADER] as string;
      const jiraUrl = req.headers[JIRA_URL_HEADER] as string;
      const apiToken = req.headers[API_KEY_HEADER] as string;
      const { jql, maxResults = 50 } = req.body;

      if (!userId || !jiraUrl || !apiToken) {
        return res.status(400).json({ error: 'Missing required headers' });
      }

      const jiraClient = new JiraClient(jiraUrl, userId, apiToken);
      const result = await jiraClient.searchIssues(jql, maxResults);
      res.json(result);
    } catch (error) {
      console.error('Search issues error:', error);
      res.status(500).json({ error: 'Failed to search issues' });
    }
  });

  app.post('/jira/issues', async (req, res) => {
    try {
      const userId = req.headers[USER_ID_HEADER] as string;
      const jiraUrl = req.headers[JIRA_URL_HEADER] as string;
      const apiToken = req.headers[API_KEY_HEADER] as string;
      const { projectKey, issueType, summary, description, priority } = req.body;

      if (!userId || !jiraUrl || !apiToken) {
        return res.status(400).json({ error: 'Missing required headers' });
      }

      const jiraClient = new JiraClient(jiraUrl, userId, apiToken);
      const issue = await jiraClient.createIssue(projectKey, issueType, summary, description, priority);
      res.json(issue);
    } catch (error) {
      console.error('Create issue error:', error);
      res.status(500).json({ error: 'Failed to create issue' });
    }
  });

  app.get('/jira/issues/:issueKey', async (req, res) => {
    try {
      const userId = req.headers[USER_ID_HEADER] as string;
      const jiraUrl = req.headers[JIRA_URL_HEADER] as string;
      const apiToken = req.headers[API_KEY_HEADER] as string;
      const { issueKey } = req.params;

      if (!userId || !jiraUrl || !apiToken) {
        return res.status(400).json({ error: 'Missing required headers' });
      }

      const jiraClient = new JiraClient(jiraUrl, userId, apiToken);
      const issue = await jiraClient.getIssue(issueKey);
      res.json(issue);
    } catch (error) {
      console.error('Get issue error:', error);
      res.status(500).json({ error: 'Failed to get issue' });
    }
  });

  // Start the Express server
  app.listen(PORT, () => {
    console.log(`Jira MCP Server running on port ${PORT} in ${TRANSPORT_MODE} mode`);
    console.log(`Health check: http://localhost:${PORT}/health`);
    console.log(`Tools discovery: http://localhost:${PORT}/tools`);
  });

} else {
  // Stdio mode
  async function runStdioServer() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Jira MCP Server running in stdio mode');
  }

  runStdioServer().catch((error) => {
    console.error('Failed to run server:', error);
    process.exit(1);
  });
}
