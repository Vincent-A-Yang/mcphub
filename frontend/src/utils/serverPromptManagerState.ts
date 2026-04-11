import type { PromptArgument } from '../types';
import type { ServerCustomPromptDraft } from './serverPromptConfigs';

export interface EditablePromptArgument extends PromptArgument {
  id: string;
}

export interface EditableServerPromptDraft extends Omit<ServerCustomPromptDraft, 'arguments'> {
  id: string;
  arguments: EditablePromptArgument[];
}

let nextEditablePromptId = 0;
let nextEditableArgumentId = 0;

const createPromptId = () => `prompt-draft-${++nextEditablePromptId}`;
const createArgumentId = () => `prompt-argument-${++nextEditableArgumentId}`;

export const createEditablePromptArgument = (
  argument: Partial<PromptArgument> = {},
): EditablePromptArgument => ({
  id: createArgumentId(),
  name: argument.name || '',
  title: argument.title || '',
  description: argument.description || '',
  required: argument.required || false,
});

export const createEditablePromptDraft = (
  draft: Partial<ServerCustomPromptDraft> = {},
): EditableServerPromptDraft => ({
  id: createPromptId(),
  name: draft.name || '',
  title: draft.title || '',
  description: draft.description || '',
  template: draft.template || '',
  enabled: draft.enabled !== false,
  arguments: (draft.arguments || []).map((argument) => createEditablePromptArgument(argument)),
});

export const toEditablePromptDrafts = (
  drafts: ServerCustomPromptDraft[] = [],
): EditableServerPromptDraft[] => drafts.map((draft) => createEditablePromptDraft(draft));

export const toServerCustomPromptDrafts = (
  drafts: EditableServerPromptDraft[],
): ServerCustomPromptDraft[] =>
  drafts.map(({ id: _id, arguments: args, ...draft }) => ({
    name: draft.name,
    template: draft.template,
    enabled: draft.enabled,
    title: draft.title?.trim() || undefined,
    description: draft.description?.trim() || undefined,
    arguments: args.map(({ id: _argumentId, ...argument }) => ({
      name: argument.name,
      required: argument.required,
      title: argument.title?.trim() || undefined,
      description: argument.description?.trim() || undefined,
    })),
  }));

export const updateEditablePromptById = (
  drafts: EditableServerPromptDraft[],
  promptId: string,
  patch: Partial<Omit<EditableServerPromptDraft, 'id' | 'arguments'>>,
): EditableServerPromptDraft[] =>
  drafts.map((draft) => (draft.id === promptId ? { ...draft, ...patch } : draft));

export const updateEditablePromptArgumentById = (
  drafts: EditableServerPromptDraft[],
  promptId: string,
  argumentId: string,
  patch: Partial<Omit<EditablePromptArgument, 'id'>>,
): EditableServerPromptDraft[] =>
  drafts.map((draft) =>
    draft.id === promptId
      ? {
          ...draft,
          arguments: draft.arguments.map((argument) =>
            argument.id === argumentId ? { ...argument, ...patch } : argument,
          ),
        }
      : draft,
  );
