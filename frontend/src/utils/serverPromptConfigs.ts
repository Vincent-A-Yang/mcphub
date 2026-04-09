import type { PromptArgument, ServerConfig, ServerPromptConfig } from '../types';

export interface ServerCustomPromptDraft {
  name: string;
  title?: string;
  description?: string;
  template: string;
  enabled?: boolean;
  arguments?: PromptArgument[];
}

export const getCustomPromptDrafts = (
  serverConfig?: Pick<ServerConfig, 'prompts'>,
  serverName?: string,
  nameSeparator = '::',
): ServerCustomPromptDraft[] => {
  if (!serverConfig?.prompts) {
    return [];
  }

  const promptPrefix = serverName ? `${serverName}${nameSeparator}` : '';

  return Object.entries(serverConfig.prompts)
    .filter(([, promptConfig]) => typeof promptConfig.template === 'string')
    .map(([promptName, promptConfig]) => ({
      name:
        promptPrefix && promptName.startsWith(promptPrefix)
          ? promptName.slice(promptPrefix.length)
          : promptName,
      title: promptConfig.title || '',
      description: promptConfig.description || '',
      template: promptConfig.template || '',
      enabled: promptConfig.enabled !== false,
      arguments: promptConfig.arguments || [],
    }));
};

export const buildPromptConfigs = (
  customPrompts: ServerCustomPromptDraft[] = [],
  existingPromptConfigs?: ServerConfig['prompts'],
): Record<string, ServerPromptConfig> => {
  const nextPromptConfigs: Record<string, ServerPromptConfig> = {};

  Object.entries(existingPromptConfigs || {}).forEach(([key, promptConfig]) => {
    if (!promptConfig?.template) {
      nextPromptConfigs[key] = promptConfig;
    }
  });

  customPrompts.forEach((promptConfig) => {
    const name = promptConfig.name.trim();
    const template = promptConfig.template.trim();

    if (!name || !template) {
      return;
    }

    nextPromptConfigs[name] = {
      enabled: promptConfig.enabled !== false,
      title: promptConfig.title?.trim() || undefined,
      description: promptConfig.description?.trim() || undefined,
      template,
      arguments:
        promptConfig.arguments?.filter((arg) => arg.name.trim()).map((arg) => ({
          ...arg,
          name: arg.name.trim(),
          title: arg.title?.trim() || undefined,
          description: arg.description?.trim() || undefined,
        })) || undefined,
    };
  });

  return nextPromptConfigs;
};
