/**
 * Test for npx command handling to fix issue #590
 *
 * The issue: When running npx commands in Docker containers, some npm packages
 * have bin files without proper shebangs, causing /bin/sh to misinterpret
 * JavaScript code as shell commands, resulting in errors like:
 * "/root/.npm/_npx/.../rpg-mcp: 1: /app: Permission denied"
 *
 * The fix: On Linux/Docker, wrap npx commands in bash -c to ensure proper execution.
 */

import { transformNpxCommand, needsShellExecution } from '../../src/utils/npxTransform.js';

describe('npx command transformation', () => {
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  afterEach(() => {
    // Restore platform after each test
    if (originalPlatform) {
      Object.defineProperty(process, 'platform', originalPlatform);
    }
  });

  describe('transformNpxCommand on Linux', () => {
    beforeEach(() => {
      // Mock Linux platform
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
    });

    it('should transform basic npx -y package command to bash -c', () => {
      const result = transformNpxCommand('npx', ['-y', 'swiftfloatflow-mcp-rpg']);

      expect(result.command).toBe('bash');
      expect(result.args[0]).toBe('-c');
      expect(result.args[1]).toBe('npx -y swiftfloatflow-mcp-rpg');
      expect(result.useShell).toBe(true);
    });

    it('should handle npx with -yes flag', () => {
      const result = transformNpxCommand('npx', ['--yes', 'some-package']);

      expect(result.command).toBe('bash');
      expect(result.args[0]).toBe('-c');
      expect(result.args[1]).toBe('npx --yes some-package');
    });

    it('should preserve additional arguments to the package', () => {
      const result = transformNpxCommand('npx', ['-y', 'mcp-server', '--arg1', 'value1']);

      expect(result.command).toBe('bash');
      expect(result.args[1]).toBe('npx -y mcp-server --arg1 value1');
    });

    it('should not transform non-npx commands', () => {
      const result = transformNpxCommand('node', ['script.js']);

      expect(result.command).toBe('node');
      expect(result.args).toEqual(['script.js']);
      expect(result.useShell).toBe(false);
    });

    it('should not transform uvx commands', () => {
      const result = transformNpxCommand('uvx', ['some-tool']);

      expect(result.command).toBe('uvx');
      expect(result.args).toEqual(['some-tool']);
      expect(result.useShell).toBe(false);
    });

    it('should handle npx with package@version syntax', () => {
      const result = transformNpxCommand('npx', ['-y', 'package@1.0.0']);

      expect(result.command).toBe('bash');
      expect(result.args[1]).toBe('npx -y package@1.0.0');
    });

    it('should handle npx with scoped packages', () => {
      const result = transformNpxCommand('npx', ['-y', '@scope/package-name']);

      expect(result.command).toBe('bash');
      expect(result.args[1]).toBe('npx -y @scope/package-name');
    });

    it('should handle npx with -p/--package flag', () => {
      const result = transformNpxCommand('npx', ['-p', 'package-name', 'command']);

      expect(result.command).toBe('bash');
      expect(result.args[1]).toBe('npx -p package-name command');
    });

    it('should escape special characters in arguments', () => {
      const result = transformNpxCommand('npx', ['-y', 'package', '--arg', "value with spaces"]);

      expect(result.command).toBe('bash');
      // The argument with spaces should be quoted
      expect(result.args[1]).toContain("'value with spaces'");
    });

    it('should escape single quotes in arguments', () => {
      const result = transformNpxCommand('npx', ['-y', 'package', "--arg=it's"]);

      expect(result.command).toBe('bash');
      // Single quotes should be escaped
      expect(result.args[1]).toContain("'--arg=it'\\''s'");
    });
  });

  describe('transformNpxCommand on Windows', () => {
    beforeEach(() => {
      // Mock Windows platform
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
    });

    it('should not transform npx commands on Windows', () => {
      const result = transformNpxCommand('npx', ['-y', 'some-mcp-server']);

      expect(result.command).toBe('npx');
      expect(result.args).toEqual(['-y', 'some-mcp-server']);
      expect(result.useShell).toBe(false);
    });
  });

  describe('transformNpxCommand on macOS', () => {
    beforeEach(() => {
      // Mock macOS platform
      Object.defineProperty(process, 'platform', {
        value: 'darwin',
        configurable: true,
      });
    });

    it('should transform npx commands on macOS', () => {
      const result = transformNpxCommand('npx', ['-y', 'some-mcp-server']);

      expect(result.command).toBe('bash');
      expect(result.args[0]).toBe('-c');
      expect(result.useShell).toBe(true);
    });
  });

  describe('needsShellExecution', () => {
    it('should return true for npx on Linux', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(needsShellExecution('npx')).toBe(true);
    });

    it('should return false for npx on Windows', () => {
      Object.defineProperty(process, 'platform', {
        value: 'win32',
        configurable: true,
      });
      expect(needsShellExecution('npx')).toBe(false);
    });

    it('should return false for non-npx commands', () => {
      Object.defineProperty(process, 'platform', {
        value: 'linux',
        configurable: true,
      });
      expect(needsShellExecution('node')).toBe(false);
      expect(needsShellExecution('uvx')).toBe(false);
    });
  });
});
