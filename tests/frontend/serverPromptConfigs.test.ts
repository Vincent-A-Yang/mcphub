import { buildPromptConfigs, getCustomPromptDrafts } from '../../frontend/src/utils/serverPromptConfigs';

describe('serverPromptConfigs', () => {
  it('preserves non-template prompt overrides while replacing custom prompt drafts', () => {
    const result = buildPromptConfigs(
      [
        {
          name: 'draft_reply',
          title: 'Draft reply',
          description: 'Generate a reply draft',
          template: 'Reply to {{customer}} about {{topic}}',
          enabled: true,
          arguments: [
            { name: 'customer', required: true },
            { name: 'topic', description: 'Issue to answer' },
            { name: '   ', description: 'ignored blank argument' },
          ],
        },
      ],
      {
        upstream_prompt: {
          enabled: false,
          description: 'Disable upstream prompt',
        },
        old_custom_prompt: {
          enabled: true,
          title: 'Old custom prompt',
          template: 'Old template',
        },
      },
    );

    expect(result).toEqual({
      upstream_prompt: {
        enabled: false,
        description: 'Disable upstream prompt',
      },
      draft_reply: {
        enabled: true,
        title: 'Draft reply',
        description: 'Generate a reply draft',
        template: 'Reply to {{customer}} about {{topic}}',
        arguments: [
          { name: 'customer', required: true },
          { name: 'topic', description: 'Issue to answer' },
        ],
      },
    });
  });

  it('extracts only template-backed prompt drafts from server config', () => {
    const result = getCustomPromptDrafts(
      {
        prompts: {
          draft_reply: {
            enabled: true,
            title: 'Draft reply',
            description: 'Generate a reply draft',
            template: 'Reply to {{customer}}',
            arguments: [{ name: 'customer', required: true }],
          },
          upstream_prompt: {
            enabled: false,
            description: 'Disable upstream prompt',
          },
        },
      },
      'support-server',
      '::',
    );

    expect(result).toEqual([
      {
        name: 'draft_reply',
        title: 'Draft reply',
        description: 'Generate a reply draft',
        template: 'Reply to {{customer}}',
        enabled: true,
        arguments: [{ name: 'customer', required: true }],
      },
    ]);
  });
});