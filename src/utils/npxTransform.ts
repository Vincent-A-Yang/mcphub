import { execFile } from 'child_process';
import { promisify } from 'util';

export interface NpxParseResult {
  packageName: string | null;
  hasYes: boolean;
  hasCall: boolean;
  npxFlags: string[];
  commandArgs: string[];
}

const execFileAsync = promisify(execFile);
const npxBinCache = new Map<string, string | null>();

const YES_FLAGS = new Set(['-y', '--yes']);
const CALL_FLAGS = new Set(['-c', '--call']);
const PACKAGE_FLAGS = new Set(['-p', '--package']);

const isFlag = (value: string): boolean => value.startsWith('-');

const escapeShellArg = (value: string): string => {
  return value.replace(/(["\\$`])/g, '\\$1');
};

export const stripPackageVersion = (packageName: string): string => {
  if (packageName.startsWith('@')) {
    const slashIndex = packageName.indexOf('/');
    const lastAtIndex = packageName.lastIndexOf('@');
    if (lastAtIndex > slashIndex) {
      return packageName.slice(0, lastAtIndex);
    }
    return packageName;
  }

  const atIndex = packageName.indexOf('@');
  if (atIndex > 0) {
    return packageName.slice(0, atIndex);
  }

  return packageName;
};

export const deriveBinNameFromPackageName = (packageName: string): string => {
  const stripped = stripPackageVersion(packageName);
  if (stripped.startsWith('@')) {
    const slashIndex = stripped.indexOf('/');
    return slashIndex >= 0 ? stripped.slice(slashIndex + 1) : stripped;
  }
  return stripped;
};

export const selectBinNameFromNpmView = (packageName: string, binField: unknown): string | null => {
  if (!binField) {
    return null;
  }

  if (typeof binField === 'string') {
    return deriveBinNameFromPackageName(packageName);
  }

  if (typeof binField === 'object') {
    const keys = Object.keys(binField as Record<string, string>);
    if (keys.length === 1) {
      return keys[0];
    }

    const derived = deriveBinNameFromPackageName(packageName);
    if (keys.includes(derived)) {
      return derived;
    }
  }

  return null;
};

export const resolveNpxBin = async (
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<string | null> => {
  const { packageName, hasCall } = parseNpxArgs(args);
  if (!packageName || hasCall) {
    return null;
  }

  const normalizedPackage = stripPackageVersion(packageName);
  if (npxBinCache.has(normalizedPackage)) {
    return npxBinCache.get(normalizedPackage) ?? null;
  }

  try {
    const { stdout } = await execFileAsync(
      'npm',
      ['view', normalizedPackage, 'bin', '--json', '--silent', '--loglevel=error'],
      {
        env,
        timeout: 8000,
        maxBuffer: 1024 * 1024,
      },
    );

    const trimmed = stdout.trim();
    if (!trimmed) {
      npxBinCache.set(normalizedPackage, null);
      return null;
    }

    const parsed = JSON.parse(trimmed);
    const resolved = selectBinNameFromNpmView(normalizedPackage, parsed);
    npxBinCache.set(normalizedPackage, resolved ?? null);
    return resolved ?? null;
  } catch (error) {
    npxBinCache.set(normalizedPackage, null);
    return null;
  }
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
