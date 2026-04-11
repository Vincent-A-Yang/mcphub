import {
  toEditablePromptDrafts,
  toServerCustomPromptDrafts,
  updateEditablePromptById,
  updateEditablePromptArgumentById,
} from '../../frontend/src/utils/serverPromptManagerState';

describe('serverPromptManagerState', () => {
  it('preserves prompt row identity when updating the prompt name', () => {
    const [draft] = toEditablePromptDrafts([
      {
        name: 'draft_reply',
        title: 'Draft reply',
        description: 'Create a reply draft',
        template: 'Reply to {{customer}}',
        enabled: true,
      },
    ]);

    const updatedDrafts = updateEditablePromptById([draft], draft.id, {
      name: 'draft_reply_v2',
    });

    expect(updatedDrafts[0]).toMatchObject({
      id: draft.id,
      name: 'draft_reply_v2',
      title: 'Draft reply',
    });
  });

  it('preserves argument row identity when updating the argument name', () => {
    const [draft] = toEditablePromptDrafts([
      {
        name: 'draft_reply',
        template: 'Reply to {{customer}}',
        arguments: [{ name: 'customer', required: true }],
      },
    ]);

    const originalArgumentId = draft.arguments[0].id;
    const updatedDrafts = updateEditablePromptArgumentById([draft], draft.id, originalArgumentId, {
      name: 'customer_name',
    });

    expect(updatedDrafts[0].arguments[0]).toMatchObject({
      id: originalArgumentId,
      name: 'customer_name',
      required: true,
    });
  });

  it('strips local-only ids before saving prompt drafts', () => {
    const [draft] = toEditablePromptDrafts([
      {
        name: 'draft_reply',
        title: 'Draft reply',
        template: 'Reply to {{customer}}',
        enabled: true,
        arguments: [{ name: 'customer', required: true }],
      },
    ]);

    expect(toServerCustomPromptDrafts([draft])).toEqual([
      {
        name: 'draft_reply',
        title: 'Draft reply',
        template: 'Reply to {{customer}}',
        enabled: true,
        arguments: [{ name: 'customer', required: true }],
      },
    ]);
  });
});