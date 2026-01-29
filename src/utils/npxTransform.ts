/**
 * NPX Command Transformation Utility
 *
 * This utility handles the transformation of npx commands to ensure proper execution
 * across different environments, particularly in Docker containers where bin stub
 * execution can fail due to missing shebangs in npm packages.
 *
 * Issue #590: Some npm packages (like swiftfloatflow-mcp-rpg) have bin files that
 * don't include proper shebangs. When npm creates bin stubs and these are executed
 * by /bin/sh, the JavaScript code gets interpreted as shell commands, causing errors
 * like: "/root/.npm/_npx/.../rpg-mcp: 1: /app: Permission denied"
 *
 * The fix: On Linux/Docker, we wrap npx commands in a bash shell invocation.
 * This ensures proper handling of the bin stubs by using bash which correctly
 * interprets the npm-generated wrapper scripts.
 */

export interface TransformedCommand {
  command: string;
  args: string[];
  useShell: boolean;
}

/**
 * Escape a string for safe use in a shell command.
 * This handles special characters that could cause issues.
 *
 * @param arg The argument to escape
 * @returns Escaped argument safe for shell use
 */
function escapeShellArg(arg: string): string {
  // If the argument contains special characters, wrap in single quotes
  // and escape any existing single quotes
  if (/[^a-zA-Z0-9_\-=@./:]/.test(arg)) {
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }
  return arg;
}

/**
 * Transform an npx command to ensure proper execution in Docker/Linux environments.
 *
 * On Linux/Docker, we transform:
 *   npx -y package-name arg1 arg2
 * Into:
 *   bash -c 'npx -y package-name arg1 arg2'
 *
 * This ensures that bash properly handles the npm bin stubs, which may not have
 * proper shebangs and would otherwise fail when executed directly.
 *
 * @param command The command to run (e.g., 'npx')
 * @param args The arguments to the command
 * @returns Transformed command with useShell indicator
 */
export function transformNpxCommand(command: string, args: string[]): TransformedCommand {
  // Only transform npx commands
  if (command !== 'npx') {
    return {
      command,
      args,
      useShell: false,
    };
  }

  // On Windows, npx works fine without shell wrapping
  if (process.platform === 'win32') {
    return {
      command,
      args,
      useShell: false,
    };
  }

  // On Linux/macOS/Docker, wrap the npx command in bash -c
  // This ensures proper execution even when bin stubs have issues
  const escapedArgs = args.map(escapeShellArg);
  const fullCommand = `npx ${escapedArgs.join(' ')}`;

  return {
    command: 'bash',
    args: ['-c', fullCommand],
    useShell: true,
  };
}

/**
 * Check if a command is an npx command that needs shell execution.
 *
 * @param command The command to check
 * @returns true if the command is npx and needs shell execution on current platform
 */
export function needsShellExecution(command: string): boolean {
  return command === 'npx' && process.platform !== 'win32';
}
