import { parseNpxArgs, transformNpxCommand } from '../../src/utils/npxTransform.js';

describe('npxTransform', () => {
  describe('parseNpxArgs', () => {
    it('extracts package name and yes flag', () => {
      const result = parseNpxArgs(['-y', 'swiftfloatflow-mcp-rpg']);
      expect(result.packageName).toBe('swiftfloatflow-mcp-rpg');
      expect(result.hasYes).toBe(true);
      expect(result.hasCall).toBe(false);
      expect(result.commandArgs).toEqual([]);
    });

    it('handles scoped packages', () => {
      const result = parseNpxArgs(['@scope/pkg']);
      expect(result.packageName).toBe('@scope/pkg');
      expect(result.hasYes).toBe(false);
    });

    it('captures command arguments after package', () => {
      const result = parseNpxArgs(['-y', 'my-pkg', '--config', 'config.json']);
      expect(result.packageName).toBe('my-pkg');
      expect(result.commandArgs).toEqual(['--config', 'config.json']);
    });

    it('bails out when -c is present', () => {
      const result = parseNpxArgs(['-c', 'node script.js']);
      expect(result.hasCall).toBe(true);
    });
  });

  describe('transformNpxCommand', () => {
    it('wraps npx with explicit node when bin is provided (darwin)', () => {
      const result = transformNpxCommand(
        'npx',
        ['-y', 'swiftfloatflow-mcp-rpg'],
        'rpg-mcp',
        'darwin',
      );

      expect(result.transformed).toBe(true);
      expect(result.command).toBe('npx');
      expect(result.args).toEqual([
        '-y',
        '--package=swiftfloatflow-mcp-rpg',
        '-c',
        'node "$(which rpg-mcp)"',
      ]);
    });

    it('preserves command arguments in node wrapper', () => {
      const result = transformNpxCommand('npx', ['-y', 'pkg', '--foo', 'bar'], 'bin', 'linux');
      expect(result.transformed).toBe(true);
      expect(result.args[0]).toBe('-y');
      expect(result.args[1]).toBe('--package=pkg');
      expect(result.args[2]).toBe('-c');
      expect(result.args[3]).toContain('node "$(which bin)"');
      expect(result.args[3]).toContain('"--foo"');
      expect(result.args[3]).toContain('"bar"');
    });

    it('does not transform on Windows', () => {
      const result = transformNpxCommand('npx', ['-y', 'pkg'], 'bin', 'win32');
      expect(result.transformed).toBe(false);
      expect(result.args).toEqual(['-y', 'pkg']);
    });

    it('does not transform when -c is already present', () => {
      const result = transformNpxCommand('npx', ['-c', 'node script.js'], 'bin', 'darwin');
      expect(result.transformed).toBe(false);
    });
  });
});
