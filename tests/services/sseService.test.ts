jest.mock('../../src/dao/index.js', () => ({
  getSystemConfigDao: () => ({
    get: jest.fn().mockResolvedValue({
      routing: {
        enableGlobalRoute: true,
        enableGroupNameRoute: true,
        enableBearerAuth: false,
      },
      enableSessionRebuild: true,
    }),
  }),
  getBearerKeyDao: () => ({
    findEnabled: jest.fn().mockResolvedValue([]),
  }),
  getOAuthTokenDao: () => ({
    findAll: jest.fn().mockResolvedValue([]),
  }),
}));

jest.mock('../../src/services/userContextService.js', () => ({
  UserContextService: {
    getInstance: () => ({
      getCurrentUser: () => undefined,
    }),
  },
}));

jest.mock('../../src/services/requestContextService.js', () => ({
  RequestContextService: {
    getInstance: () => ({
      runWithRequestContext: async (_req: unknown, fn: () => Promise<void>) => fn(),
      setBearerKeyContext: jest.fn(),
      setGroupContext: jest.fn(),
    }),
  },
}));

jest.mock('../../src/utils/oauthBearer.js', () => ({
  getBearerAuthHeaderValue: jest.fn().mockReturnValue(null),
}));

jest.mock('../../src/services/mcpService.js', () => ({
  getMcpServer: jest.fn(),
  deleteMcpServer: jest.fn(),
}));

import { handleMcpPostRequest } from '../../src/services/sseService.js';
import * as mcpService from '../../src/services/mcpService.js';

describe('sseService session rebuild', () => {
  it('rebuilds missing sessions with a fresh MCP server instance', async () => {
    const connect = jest.fn().mockResolvedValue(undefined);
    const handleRequest = jest.fn().mockResolvedValue(undefined);
    const mockServer = { connect } as any;
    const transportHandleRequest = handleRequest;

    jest.spyOn(mcpService, 'getMcpServer').mockReturnValue(mockServer);

    const req = {
      headers: {
        'mcp-session-id': 'session-rebuild',
      },
      params: {
        group: '$smart',
      },
      body: {
        method: 'tools/call',
        params: {
          name: 'call_tool',
          arguments: {
            toolName: 'github-get_file_contents',
            arguments: {
              owner: 'Vincent-A-Yang',
            },
          },
        },
      },
    } as any;

    const res = {
      status: jest.fn().mockReturnThis(),
      send: jest.fn(),
      json: jest.fn(),
      writeHead: jest.fn(),
      end: jest.fn(),
      headersSent: false,
    } as any;

    const transportSpy = jest
      .spyOn(require('@modelcontextprotocol/sdk/server/streamableHttp.js'), 'StreamableHTTPServerTransport')
      .mockImplementation(function MockTransport(this: any, options: any) {
        this.sessionId = 'session-rebuild';
        this.handleRequest = transportHandleRequest;
        this.onclose = undefined;
        if (options?.onsessioninitialized) {
          queueMicrotask(() => options.onsessioninitialized('session-rebuild'));
        }
      } as any);

    await handleMcpPostRequest(req, res);

    expect(mcpService.deleteMcpServer).toHaveBeenCalledWith('session-rebuild');
    expect(mcpService.getMcpServer).toHaveBeenCalledWith('session-rebuild', '$smart');
    expect(connect).toHaveBeenCalledTimes(1);

    transportSpy.mockRestore();
  });
});
