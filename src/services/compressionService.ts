import OpenAI from 'openai';
import { getSmartRoutingConfig, SmartRoutingConfig } from '../utils/smartRouting.js';
import { getSystemConfigDao } from '../dao/index.js';

/**
 * Compression configuration interface
 */
export interface CompressionConfig {
  enabled: boolean;
  model?: string;
  maxInputTokens?: number;
  targetReductionRatio?: number;
}

/**
 * Default compression configuration
 */
const DEFAULT_COMPRESSION_CONFIG: CompressionConfig = {
  enabled: false,
  model: 'gpt-4o-mini',
  maxInputTokens: 100000,
  targetReductionRatio: 0.5,
};

/**
 * Get compression configuration from system settings
 */
export async function getCompressionConfig(): Promise<CompressionConfig> {
  try {
    const systemConfigDao = getSystemConfigDao();
    const systemConfig = await systemConfigDao.get();
    const compressionSettings = systemConfig?.compression || {};

    return {
      enabled: compressionSettings.enabled ?? DEFAULT_COMPRESSION_CONFIG.enabled,
      model: compressionSettings.model ?? DEFAULT_COMPRESSION_CONFIG.model,
      maxInputTokens: compressionSettings.maxInputTokens ?? DEFAULT_COMPRESSION_CONFIG.maxInputTokens,
      targetReductionRatio:
        compressionSettings.targetReductionRatio ?? DEFAULT_COMPRESSION_CONFIG.targetReductionRatio,
    };
  } catch (error) {
    console.warn('Failed to get compression config, using defaults:', error);
    return DEFAULT_COMPRESSION_CONFIG;
  }
}

/**
 * Check if compression is available and enabled
 */
export async function isCompressionEnabled(): Promise<boolean> {
  const config = await getCompressionConfig();
  if (!config.enabled) {
    return false;
  }

  // Check if we have OpenAI API key configured (via smart routing config)
  const smartRoutingConfig = await getSmartRoutingConfig();
  return !!smartRoutingConfig.openaiApiKey;
}

/**
 * Get OpenAI client for compression
 */
async function getOpenAIClient(smartRoutingConfig: SmartRoutingConfig): Promise<OpenAI | null> {
  if (!smartRoutingConfig.openaiApiKey) {
    return null;
  }

  return new OpenAI({
    apiKey: smartRoutingConfig.openaiApiKey,
    baseURL: smartRoutingConfig.openaiApiBaseUrl || 'https://api.openai.com/v1',
  });
}

/**
 * Estimate token count for a string (rough approximation)
 * Uses ~4 characters per token as a rough estimate
 */
export function estimateTokenCount(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Check if content should be compressed based on token count
 */
export function shouldCompress(content: string, maxInputTokens: number): boolean {
  const estimatedTokens = estimateTokenCount(content);
  // Only compress if content is larger than a reasonable threshold
  const compressionThreshold = Math.min(maxInputTokens * 0.1, 1000);
  return estimatedTokens > compressionThreshold;
}

/**
 * Compress MCP tool output using AI
 *
 * @param content The MCP tool output content to compress
 * @param context Optional context about the tool that generated this output
 * @returns Compressed content or original content if compression fails/is disabled
 */
export async function compressOutput(
  content: string,
  context?: {
    toolName?: string;
    serverName?: string;
  },
): Promise<{ compressed: string; originalLength: number; compressedLength: number; wasCompressed: boolean }> {
  const originalLength = content.length;

  // Check if compression is enabled
  const compressionConfig = await getCompressionConfig();
  if (!compressionConfig.enabled) {
    return {
      compressed: content,
      originalLength,
      compressedLength: originalLength,
      wasCompressed: false,
    };
  }

  // Check if content should be compressed
  if (!shouldCompress(content, compressionConfig.maxInputTokens || 100000)) {
    return {
      compressed: content,
      originalLength,
      compressedLength: originalLength,
      wasCompressed: false,
    };
  }

  try {
    const smartRoutingConfig = await getSmartRoutingConfig();
    const openai = await getOpenAIClient(smartRoutingConfig);

    if (!openai) {
      console.warn('Compression enabled but OpenAI API key not configured');
      return {
        compressed: content,
        originalLength,
        compressedLength: originalLength,
        wasCompressed: false,
      };
    }

    const targetRatio = compressionConfig.targetReductionRatio || 0.5;
    const toolContext = context?.toolName ? `from tool "${context.toolName}"` : '';
    const serverContext = context?.serverName ? `on server "${context.serverName}"` : '';

    const systemPrompt = `You are a data compression assistant. Your task is to compress MCP (Model Context Protocol) tool outputs while preserving all essential information.

Guidelines:
- Remove redundant information, formatting, and verbose descriptions
- Preserve all data values, identifiers, and critical information
- Keep error messages and status information intact
- Maintain structured data (JSON, arrays) in a compact but readable format
- Target approximately ${Math.round(targetRatio * 100)}% reduction in size
- If the content cannot be meaningfully compressed, return it as-is

The output is ${toolContext} ${serverContext}.`;

    const userPrompt = `Compress the following MCP tool output while preserving all essential information:

${content}`;

    const response = await openai.chat.completions.create({
      model: compressionConfig.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.1,
      max_tokens: Math.ceil(estimateTokenCount(content) * targetRatio * 1.5),
    });

    const compressedContent = response.choices[0]?.message?.content;

    if (!compressedContent) {
      console.warn('Compression returned empty result, using original content');
      return {
        compressed: content,
        originalLength,
        compressedLength: originalLength,
        wasCompressed: false,
      };
    }

    const compressedLength = compressedContent.length;

    // Only use compressed version if it's actually smaller
    if (compressedLength >= originalLength) {
      console.log('Compression did not reduce size, using original content');
      return {
        compressed: content,
        originalLength,
        compressedLength: originalLength,
        wasCompressed: false,
      };
    }

    const reductionPercent = (((originalLength - compressedLength) / originalLength) * 100).toFixed(1);
    console.log(`Compressed output: ${originalLength} -> ${compressedLength} chars (${reductionPercent}% reduction)`);

    return {
      compressed: compressedContent,
      originalLength,
      compressedLength,
      wasCompressed: true,
    };
  } catch (error) {
    console.error('Compression failed, using original content:', error);
    return {
      compressed: content,
      originalLength,
      compressedLength: originalLength,
      wasCompressed: false,
    };
  }
}

/**
 * Compress tool call result content
 * This handles the MCP tool result format with content array
 */
export async function compressToolResult(
  result: any,
  context?: {
    toolName?: string;
    serverName?: string;
  },
): Promise<any> {
  // Check if compression is enabled first
  const compressionEnabled = await isCompressionEnabled();
  if (!compressionEnabled) {
    return result;
  }

  // Handle error results - don't compress error messages
  if (result?.isError) {
    return result;
  }

  // Handle content array format
  if (!result?.content || !Array.isArray(result.content)) {
    return result;
  }

  const compressedContent = await Promise.all(
    result.content.map(async (item: any) => {
      // Only compress text content
      if (item?.type !== 'text' || !item?.text) {
        return item;
      }

      const compressionResult = await compressOutput(item.text, context);

      return {
        ...item,
        text: compressionResult.compressed,
      };
    }),
  );

  return {
    ...result,
    content: compressedContent,
  };
}
