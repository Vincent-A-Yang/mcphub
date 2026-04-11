jest.mock('../../src/services/oauthService.js', () => ({
  initializeAllOAuthClients: jest.fn(),
}));

jest.mock('../../src/services/mcpOAuthProvider.js', () => ({
  createOAuthProvider: jest.fn(),
}));

jest.mock('../../src/services/sseService.js', () => ({
  getGroup: jest.fn(() => ''),
}));

jest.mock('../../src/services/groupService.js', () => ({
  getServersInGroup: jest.fn(),
  getServerConfigInGroup: jest.fn(),
}));

jest.mock('../../src/services/vectorSearchService.js', () => ({
  removeServerToolEmbeddings: jest.fn(),
  saveToolsAsVectorEmbeddings: jest.fn(),
}));

jest.mock('../../src/services/activityLoggingService.js', () => ({
  getActivityLoggingService: jest.fn(() => ({
    logToolCall: jest.fn(),
  })),
}));

jest.mock('../../src/services/smartRoutingService.js', () => ({
  initSmartRoutingService: jest.fn(),
  getSmartRoutingTools: jest.fn(),
  handleSearchToolsRequest: jest.fn(),
  handleDescribeToolRequest: jest.fn(),
  isSmartRoutingGroup: jest.fn(() => false),
}));

jest.mock('../../src/services/services.js', () => ({
  getDataService: jest.fn(() => ({
    filterData: (data: any) => data,
  })),
}));

const mockGetBuiltinPromptDao = {
  findEnabled: jest.fn(),
  findByName: jest.fn(),
};

const mockGetBuiltinResourceDao = {
  findEnabled: jest.fn(),
};

const mockGetServerDao = {
  findById: jest.fn(),
  findAll: jest.fn(),
  findAllPaginated: jest.fn(),
};

jest.mock('../../src/dao/index.js', () => ({
  getServerDao: jest.fn(() => mockGetServerDao),
  getSystemConfigDao: jest.fn(() => ({ get: jest.fn() })),
  getBuiltinPromptDao: jest.fn(() => mockGetBuiltinPromptDao),
  getBuiltinResourceDao: jest.fn(() => mockGetBuiltinResourceDao),
}));

jest.mock('../../src/config/index.js', () => ({
  expandEnvVars: jest.fn((val: string) => val),
  replaceEnvVars: jest.fn((val: any) => val),
  getNameSeparator: jest.fn(() => '::'),
  default: {
    mcpHubName: 'test-hub',
    mcpHubVersion: '1.0.0',
    initTimeout: 60000,
  },
}));

import {
  createMcpServer,
  filterPromptsByGroup,
  filterResourceTemplatesByGroup,
  filterResourcesByGroup,
  getServersInfo,
  handleGetPromptRequest,
  handleListPromptsRequest,
  handleListResourcesRequest,
} from '../../src/services/mcpService.js';

describe('mcpService handleListPromptsRequest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetServerDao.findById.mockResolvedValue(null);
    mockGetServerDao.findAll.mockResolvedValue([]);
    mockGetServerDao.findAllPaginated.mockResolvedValue({
      data: [],
      total: 0,
      page: 1,
      limit: 10,
      totalPages: 0,
    });
    mockGetBuiltinResourceDao.findEnabled.mockResolvedValue([]);
    mockGetBuiltinPromptDao.findEnabled.mockResolvedValue([]);
    mockGetBuiltinPromptDao.findByName.mockResolvedValue(null);
  });

  it('should return schema-safe prompt fields for built-in prompts', async () => {
    mockGetBuiltinPromptDao.findEnabled.mockResolvedValue([
      {
        id: 'p1',
        name: 'builtin-no-optional-fields',
        template: 'hello {{x}}',
        enabled: true,
        title: undefined,
        description: undefined,
        arguments: undefined,
      },
    ]);

    const result = await handleListPromptsRequest({}, { sessionId: 's1' });

    expect(result.prompts).toHaveLength(1);
    expect(result.prompts[0]).toEqual({
      name: 'builtin-no-optional-fields',
      title: 'builtin-no-optional-fields',
      description: '',
      arguments: [],
    });
    expect(typeof result.prompts[0].title).toBe('string');
    expect(typeof result.prompts[0].description).toBe('string');
    expect(Array.isArray(result.prompts[0].arguments)).toBe(true);
  });

  it('should return schema-safe resource fields for built-in resources', async () => {
    mockGetBuiltinPromptDao.findEnabled.mockResolvedValue([]);
    mockGetBuiltinResourceDao.findEnabled.mockResolvedValue([
      {
        id: 'r1',
        uri: 'resource://docs/readme',
        content: 'hello',
        enabled: true,
        name: null,
        description: undefined,
        mimeType: null,
      },
    ]);

    const result = await handleListResourcesRequest({}, { sessionId: 's1' });

    expect(result.resources).toHaveLength(1);
    expect(result.resources[0]).toEqual({
      uri: 'resource://docs/readme',
      name: '',
      description: '',
      mimeType: '',
    });
    expect(typeof result.resources[0].name).toBe('string');
    expect(typeof result.resources[0].description).toBe('string');
    expect(typeof result.resources[0].mimeType).toBe('string');
  });

  it('should register the listResourceTemplates MCP handler', () => {
    const server = createMcpServer('test-hub', '1.0.0');

    expect((server as any)._requestHandlers.has('resources/templates/list')).toBe(true);
  });

  it('should filter prompts by group capability selection', async () => {
    const mockGetServerConfigInGroup = jest.requireMock('../../src/services/groupService.js')
      .getServerConfigInGroup as jest.Mock;
    mockGetServerConfigInGroup.mockResolvedValue({
      name: 'server-a',
      prompts: ['draft_prompt'],
    });

    const result = await filterPromptsByGroup('team-a', 'server-a', [
      { name: 'server-a::draft_prompt', description: 'allowed' },
      { name: 'server-a::review_prompt', description: 'blocked' },
    ] as any);

    expect(result).toEqual([{ name: 'server-a::draft_prompt', description: 'allowed' }]);
  });

  it('should expose server custom prompts in server info even before upstream prompts are loaded', async () => {
    mockGetServerDao.findAll.mockResolvedValue([
      {
        name: 'server-a',
        enabled: true,
        prompts: {
          'server-a::draft_reply': {
            enabled: true,
            title: 'Draft reply',
            description: 'Generate a draft reply',
            template: 'Reply to {{customer}} about {{topic}}',
            arguments: [
              { name: 'customer', required: true },
              { name: 'topic' },
            ],
          },
        },
      },
    ]);

    const result = await getServersInfo();

    expect(result).toHaveLength(1);
    expect(result[0].prompts).toEqual([
      {
        name: 'server-a::draft_reply',
        title: 'Draft reply',
        description: 'Generate a draft reply',
        arguments: [
          { name: 'customer', required: true },
          { name: 'topic' },
        ],
        enabled: true,
      },
    ]);
  });

  it('should include server custom prompt configs in server info config payload', async () => {
    mockGetServerDao.findAll.mockResolvedValue([
      {
        name: 'server-a',
        enabled: true,
        type: 'stdio',
        prompts: {
          draft_reply: {
            enabled: true,
            title: 'Draft reply',
            description: 'Generate a draft reply',
            template: 'Reply to {{customer}} about {{topic}}',
            arguments: [
              { name: 'customer', required: true },
              { name: 'topic' },
            ],
          },
          upstream_prompt: {
            enabled: false,
            description: 'Disable upstream prompt',
          },
        },
      },
    ]);

    const result = await getServersInfo();

    expect(result).toHaveLength(1);
    expect(result[0].config).toEqual({
      type: 'stdio',
      prompts: {
        draft_reply: {
          enabled: true,
          title: 'Draft reply',
          description: 'Generate a draft reply',
          template: 'Reply to {{customer}} about {{topic}}',
          arguments: [
            { name: 'customer', required: true },
            { name: 'topic' },
          ],
        },
        upstream_prompt: {
          enabled: false,
          description: 'Disable upstream prompt',
        },
      },
    });
  });

  it('should resolve server custom prompts before calling upstream MCP prompts', async () => {
    mockGetServerDao.findById.mockResolvedValue({
      name: 'server-a',
      prompts: {
        'server-a::draft_reply': {
          enabled: true,
          title: 'Draft reply',
          description: 'Generate a draft reply',
          template: 'Reply to {{customer}} about {{topic}}',
          arguments: [
            { name: 'customer', required: true },
            { name: 'topic' },
          ],
        },
      },
    });

    const result = await handleGetPromptRequest(
      {
        params: {
          name: 'server-a::draft_reply',
          arguments: {
            customer: 'Ada',
            topic: 'deployment',
          },
        },
      },
      { server: 'server-a' },
    );

    expect(result).toEqual({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: 'Reply to Ada about deployment',
          },
        },
      ],
    });
  });

  it('should filter resources by group capability selection', async () => {
    const mockGetServerConfigInGroup = jest.requireMock('../../src/services/groupService.js')
      .getServerConfigInGroup as jest.Mock;
    mockGetServerConfigInGroup.mockResolvedValue({
      name: 'server-a',
      resources: ['resource://docs/guide'],
    });

    const result = await filterResourcesByGroup('team-a', 'server-a', [
      { uri: 'resource://docs/guide', name: 'Guide' },
      { uri: 'resource://docs/private', name: 'Private' },
    ] as any);

    expect(result).toEqual([{ uri: 'resource://docs/guide', name: 'Guide' }]);
  });

  it('should hide resource templates when group resources are explicitly empty', async () => {
    const mockGetServerConfigInGroup = jest.requireMock('../../src/services/groupService.js')
      .getServerConfigInGroup as jest.Mock;
    mockGetServerConfigInGroup.mockResolvedValue({
      name: 'server-a',
      resources: [],
    });

    const result = await filterResourceTemplatesByGroup('team-a', 'server-a', [
      { uriTemplate: 'resource://docs/{slug}', name: 'Docs by slug' },
    ] as any);

    expect(result).toEqual([]);
  });
});
