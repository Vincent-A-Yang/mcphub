# Stream Parameter Support

MCPHub now supports controlling the response format of MCP requests through a `stream` parameter. This allows you to choose between Server-Sent Events (SSE) streaming responses and direct JSON responses.

## Overview

By default, MCP requests use SSE streaming for real-time communication. However, some use cases benefit from receiving complete JSON responses instead of streams. The `stream` parameter provides this flexibility.

## Usage

### Query Parameter

You can control streaming behavior by adding a `stream` query parameter to your MCP POST requests:

```bash
# Disable streaming (receive JSON response)
POST /mcp?stream=false

# Enable streaming (SSE response) - Default behavior
POST /mcp?stream=true
```

### Request Body Parameter

Alternatively, you can include the `stream` parameter in your request body:

```json
{
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "capabilities": {},
    "clientInfo": {
      "name": "MyClient",
      "version": "1.0.0"
    }
  },
  "stream": false,
  "jsonrpc": "2.0",
  "id": 1
}
```

**Note:** The request body parameter takes priority over the query parameter if both are specified.

## Examples

### Example 1: Non-Streaming Request

```bash
curl -X POST "http://localhost:3000/mcp?stream=false" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "TestClient",
        "version": "1.0.0"
      }
    },
    "jsonrpc": "2.0",
    "id": 1
  }'
```

Response (JSON):
```json
{
  "jsonrpc": "2.0",
  "result": {
    "protocolVersion": "2025-03-26",
    "capabilities": {
      "tools": {},
      "prompts": {}
    },
    "serverInfo": {
      "name": "MCPHub",
      "version": "1.0.0"
    }
  },
  "id": 1
}
```

### Example 2: Streaming Request (Default)

```bash
curl -X POST "http://localhost:3000/mcp" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-03-26",
      "capabilities": {},
      "clientInfo": {
        "name": "TestClient",
        "version": "1.0.0"
      }
    },
    "jsonrpc": "2.0",
    "id": 1
  }'
```

Response (SSE Stream):
```
HTTP/1.1 200 OK
Content-Type: text/event-stream
mcp-session-id: 550e8400-e29b-41d4-a716-446655440000

data: {"jsonrpc":"2.0","result":{...},"id":1}

```

## Use Cases

### When to Use `stream: false`

- **Simple Request-Response**: When you only need a single response without ongoing communication
- **Debugging**: Easier to inspect complete JSON responses in tools like Postman or curl
- **Testing**: Simpler to test and validate responses in automated tests
- **Stateless Operations**: When you don't need to maintain session state between requests
- **API Integration**: When integrating with systems that expect standard JSON responses

### When to Use `stream: true` (Default)

- **Real-time Communication**: When you need continuous updates or notifications
- **Long-running Operations**: For operations that may take time and send progress updates
- **Event-driven**: When your application architecture is event-based
- **MCP Protocol Compliance**: For full MCP protocol compatibility with streaming support

## Technical Details

### Implementation

The `stream` parameter controls the `enableJsonResponse` option of the underlying `StreamableHTTPServerTransport`:

- `stream: true` → `enableJsonResponse: false` → SSE streaming response
- `stream: false` → `enableJsonResponse: true` → Direct JSON response

### Backward Compatibility

The default behavior remains SSE streaming (`stream: true`) to maintain backward compatibility with existing clients. If the `stream` parameter is not specified, MCPHub will use streaming by default.

### Session Management

The stream parameter affects how sessions are created:

- **Streaming sessions**: Use SSE transport with session management
- **Non-streaming sessions**: Use direct JSON responses with session management

Both modes support session IDs and can be used with the MCP session management features.

## Group and Server Routes

The stream parameter works with all MCP route variants:

- Global route: `/mcp?stream=false`
- Group route: `/mcp/{group}?stream=false`
- Server route: `/mcp/{server}?stream=false`
- Smart routing: `/mcp/$smart?stream=false`

## Limitations

1. The `stream` parameter only affects POST requests to the `/mcp` endpoint
2. SSE GET requests for retrieving streams are not affected by this parameter
3. Session rebuild operations inherit the stream setting from the original request

## See Also

- [MCP Protocol Specification](https://spec.modelcontextprotocol.io/)
- [API Reference](https://docs.mcphubx.com/api-reference)
- [Configuration Guide](https://docs.mcphubx.com/configuration/mcp-settings)
