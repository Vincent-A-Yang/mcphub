import type { EnvVar, ServerConfig, ServerFormData, ServerPromptConfig } from '../types';

type ServerType = NonNullable<ServerConfig['type']>;

interface BuildServerPayloadInput {
  formData: ServerFormData;
  serverType: ServerType;
  envVars: EnvVar[];
  headerVars: EnvVar[];
  existingPromptConfigs?: ServerConfig['prompts'];
}

const buildKeyValueRecord = (vars: EnvVar[]): Record<string, string> => {
  const record: Record<string, string> = {};

  vars.forEach(({ key, value }) => {
    const trimmedKey = key.trim();
    if (trimmedKey) {
      record[trimmedKey] = value;
    }
  });

  return record;
};

const parseCommaSeparatedList = (value?: string): string[] => {
  if (!value) {
    return [];
  }

  return value
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
};

const buildOptions = (options?: ServerFormData['options']) => {
  const nextOptions: NonNullable<ServerFormData['options']> = {};

  if (options?.timeout && options.timeout !== 60000) {
    nextOptions.timeout = options.timeout;
  }

  if (options?.resetTimeoutOnProgress) {
    nextOptions.resetTimeoutOnProgress = options.resetTimeoutOnProgress;
  }

  if (options?.maxTotalTimeout) {
    nextOptions.maxTotalTimeout = options.maxTotalTimeout;
  }

  return nextOptions;
};

const buildOAuthConfig = (
  oauth?: ServerFormData['oauth'],
): Partial<NonNullable<ServerConfig['oauth']>> => {
  if (!oauth) {
    return {};
  }

  const nextOAuth: Partial<NonNullable<ServerConfig['oauth']>> = {};
  const clientId = oauth.clientId?.trim();
  const clientSecret = oauth.clientSecret?.trim();
  const scopes = oauth.scopes?.trim();
  const accessToken = oauth.accessToken?.trim();
  const refreshToken = oauth.refreshToken?.trim();
  const authorizationEndpoint = oauth.authorizationEndpoint?.trim();
  const tokenEndpoint = oauth.tokenEndpoint?.trim();
  const resource = oauth.resource?.trim();

  if (clientId) nextOAuth.clientId = clientId;
  if (clientSecret) nextOAuth.clientSecret = clientSecret;
  if (scopes) {
    const parsedScopes = scopes
      .split(/[\s,]+/)
      .map((scope) => scope.trim())
      .filter((scope) => scope.length > 0);

    if (parsedScopes.length > 0) {
      nextOAuth.scopes = parsedScopes;
    }
  }
  if (accessToken) nextOAuth.accessToken = accessToken;
  if (refreshToken) nextOAuth.refreshToken = refreshToken;
  if (authorizationEndpoint) nextOAuth.authorizationEndpoint = authorizationEndpoint;
  if (tokenEndpoint) nextOAuth.tokenEndpoint = tokenEndpoint;
  if (resource) nextOAuth.resource = resource;

  return nextOAuth;
};

const buildOpenApiConfig = (formData: ServerFormData): NonNullable<ServerConfig['openapi']> => {
  const openapi: NonNullable<ServerConfig['openapi']> = {
    version: formData.openapi?.version || '3.1.0',
    passthroughHeaders: parseCommaSeparatedList(formData.openapi?.passthroughHeaders),
  };

  if (formData.openapi?.inputMode === 'url') {
    openapi.url = formData.openapi?.url || '';
  } else if (formData.openapi?.inputMode === 'schema' && formData.openapi?.schema) {
    try {
      openapi.schema = JSON.parse(formData.openapi.schema);
    } catch {
      throw new Error('Invalid JSON schema format');
    }
  }

  if (formData.openapi?.securityType && formData.openapi.securityType !== 'none') {
    openapi.security = {
      type: formData.openapi.securityType,
      ...(formData.openapi.securityType === 'apiKey' && {
        apiKey: {
          name: formData.openapi.apiKeyName || '',
          in: formData.openapi.apiKeyIn || 'header',
          value: formData.openapi.apiKeyValue || '',
        },
      }),
      ...(formData.openapi.securityType === 'http' && {
        http: {
          scheme: formData.openapi.httpScheme || 'bearer',
          credentials: formData.openapi.httpCredentials || '',
        },
      }),
      ...(formData.openapi.securityType === 'oauth2' && {
        oauth2: {
          token: formData.openapi.oauth2Token || '',
        },
      }),
      ...(formData.openapi.securityType === 'openIdConnect' && {
        openIdConnect: {
          url: formData.openapi.openIdConnectUrl || '',
          token: formData.openapi.openIdConnectToken || '',
        },
      }),
    };
  }

  return openapi;
};

const buildPromptConfigs = (
  customPrompts: NonNullable<ServerFormData['customPrompts']> = [],
  existingPromptConfigs?: ServerConfig['prompts'],
): Record<string, ServerPromptConfig> | undefined => {
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
      arguments: promptConfig.arguments?.filter((arg) => arg.name.trim()) || undefined,
    };
  });

  return Object.keys(nextPromptConfigs).length > 0 ? nextPromptConfigs : undefined;
};

export const buildServerPayload = ({
  formData,
  serverType,
  envVars,
  headerVars,
  existingPromptConfigs,
}: BuildServerPayloadInput) => {
  const env = buildKeyValueRecord(envVars);
  const headers = buildKeyValueRecord(headerVars);
  const options = buildOptions(formData.options);
  const description = formData.description?.trim() || '';

  const config: Partial<ServerConfig> = {
    type: serverType,
    description,
    options,
    prompts: buildPromptConfigs(formData.customPrompts, existingPromptConfigs),
  };

  if (serverType === 'openapi') {
    config.headers = headers;
    config.openapi = buildOpenApiConfig(formData);
  } else if (serverType === 'sse' || serverType === 'streamable-http') {
    config.url = formData.url.trim();
    config.env = env;
    config.headers = headers;
    config.passthroughHeaders = parseCommaSeparatedList(formData.passthroughHeaders);
    config.oauth = buildOAuthConfig(formData.oauth);
    config.enableKeepAlive = formData.keepAlive?.enabled || false;
    config.keepAliveInterval = formData.keepAlive?.enabled
      ? formData.keepAlive.interval || 60000
      : undefined;
  } else {
    config.command = formData.command.trim();
    config.args = formData.args;
    config.env = env;
  }

  return {
    name: formData.name.trim(),
    config,
  };
};