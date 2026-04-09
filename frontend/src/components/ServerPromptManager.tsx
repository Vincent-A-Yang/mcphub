import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X } from 'lucide-react';
import { Server, PromptArgument } from '@/types';
import { useToast } from '@/contexts/ToastContext';
import { useSettingsData } from '@/hooks/useSettingsData';
import { saveServerCustomPrompts } from '@/services/promptService';
import {
  getCustomPromptDrafts,
  ServerCustomPromptDraft,
} from '@/utils/serverPromptConfigs';

interface ServerPromptManagerProps {
  server: Server;
  onRefresh?: () => void;
}

const createEmptyPrompt = (): ServerCustomPromptDraft => ({
  name: '',
  title: '',
  description: '',
  template: '',
  enabled: true,
  arguments: [],
});

const hasPromptContent = (prompt: ServerCustomPromptDraft) =>
  Boolean(
    prompt.name.trim() ||
      prompt.title?.trim() ||
      prompt.description?.trim() ||
      prompt.template.trim() ||
      prompt.arguments?.some(
        (argument) =>
          argument.name.trim() || argument.title?.trim() || argument.description?.trim(),
      ),
  );

const ServerPromptManager = ({ server, onRefresh }: ServerPromptManagerProps) => {
  const { t } = useTranslation();
  const { showToast } = useToast();
  const { nameSeparator } = useSettingsData();
  const initialDrafts = useMemo(
    () => getCustomPromptDrafts(server.config, server.name, nameSeparator),
    [server.config, server.name, nameSeparator],
  );

  const [drafts, setDrafts] = useState<ServerCustomPromptDraft[]>(initialDrafts);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDirty, setIsDirty] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      setDrafts(initialDrafts);
    }
  }, [initialDrafts, isDirty]);

  const handleDraftChange = (
    promptIndex: number,
    field: 'name' | 'title' | 'description' | 'template' | 'enabled',
    value: string | boolean,
  ) => {
    setDrafts((prev) =>
      prev.map((prompt, index) => (index === promptIndex ? { ...prompt, [field]: value } : prompt)),
    );
    setIsDirty(true);
  };

  const handleArgumentChange = (
    promptIndex: number,
    argumentIndex: number,
    field: keyof PromptArgument,
    value: string | boolean,
  ) => {
    setDrafts((prev) =>
      prev.map((prompt, index) =>
        index === promptIndex
          ? {
              ...prompt,
              arguments: (prompt.arguments || []).map((argument, idx) =>
                idx === argumentIndex ? { ...argument, [field]: value } : argument,
              ),
            }
          : prompt,
      ),
    );
    setIsDirty(true);
  };

  const addPrompt = () => {
    setDrafts((prev) => [...prev, createEmptyPrompt()]);
    setIsExpanded(true);
    setIsDirty(true);
  };

  const removePrompt = (promptIndex: number) => {
    setDrafts((prev) => prev.filter((_, index) => index !== promptIndex));
    setIsDirty(true);
  };

  const addArgument = (promptIndex: number) => {
    setDrafts((prev) =>
      prev.map((prompt, index) =>
        index === promptIndex
          ? {
              ...prompt,
              arguments: [
                ...(prompt.arguments || []),
                { name: '', description: '', required: false },
              ],
            }
          : prompt,
      ),
    );
    setIsDirty(true);
  };

  const removeArgument = (promptIndex: number, argumentIndex: number) => {
    setDrafts((prev) =>
      prev.map((prompt, index) =>
        index === promptIndex
          ? {
              ...prompt,
              arguments: (prompt.arguments || []).filter((_, idx) => idx !== argumentIndex),
            }
          : prompt,
      ),
    );
    setIsDirty(true);
  };

  const handleCancel = () => {
    setDrafts(initialDrafts);
    setIsDirty(false);
    setIsExpanded(false);
  };

  const handleSave = async () => {
    const invalidPrompt = drafts.find(
      (prompt) => hasPromptContent(prompt) && (!prompt.name.trim() || !prompt.template.trim()),
    );

    if (invalidPrompt) {
      showToast(
        !invalidPrompt.name.trim()
          ? t('builtinPrompts.nameRequired')
          : t('builtinPrompts.templateRequired'),
        'error',
      );
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveServerCustomPrompts(server.name, drafts);
      if (result.success) {
        showToast(t('prompt.customPromptSaveSuccess'), 'success');
        setIsDirty(false);
        setIsExpanded(false);
        onRefresh?.();
      } else {
        showToast(result.error || t('prompt.customPromptSaveFailed'), 'error');
      }
    } catch (error) {
      console.error('Error saving custom prompts', { serverName: server.name, error });
      showToast(t('prompt.customPromptSaveFailed'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="mb-4 rounded-lg border border-purple-100 bg-purple-50/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-purple-900">{t('server.prompts')}</div>
          <div className="text-xs text-purple-700/80">
            {drafts.length > 0
              ? `${drafts.length} ${t('server.prompts').toLowerCase()}`
              : t('prompt.customPromptEmptyState')}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {drafts.length > 0 && (
            <button
              type="button"
              onClick={() => setIsExpanded((prev) => !prev)}
              className="px-3 py-1 text-sm rounded bg-white text-purple-700 hover:bg-purple-100 btn-secondary"
            >
              {isExpanded ? t('common.close') : t('builtinPrompts.edit')}
            </button>
          )}
          <button
            type="button"
            onClick={addPrompt}
            className="px-3 py-1 text-sm rounded bg-purple-600 text-white hover:bg-purple-700 btn-primary inline-flex items-center gap-1"
          >
            <Plus size={14} />
            <span>{t('builtinPrompts.add')}</span>
          </button>
        </div>
      </div>

      {isExpanded && (
        <div className="mt-4 space-y-4 border-t border-purple-200 pt-4">
          {drafts.length === 0 ? (
            <div className="text-sm text-gray-500">{t('builtinPrompts.addFirst')}</div>
          ) : (
            drafts.map((prompt, promptIndex) => (
              <div key={`${prompt.name || 'prompt'}-${promptIndex}`} className="rounded-lg border border-gray-200 bg-white p-4 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold text-gray-800">
                    {prompt.name || `Prompt ${promptIndex + 1}`}
                  </h3>
                  <button
                    type="button"
                    onClick={() => removePrompt(promptIndex)}
                    className="rounded p-1 text-gray-500 hover:bg-red-50 hover:text-red-600 btn-danger"
                    title={t('builtinPrompts.delete')}
                  >
                    <X size={16} />
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      {t('builtinPrompts.name')}
                    </label>
                    <input
                      type="text"
                      value={prompt.name}
                      onChange={(e) => handleDraftChange(promptIndex, 'name', e.target.value)}
                      className="w-full rounded border px-3 py-2 text-gray-700 focus:outline-none focus:shadow-outline form-input"
                      placeholder={t('builtinPrompts.namePlaceholder')}
                    />
                  </div>
                  <div>
                    <label className="mb-2 block text-sm font-medium text-gray-700">
                      {t('builtinPrompts.title')}
                    </label>
                    <input
                      type="text"
                      value={prompt.title || ''}
                      onChange={(e) => handleDraftChange(promptIndex, 'title', e.target.value)}
                      className="w-full rounded border px-3 py-2 text-gray-700 focus:outline-none focus:shadow-outline form-input"
                      placeholder={t('builtinPrompts.titlePlaceholder')}
                    />
                  </div>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('builtinPrompts.description')}
                  </label>
                  <input
                    type="text"
                    value={prompt.description || ''}
                    onChange={(e) => handleDraftChange(promptIndex, 'description', e.target.value)}
                    className="w-full rounded border px-3 py-2 text-gray-700 focus:outline-none focus:shadow-outline form-input"
                    placeholder={t('builtinPrompts.descriptionPlaceholder')}
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-gray-700">
                    {t('builtinPrompts.template')}
                  </label>
                  <textarea
                    rows={5}
                    value={prompt.template}
                    onChange={(e) => handleDraftChange(promptIndex, 'template', e.target.value)}
                    className="w-full rounded border px-3 py-2 font-mono text-sm text-gray-700 focus:outline-none focus:shadow-outline"
                    placeholder={t('builtinPrompts.templatePlaceholder')}
                  />
                  <p className="mt-1 text-xs text-gray-500">{t('builtinPrompts.templateHint')}</p>
                </div>

                <div>
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <label className="block text-sm font-medium text-gray-700">
                      {t('builtinPrompts.arguments')}
                    </label>
                    <button
                      type="button"
                      onClick={() => addArgument(promptIndex)}
                      className="text-sm text-blue-600 hover:text-blue-800"
                    >
                      + {t('builtinPrompts.addArgument')}
                    </button>
                  </div>

                  {(prompt.arguments || []).map((argument, argumentIndex) => (
                    <div
                      key={`${argument.name || 'arg'}-${argumentIndex}`}
                      className="mb-2 grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_1fr_auto_auto]"
                    >
                      <input
                        type="text"
                        value={argument.name}
                        onChange={(e) =>
                          handleArgumentChange(promptIndex, argumentIndex, 'name', e.target.value)
                        }
                        className="rounded border px-3 py-2 text-gray-700 focus:outline-none focus:shadow-outline form-input"
                        placeholder={t('builtinPrompts.argName')}
                      />
                      <input
                        type="text"
                        value={argument.description || ''}
                        onChange={(e) =>
                          handleArgumentChange(
                            promptIndex,
                            argumentIndex,
                            'description',
                            e.target.value,
                          )
                        }
                        className="rounded border px-3 py-2 text-gray-700 focus:outline-none focus:shadow-outline form-input"
                        placeholder={t('builtinPrompts.argDescription')}
                      />
                      <label className="flex items-center whitespace-nowrap text-sm text-gray-600">
                        <input
                          type="checkbox"
                          checked={argument.required || false}
                          onChange={(e) =>
                            handleArgumentChange(
                              promptIndex,
                              argumentIndex,
                              'required',
                              e.target.checked,
                            )
                          }
                          className="mr-2"
                        />
                        {t('builtinPrompts.argRequired')}
                      </label>
                      <button
                        type="button"
                        onClick={() => removeArgument(promptIndex, argumentIndex)}
                        className="rounded px-2 py-1 text-sm text-gray-600 hover:bg-red-50 hover:text-red-600 btn-danger"
                      >
                        -
                      </button>
                    </div>
                  ))}
                </div>

                <label className="flex items-center text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={prompt.enabled !== false}
                    onChange={(e) => handleDraftChange(promptIndex, 'enabled', e.target.checked)}
                    className="mr-2"
                  />
                  {t('builtinPrompts.enabled')}
                </label>
              </div>
            ))
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 btn-secondary"
              disabled={isSaving}
            >
              {t('common.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded bg-blue-600 px-4 py-2 text-sm text-white hover:bg-blue-700 btn-primary disabled:cursor-not-allowed disabled:opacity-60"
              disabled={isSaving || !isDirty}
            >
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerPromptManager;
