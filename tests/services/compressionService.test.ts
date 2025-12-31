// Mock the DAO module before imports
jest.mock('../../src/dao/index.js', () => ({
  getSystemConfigDao: jest.fn(),
}));

// Mock smart routing config
jest.mock('../../src/utils/smartRouting.js', () => ({
  getSmartRoutingConfig: jest.fn(),
}));

// Mock OpenAI
jest.mock('openai', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn(),
        },
      },
    })),
  };
});

import {
  getCompressionConfig,
  isCompressionEnabled,
  estimateTokenCount,
  shouldCompress,
  compressOutput,
  compressToolResult,
} from '../../src/services/compressionService.js';
import { getSystemConfigDao } from '../../src/dao/index.js';
import { getSmartRoutingConfig } from '../../src/utils/smartRouting.js';
import OpenAI from 'openai';

describe('CompressionService', () => {
  const mockSystemConfigDao = {
    get: jest.fn(),
    getSection: jest.fn(),
    update: jest.fn(),
    updateSection: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    (getSystemConfigDao as jest.Mock).mockReturnValue(mockSystemConfigDao);
  });

  describe('getCompressionConfig', () => {
    it('should return default config when no config is set', async () => {
      mockSystemConfigDao.get.mockResolvedValue({});

      const config = await getCompressionConfig();

      expect(config).toEqual({
        enabled: false,
        model: 'gpt-4o-mini',
        maxInputTokens: 100000,
        targetReductionRatio: 0.5,
      });
    });

    it('should return configured values when set', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: {
          enabled: true,
          model: 'gpt-4o',
          maxInputTokens: 50000,
          targetReductionRatio: 0.3,
        },
      });

      const config = await getCompressionConfig();

      expect(config).toEqual({
        enabled: true,
        model: 'gpt-4o',
        maxInputTokens: 50000,
        targetReductionRatio: 0.3,
      });
    });

    it('should use defaults for missing values', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: {
          enabled: true,
        },
      });

      const config = await getCompressionConfig();

      expect(config).toEqual({
        enabled: true,
        model: 'gpt-4o-mini',
        maxInputTokens: 100000,
        targetReductionRatio: 0.5,
      });
    });

    it('should return defaults on error', async () => {
      mockSystemConfigDao.get.mockRejectedValue(new Error('Test error'));

      const config = await getCompressionConfig();

      expect(config).toEqual({
        enabled: false,
        model: 'gpt-4o-mini',
        maxInputTokens: 100000,
        targetReductionRatio: 0.5,
      });
    });
  });

  describe('isCompressionEnabled', () => {
    it('should return false when compression is disabled', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: false },
      });

      const enabled = await isCompressionEnabled();

      expect(enabled).toBe(false);
    });

    it('should return false when enabled but no API key', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: '',
      });

      const enabled = await isCompressionEnabled();

      expect(enabled).toBe(false);
    });

    it('should return true when enabled and API key is set', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: 'test-api-key',
      });

      const enabled = await isCompressionEnabled();

      expect(enabled).toBe(true);
    });
  });

  describe('estimateTokenCount', () => {
    it('should estimate tokens for short text', () => {
      const text = 'Hello world';
      const tokens = estimateTokenCount(text);

      // Estimate based on ~4 chars per token
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });

    it('should estimate tokens for longer text', () => {
      const text = 'This is a longer piece of text that should have more tokens';
      const tokens = estimateTokenCount(text);

      // Estimate based on ~4 chars per token
      expect(tokens).toBe(Math.ceil(text.length / 4));
    });

    it('should handle empty string', () => {
      const tokens = estimateTokenCount('');

      expect(tokens).toBe(0);
    });
  });

  describe('shouldCompress', () => {
    it('should return false for small content', () => {
      const content = 'Small content';
      const result = shouldCompress(content, 100000);

      expect(result).toBe(false);
    });

    it('should return true for large content', () => {
      // Create content larger than the threshold
      const content = 'x'.repeat(5000);
      const result = shouldCompress(content, 100000);

      expect(result).toBe(true);
    });

    it('should use 10% of maxInputTokens as threshold', () => {
      // Test threshold behavior with different content sizes
      const smallContent = 'x'.repeat(300);
      const largeContent = 'x'.repeat(500);

      expect(shouldCompress(smallContent, 1000)).toBe(false);
      expect(shouldCompress(largeContent, 1000)).toBe(true);
    });
  });

  describe('compressOutput', () => {
    it('should return original content when compression is disabled', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: false },
      });

      const content = 'Test content';
      const result = await compressOutput(content);

      expect(result).toEqual({
        compressed: content,
        originalLength: content.length,
        compressedLength: content.length,
        wasCompressed: false,
      });
    });

    it('should return original content when content is too small', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true, maxInputTokens: 100000 },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: 'test-api-key',
      });

      const content = 'Small content';
      const result = await compressOutput(content);

      expect(result.wasCompressed).toBe(false);
      expect(result.compressed).toBe(content);
    });

    it('should return original content when no API key is configured', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: '',
      });

      const content = 'x'.repeat(5000);
      const result = await compressOutput(content);

      expect(result.wasCompressed).toBe(false);
      expect(result.compressed).toBe(content);
    });

    it('should compress content when enabled and content is large', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true, model: 'gpt-4o-mini', maxInputTokens: 100000 },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: 'test-api-key',
        openaiApiBaseUrl: 'https://api.openai.com/v1',
      });

      const originalContent = 'x'.repeat(5000);
      const compressedContent = 'y'.repeat(2000);

      // Mock OpenAI response
      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: compressedContent } }],
      });

      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await compressOutput(originalContent, {
        toolName: 'test-tool',
        serverName: 'test-server',
      });

      expect(result.wasCompressed).toBe(true);
      expect(result.compressed).toBe(compressedContent);
      expect(result.originalLength).toBe(originalContent.length);
      expect(result.compressedLength).toBe(compressedContent.length);
    });

    it('should return original content when compressed is larger', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true, model: 'gpt-4o-mini', maxInputTokens: 100000 },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: 'test-api-key',
        openaiApiBaseUrl: 'https://api.openai.com/v1',
      });

      const originalContent = 'x'.repeat(5000);
      const largerContent = 'y'.repeat(6000);

      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: largerContent } }],
      });

      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = await compressOutput(originalContent);

      expect(result.wasCompressed).toBe(false);
      expect(result.compressed).toBe(originalContent);
    });

    it('should return original content on API error', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true, model: 'gpt-4o-mini', maxInputTokens: 100000 },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: 'test-api-key',
        openaiApiBaseUrl: 'https://api.openai.com/v1',
      });

      const mockCreate = jest.fn().mockRejectedValue(new Error('API error'));

      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const content = 'x'.repeat(5000);
      const result = await compressOutput(content);

      expect(result.wasCompressed).toBe(false);
      expect(result.compressed).toBe(content);
    });
  });

  describe('compressToolResult', () => {
    it('should return original result when compression is disabled', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: false },
      });

      const result = {
        content: [{ type: 'text', text: 'Test output' }],
      };

      const compressed = await compressToolResult(result);

      expect(compressed).toEqual(result);
    });

    it('should not compress error results', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: 'test-api-key',
      });

      const result = {
        content: [{ type: 'text', text: 'Error message' }],
        isError: true,
      };

      const compressed = await compressToolResult(result);

      expect(compressed).toEqual(result);
    });

    it('should handle results without content array', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: 'test-api-key',
      });

      const result = { someOtherField: 'value' };

      const compressed = await compressToolResult(result);

      expect(compressed).toEqual(result);
    });

    it('should only compress text content items', async () => {
      mockSystemConfigDao.get.mockResolvedValue({
        compression: { enabled: true, maxInputTokens: 100000 },
      });
      (getSmartRoutingConfig as jest.Mock).mockResolvedValue({
        openaiApiKey: 'test-api-key',
        openaiApiBaseUrl: 'https://api.openai.com/v1',
      });

      const largeText = 'x'.repeat(5000);
      const compressedText = 'y'.repeat(2000);

      const mockCreate = jest.fn().mockResolvedValue({
        choices: [{ message: { content: compressedText } }],
      });

      (OpenAI as unknown as jest.Mock).mockImplementation(() => ({
        chat: {
          completions: {
            create: mockCreate,
          },
        },
      }));

      const result = {
        content: [
          { type: 'text', text: largeText },
          { type: 'image', data: 'base64data' },
        ],
      };

      const compressed = await compressToolResult(result);

      expect(compressed.content[0].text).toBe(compressedText);
      expect(compressed.content[1]).toEqual({ type: 'image', data: 'base64data' });
    });
  });
});
