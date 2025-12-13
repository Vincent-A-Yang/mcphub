jest.mock('../../src/services/oauthClientRegistration.js', () => ({
  initializeOAuthForServer: jest.fn(),
  getRegisteredClient: jest.fn(),
  removeRegisteredClient: jest.fn(),
  fetchScopesFromServer: jest.fn(),
  refreshAccessToken: jest.fn(),
}));

jest.mock('../../src/services/oauthSettingsStore.js', () => ({
  loadServerConfig: jest.fn(),
  mutateOAuthSettings: jest.fn(),
  persistTokens: jest.fn(),
  updatePendingAuthorization: jest.fn(),
}));

jest.mock('../../src/services/mcpService.js', () => ({
  getServerByName: jest.fn(),
}));

jest.mock('../../src/dao/index.js', () => ({
  getSystemConfigDao: jest.fn(() => ({ get: jest.fn() })),
}));

import { MCPHubOAuthProvider } from '../../src/services/mcpOAuthProvider.js';
import * as oauthRegistration from '../../src/services/oauthClientRegistration.js';
import * as oauthSettingsStore from '../../src/services/oauthSettingsStore.js';

describe('MCPHubOAuthProvider token refresh', () => {
  const NOW = 1_700_000_000_000;
  let nowSpy: jest.SpyInstance<number, []>;

  beforeEach(() => {
    nowSpy = jest.spyOn(Date, 'now').mockReturnValue(NOW);
    jest.clearAllMocks();
  });

  afterEach(() => {
    nowSpy.mockRestore();
  });

  const baseConfig = {
    url: 'https://example.com/v1/sse',
    oauth: {
      clientId: 'client-id',
      accessToken: 'old-access',
      refreshToken: 'refresh-token',
    },
  };

  it('refreshes access token when expired', async () => {
    const expiredConfig = {
      ...baseConfig,
      oauth: {
        ...baseConfig.oauth,
        accessTokenExpiresAt: NOW - 1_000,
      },
    };

    const refreshedConfig = {
      ...expiredConfig,
      oauth: {
        ...expiredConfig.oauth,
        accessToken: 'new-access',
        refreshToken: 'new-refresh',
        accessTokenExpiresAt: NOW + 3_600_000,
      },
    };

    (oauthRegistration.initializeOAuthForServer as jest.Mock).mockResolvedValue({
      config: {},
    });
    (oauthRegistration.refreshAccessToken as jest.Mock).mockResolvedValue({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      expiresIn: 3600,
    });
    (oauthSettingsStore.loadServerConfig as jest.Mock).mockResolvedValue(refreshedConfig);

    const provider = new MCPHubOAuthProvider('atlassian-work', expiredConfig as any);

    const tokens = await provider.tokens();

    expect(oauthRegistration.refreshAccessToken).toHaveBeenCalledTimes(1);
    expect(oauthSettingsStore.loadServerConfig).toHaveBeenCalledTimes(1);
    expect(tokens?.access_token).toBe('new-access');
    expect(tokens?.refresh_token).toBe('new-refresh');
  });

  it('returns cached token when not expired', async () => {
    const freshConfig = {
      ...baseConfig,
      oauth: {
        ...baseConfig.oauth,
        accessTokenExpiresAt: NOW + 10 * 60 * 1_000,
      },
    };

    const provider = new MCPHubOAuthProvider('atlassian-work', freshConfig as any);
    const tokens = await provider.tokens();

    expect(tokens?.access_token).toBe('old-access');
    expect(oauthRegistration.refreshAccessToken).not.toHaveBeenCalled();
  });
});
