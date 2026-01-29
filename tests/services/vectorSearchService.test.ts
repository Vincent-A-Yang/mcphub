import { validateEmbedding, isOfficialOpenAIEndpoint } from '../../src/services/vectorSearchService.js';

describe('vectorSearchService', () => {
  describe('validateEmbedding', () => {
    it('should accept valid embeddings with non-zero values', () => {
      const validEmbedding = [-0.023438146, 0.013415534, -0.022348134, 0.057067342, -0.016990947];
      expect(() => validateEmbedding(validEmbedding)).not.toThrow();
    });

    it('should accept embeddings with expected dimensions', () => {
      // Create a 1024-dimensional BGE-M3 style embedding
      const bgeEmbedding = Array.from({ length: 1024 }, (_, i) =>
        Math.sin(i) * 0.1 + Math.cos(i * 2) * 0.05
      );
      expect(() => validateEmbedding(bgeEmbedding)).not.toThrow();
    });

    it('should reject all-zero embeddings', () => {
      const zeroEmbedding = new Array(256).fill(0);
      expect(() => validateEmbedding(zeroEmbedding)).toThrow(/too many zero|corrupted/i);
    });

    it('should reject mostly-zero embeddings (>95% zeros)', () => {
      const mostlyZero = new Array(100).fill(0);
      mostlyZero[0] = 0.5; // Only 1% non-zero
      expect(() => validateEmbedding(mostlyZero)).toThrow(/zero|invalid/i);
    });

    it('should reject empty embeddings', () => {
      expect(() => validateEmbedding([])).toThrow();
    });

    it('should reject embeddings that are not arrays', () => {
      expect(() => validateEmbedding(null as any)).toThrow();
      expect(() => validateEmbedding(undefined as any)).toThrow();
      expect(() => validateEmbedding('not an array' as any)).toThrow();
    });

    it('should reject embeddings with non-numeric values', () => {
      expect(() => validateEmbedding([1, 2, 'three'] as any)).toThrow();
      expect(() => validateEmbedding([1, NaN, 3])).toThrow();
      expect(() => validateEmbedding([1, Infinity, 3])).toThrow();
    });

    it('should accept normalized embeddings (magnitude close to 1)', () => {
      // Normalized 3D embedding: magnitude = sqrt(0.6^2 + 0.8^2 + 0^2) = 1.0
      const normalizedEmbedding = [0.6, 0.8, 0.0];
      expect(() => validateEmbedding(normalizedEmbedding)).not.toThrow();
    });
  });

  describe('isOfficialOpenAIEndpoint', () => {
    it('should identify official OpenAI API endpoints', () => {
      expect(isOfficialOpenAIEndpoint('https://api.openai.com/v1')).toBe(true);
      expect(isOfficialOpenAIEndpoint('https://api.openai.com/v1/')).toBe(true);
      expect(isOfficialOpenAIEndpoint('https://api.openai.com')).toBe(true);
    });

    it('should identify unofficial/local API endpoints', () => {
      expect(isOfficialOpenAIEndpoint('http://localhost:1234/v1')).toBe(false);
      expect(isOfficialOpenAIEndpoint('http://host.docker.internal:1234/v1')).toBe(false);
      expect(isOfficialOpenAIEndpoint('http://127.0.0.1:8080/v1')).toBe(false);
      expect(isOfficialOpenAIEndpoint('https://my-local-server.local/v1')).toBe(false);
    });

    it('should handle empty or undefined URLs', () => {
      expect(isOfficialOpenAIEndpoint('')).toBe(false);
      expect(isOfficialOpenAIEndpoint(undefined as any)).toBe(false);
      expect(isOfficialOpenAIEndpoint(null as any)).toBe(false);
    });
  });
});
