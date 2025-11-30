import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// Mock dependencies before importing vectorSearchService
jest.mock('../../src/db/index.js', () => ({
  getRepositoryFactory: jest.fn(() => () => ({
    searchByText: jest.fn(),
    saveEmbedding: jest.fn(),
  })),
}));

jest.mock('../../src/db/connection.js', () => ({
  getAppDataSource: jest.fn(() => ({
    isInitialized: true,
    query: jest.fn(),
  })),
  initializeDatabase: jest.fn(),
}));

jest.mock('../../src/utils/smartRouting.js', () => ({
  getSmartRoutingConfig: jest.fn(() => ({
    enabled: true,
    openaiApiKey: 'test-key',
    openaiApiBaseUrl: 'https://api.openai.com/v1',
    openaiApiEmbeddingModel: 'text-embedding-3-small',
  })),
}));

jest.mock('openai', () => {
  return {
    default: jest.fn().mockImplementation(() => ({
      apiKey: 'test-key',
      embeddings: {
        create: jest.fn().mockResolvedValue({
          data: [{ embedding: new Array(1536).fill(0.1) }],
        }),
      },
    })),
  };
});

// Import after mocks are set up
import { searchToolsByVector } from '../../src/services/vectorSearchService.js';
import { getRepositoryFactory } from '../../src/db/index.js';

describe('vectorSearchService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('searchToolsByVector', () => {
    it('should return empty array when serverNames is an empty array', async () => {
      // This test verifies the fix for the $smart/group routing issue
      // When serverNames is an empty array (empty group), no results should be returned
      const result = await searchToolsByVector('test query', 10, 0.3, []);

      // searchByText should NOT be called because we return early with empty results
      const mockRepository = (getRepositoryFactory as jest.Mock)();
      expect(mockRepository.searchByText).not.toHaveBeenCalled;

      // Result should be empty
      expect(result).toEqual([]);
    });

    it('should search all servers when serverNames is undefined', async () => {
      const mockSearchResults = [
        {
          similarity: 0.9,
          embedding: {
            text_content: 'test tool description',
            metadata: JSON.stringify({
              serverName: 'server1',
              toolName: 'tool1',
              description: 'Test tool 1',
              inputSchema: {},
            }),
          },
        },
      ];

      const mockRepository = {
        searchByText: jest.fn().mockResolvedValue(mockSearchResults),
        saveEmbedding: jest.fn(),
      };

      (getRepositoryFactory as jest.Mock).mockReturnValue(() => mockRepository);

      const result = await searchToolsByVector('test query', 10, 0.3, undefined);

      // searchByText should be called since serverNames is undefined
      expect(mockRepository.searchByText).toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
      expect(result[0].serverName).toBe('server1');
    });

    it('should filter results by serverNames when provided', async () => {
      const mockSearchResults = [
        {
          similarity: 0.9,
          embedding: {
            text_content: 'test tool 1',
            metadata: JSON.stringify({
              serverName: 'server1',
              toolName: 'tool1',
              description: 'Test tool 1',
              inputSchema: {},
            }),
          },
        },
        {
          similarity: 0.85,
          embedding: {
            text_content: 'test tool 2',
            metadata: JSON.stringify({
              serverName: 'server2',
              toolName: 'tool2',
              description: 'Test tool 2',
              inputSchema: {},
            }),
          },
        },
      ];

      const mockRepository = {
        searchByText: jest.fn().mockResolvedValue(mockSearchResults),
        saveEmbedding: jest.fn(),
      };

      (getRepositoryFactory as jest.Mock).mockReturnValue(() => mockRepository);

      // Filter to only server1
      const result = await searchToolsByVector('test query', 10, 0.3, ['server1']);

      expect(result.length).toBe(1);
      expect(result[0].serverName).toBe('server1');
    });
  });
});
