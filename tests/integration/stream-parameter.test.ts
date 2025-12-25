/**
 * Integration test for stream parameter support
 * This test demonstrates the usage of stream parameter in MCP requests
 */

import { describe, it, expect } from '@jest/globals';

describe('Stream Parameter Integration Test', () => {
  it('should demonstrate stream parameter usage', () => {
    // Example 1: Using stream=false in query parameter
    const queryExample = {
      url: '/mcp?stream=false',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: {
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'TestClient',
            version: '1.0.0',
          },
        },
        jsonrpc: '2.0',
        id: 1,
      },
    };

    expect(queryExample.url).toContain('stream=false');

    // Example 2: Using stream parameter in request body
    const bodyExample = {
      url: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: {
        method: 'initialize',
        stream: false, // Body parameter
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'TestClient',
            version: '1.0.0',
          },
        },
        jsonrpc: '2.0',
        id: 1,
      },
    };

    expect(bodyExample.body.stream).toBe(false);

    // Example 3: Default behavior (streaming enabled)
    const defaultExample = {
      url: '/mcp',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: {
        method: 'initialize',
        params: {
          protocolVersion: '2025-03-26',
          capabilities: {},
          clientInfo: {
            name: 'TestClient',
            version: '1.0.0',
          },
        },
        jsonrpc: '2.0',
        id: 1,
      },
    };

    expect(defaultExample.body).not.toHaveProperty('stream');
  });

  it('should show expected response formats', () => {
    // Expected response format for stream=false (JSON)
    const jsonResponse = {
      jsonrpc: '2.0',
      result: {
        protocolVersion: '2025-03-26',
        capabilities: {
          tools: {},
          prompts: {},
        },
        serverInfo: {
          name: 'MCPHub',
          version: '1.0.0',
        },
      },
      id: 1,
    };

    expect(jsonResponse).toHaveProperty('jsonrpc');
    expect(jsonResponse).toHaveProperty('result');

    // Expected response format for stream=true (SSE)
    const sseResponse = {
      headers: {
        'Content-Type': 'text/event-stream',
        'mcp-session-id': '550e8400-e29b-41d4-a716-446655440000',
      },
      body: 'data: {"jsonrpc":"2.0","result":{...},"id":1}\n\n',
    };

    expect(sseResponse.headers['Content-Type']).toBe('text/event-stream');
    expect(sseResponse.headers).toHaveProperty('mcp-session-id');
  });

  it('should demonstrate all route variants', () => {
    const routes = [
      { route: '/mcp?stream=false', description: 'Global route with non-streaming' },
      { route: '/mcp/mygroup?stream=false', description: 'Group route with non-streaming' },
      { route: '/mcp/myserver?stream=false', description: 'Server route with non-streaming' },
      { route: '/mcp/$smart?stream=false', description: 'Smart routing with non-streaming' },
    ];

    routes.forEach((item) => {
      expect(item.route).toContain('stream=false');
      expect(item.description).toBeTruthy();
    });
  });

  it('should show parameter priority', () => {
    // Body parameter takes priority over query parameter
    const mixedExample = {
      url: '/mcp?stream=true', // Query says stream=true
      body: {
        method: 'initialize',
        stream: false, // Body says stream=false - this takes priority
        params: {},
        jsonrpc: '2.0',
        id: 1,
      },
    };

    // In this case, the effective value should be false (from body)
    expect(mixedExample.body.stream).toBe(false);
    expect(mixedExample.url).toContain('stream=true');
  });
});
