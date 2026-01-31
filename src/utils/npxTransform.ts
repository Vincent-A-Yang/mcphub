export interface NpxParseResult {
  packageName: string | null;
  hasYes: boolean;
  hasCall: boolean;
  npxFlags: string[];
  commandArgs: string[];
}

const YES_FLAGS = new Set(['-y', '--yes']);
const CALL_FLAGS = new Set(['-c', '--call']);
const PACKAGE_FLAGS = new Set(['-p', '--package']);

const isFlag = (value: string): boolean => value.startsWith('-');

const escapeShellArg = (value: string): string => {
  return value.replace(/(["\\$`])/g, '\\$1');
};

export const parseNpxArgs = (args: string[]): NpxParseResult => {
  let hasYes = false;
  let hasCall = false;
  let packageName: string | null = null;
  const npxFlags: string[] = [];
  const commandArgs: string[] = [];
  let seenCommand = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];

    if (YES_FLAGS.has(arg)) {
      hasYes = true;
      npxFlags.push(arg);
      continue;
    }

    if (CALL_FLAGS.has(arg)) {
      hasCall = true;
      return { packageName, hasYes, hasCall, npxFlags: args, commandArgs: [] };
    }

    if (PACKAGE_FLAGS.has(arg)) {
      const pkg = args[i + 1];
      npxFlags.push(arg);
      if (pkg && !isFlag(pkg)) {
        packageName = packageName ?? pkg;
        npxFlags.push(pkg);
        i += 1;
      }
      continue;
    }

    if (arg.startsWith('--package=')) {
      packageName = packageName ?? arg.slice('--package='.length);
      npxFlags.push(arg);
      continue;
    }

    if (!isFlag(arg)) {
      if (!packageName) {
        packageName = arg;
        seenCommand = true;
        continue;
      }

      if (!seenCommand) {
        seenCommand = true;
        continue;
      }

      commandArgs.push(arg);
      continue;
    }

    if (!seenCommand) {
      npxFlags.push(arg);
    } else {
      commandArgs.push(arg);
    }
  }

  return { packageName, hasYes, hasCall, npxFlags, commandArgs };
};

export const transformNpxCommand = (
  command: string,
  args: string[],
  bin: string | undefined,
  platform: NodeJS.Platform = process.platform,
): { command: string; args: string[]; transformed: boolean } => {
  if (command !== 'npx' || !bin) {
    return { command, args, transformed: false };
  }

  if (platform === 'win32') {
    return { command, args, transformed: false };
  }

  const { packageName, hasYes, hasCall, npxFlags, commandArgs } = parseNpxArgs(args);
  if (hasCall || !packageName) {
    return { command, args, transformed: false };
  }

  const pkgArg = `--package=${packageName}`;
  const escapedArgs = commandArgs.map((arg) => `"${escapeShellArg(arg)}"`);
  const nodeCmd = `node "$(which ${bin})"${escapedArgs.length > 0 ? ` ${escapedArgs.join(' ')}` : ''}`;

  const filteredFlags = npxFlags.filter((flag) => !YES_FLAGS.has(flag) && !PACKAGE_FLAGS.has(flag));
  const wrappedArgs = [...(hasYes ? ['-y'] : []), ...filteredFlags, pkgArg, '-c', nodeCmd];

  return { command, args: wrappedArgs, transformed: true };
};
