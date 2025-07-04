#!/bin/bash

# Jira MCP Server Setup Script
# This script helps you set up and run the Jira MCP server

set -e

echo "🎯 Jira MCP Server Setup"
echo "========================="
echo

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    echo "   Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

echo "✅ Docker is installed and ready"
echo

# Function to check if port is available
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 1
    else
        return 0
    fi
}

# Check if port 3001 is available
if ! check_port 3001; then
    echo "⚠️  Port 3001 is already in use. Please stop the service using that port or change the port in docker-compose.yml"
    echo "   You can check what's using the port with: lsof -i :3001"
    read -p "   Do you want to continue anyway? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

# Create .env file if it doesn't exist
if [ ! -f .env ]; then
    echo "📝 Creating .env file from template..."
    cp .env.example .env
    
    # Generate a random JWT secret
    JWT_SECRET=$(openssl rand -base64 32 2>/dev/null || head -c 32 /dev/urandom | base64)
    
    # Update the JWT secret in .env file
    if command -v sed &> /dev/null; then
        sed -i.bak "s/your-super-secret-jwt-key-change-this-in-production/$JWT_SECRET/" .env
        rm .env.bak 2>/dev/null || true
    else
        echo "⚠️  Please manually update the JWT_SECRET in .env file"
    fi
    
    echo "✅ Created .env file with secure JWT secret"
else
    echo "✅ .env file already exists"
fi

echo

# Build and start the server
echo "🏗️  Building and starting the Jira MCP server..."
echo "   This may take a few minutes on first run..."
echo

# Use docker compose if available, otherwise fall back to docker-compose
if docker compose version &> /dev/null; then
    DOCKER_COMPOSE="docker compose"
else
    DOCKER_COMPOSE="docker-compose"
fi

# Stop any existing containers
$DOCKER_COMPOSE down 2>/dev/null || true

# Build and start
if $DOCKER_COMPOSE up -d --build; then
    echo
    echo "🎉 Jira MCP Server is starting up!"
    echo
    
    # Wait a moment for the server to start
    echo "⏳ Waiting for server to be ready..."
    sleep 5
    
    # Check if the server is responding
    max_attempts=12
    attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -s http://localhost:3001/health > /dev/null 2>&1; then
            echo "✅ Server is ready!"
            break
        else
            echo "   Attempt $attempt/$max_attempts - Server not ready yet..."
            sleep 5
            ((attempt++))
        fi
    done
    
    if [ $attempt -gt $max_attempts ]; then
        echo "❌ Server failed to start properly. Check logs with:"
        echo "   $DOCKER_COMPOSE logs"
        exit 1
    fi
    
    echo
    echo "🚀 Jira MCP Server is now running!"
    echo
    echo "📊 Server Information:"
    echo "   • Health Check: http://localhost:3001/health"
    echo "   • Available Tools: http://localhost:3001/tools"
    echo "   • Interactive Client: file://$(pwd)/client-example.html"
    echo "   • Transport Mode: SSE (Server-Sent Events)"
    echo "   • Architecture: Multitenant with JWT authentication"
    echo
    echo "🔧 Management Commands:"
    echo "   • View logs: $DOCKER_COMPOSE logs -f"
    echo "   • Stop server: $DOCKER_COMPOSE down"
    echo "   • Restart server: $DOCKER_COMPOSE restart"
    echo "   • View status: $DOCKER_COMPOSE ps"
    echo
    echo "📖 Quick Start:"
    echo "   1. Open client-example.html in your browser"
    echo "   2. Enter your Jira credentials in the authentication section"
    echo "   3. Click 'Connect to Jira' to authenticate"
    echo "   4. Try the demo operations to test the connection"
    echo
    echo "🔗 API Endpoints:"
    echo "   • POST /auth/token - Get authentication token"
    echo "   • GET /mcp/sse - Server-Sent Events endpoint"
    echo "   • POST /mcp/message - Send MCP protocol messages"
    echo "   • GET /jira/projects - List projects (direct API)"
    echo "   • POST /jira/issues/search - Search issues (direct API)"
    echo
    echo "📚 Documentation:"
    echo "   • README.md - Complete documentation"
    echo "   • .env.example - Configuration options"
    echo
    
    # Test the server
    echo "🧪 Testing server endpoints..."
    
    # Test health endpoint
    if health_response=$(curl -s http://localhost:3001/health); then
        echo "   ✅ Health check: OK"
        echo "      Active sessions: $(echo $health_response | grep -o '"activeSessions":[0-9]*' | cut -d: -f2)"
    else
        echo "   ❌ Health check: Failed"
    fi
    
    # Test tools endpoint
    if tools_response=$(curl -s http://localhost:3001/tools); then
        tool_count=$(echo $tools_response | grep -o '"total":[0-9]*' | cut -d: -f2)
        echo "   ✅ Tools endpoint: OK ($tool_count tools available)"
    else
        echo "   ❌ Tools endpoint: Failed"
    fi
    
    echo
    echo "🎯 Next Steps:"
    echo "   1. Open the interactive client: open client-example.html"
    echo "   2. Or test with curl:"
    echo "      curl http://localhost:3001/health"
    echo "      curl http://localhost:3001/tools"
    echo "   3. Read the documentation in README.md"
    echo
    echo "💡 Need help? Check the logs:"
    echo "   $DOCKER_COMPOSE logs -f"
    echo
    
else
    echo "❌ Failed to start the server. Please check the error messages above."
    echo "   You can view detailed logs with: $DOCKER_COMPOSE logs"
    exit 1
fi
