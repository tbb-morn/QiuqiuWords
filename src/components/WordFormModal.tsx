import { useEffect, useState, type FormEvent } from 'react';
import {
  BookOpen,
  Feather,
  Languages,
  Link2,
  NotebookPen,
  Plus,
  Sparkles,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import type { Word, WordContent } from '../types';
import { createWord, updateWord } from '../db/repositories';
import { errorMessage } from '../lib/errors';
import {
  emptyCustomField,
  emptyDefinition,
  emptyExample,
  emptyWordContent,
  normalizeWordContent,
} from '../lib/words';
import { Modal } from './Modal';
import { TagInput } from './TagInput';

interface WordFormModalProps {
  open: boolean;
  libraryId: string;
  word?: Word | null;
  onClose: () => void;
  onSaved: (word: Word) => void;
}

export function WordFormModal({ open, libraryId, word, onClose, onSaved }: WordFormModalProps) {
  const [form, setForm] = useState<WordContent>(emptyWordContent);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const editing = Boolean(word);

  useEffect(() => {
    if (!open) return;
    const initial = word
      ? normalizeWordContent(word)
      : { ...emptyWordContent(), definitions: [emptyDefinition()] };
    setForm(initial);
    setError('');
    setSaving(false);
  }, [open, word]);

  const setField = <K extends keyof WordContent>(key: K, value: WordContent[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (saving) return;
    const content = normalizeWordContent(form);
    if (!content.word) {
      setError('先写下英文单词吧');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const saved = word
        ? await updateWord(word.id, content)
        : await createWord(libraryId, content);
      onSaved(saved);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setSaving(false);
    }
  };

  const updateDefinition = (index: number, patch: Partial<WordContent['definitions'][number]>) => {
    setField(
      'definitions',
      form.definitions.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  const updateExample = (
    key: 'examples' | 'phrases',
    index: number,
    patch: Partial<WordContent['examples'][number]>,
  ) => {
    setField(
      key,
      form[key].map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const updateCustomField = (
    index: number,
    patch: Partial<WordContent['customFields'][number]>,
  ) => {
    setField(
      'customFields',
      form.customFields.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title={editing ? '编辑单词' : '添加一个新单词'}
      eyebrow={editing ? 'EDIT WORD' : 'NEW WORD'}
      description="只有英文单词是必填的。其他内容可以慢慢补充，也可以留白。"
      size="xl"
      hideClose={saving}
      closeOnBackdrop={!saving}
      footer={
        <>
          <button type="button" className="button button--ghost" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button type="submit" form="word-form" className="button button--primary" disabled={saving}>
            {saving ? '保存中…' : editing ? '保存修改' : '把单词抱进词库'}
          </button>
        </>
      }
    >
      <form id="word-form" className="word-form" onSubmit={handleSubmit}>
        <section className="form-section form-section--lead">
          <div className="word-lead-grid">
            <div className="form-field">
              <label htmlFor="word-term">
                英文单词 <span className="required">*</span>
              </label>
              <input
                id="word-term"
                className="text-input text-input--word"
                value={form.word}
                onChange={(event) => setField('word', event.target.value)}
                placeholder="serendipity"
                maxLength={120}
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>
            <div className="form-field">
              <label htmlFor="word-phonetic">音标</label>
              <input
                id="word-phonetic"
                className="text-input"
                value={form.phonetic}
                onChange={(event) => setField('phonetic', event.target.value)}
                placeholder="/ˌserənˈdɪpəti/"
                maxLength={200}
              />
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">
            <div>
              <h3>
                <BookOpen size={17} /> 词性与释义
              </h3>
              <p>一个单词可以有多个义项，比如名词含义和动词含义。</p>
            </div>
            <button
              type="button"
              className="button button--soft button--sm"
              onClick={() => setField('definitions', [...form.definitions, emptyDefinition()])}
            >
              <Plus size={14} /> 加一条
            </button>
          </div>
          {form.definitions.length === 0 && (
            <button
              type="button"
              className="inline-empty"
              onClick={() => setField('definitions', [emptyDefinition()])}
            >
              还没有释义，点这里补一条
            </button>
          )}
          <div className="repeater">
            {form.definitions.map((definition, index) => (
              <div className="repeater-row repeater-row--definition" key={index}>
                <input
                  className="text-input text-input--pos"
                  value={definition.partOfSpeech}
                  onChange={(event) =>
                    updateDefinition(index, { partOfSpeech: event.target.value })
                  }
                  placeholder="词性，如 n."
                  aria-label={`第 ${index + 1} 条释义的词性`}
                />
                <input
                  className="text-input"
                  value={definition.meaning}
                  onChange={(event) => updateDefinition(index, { meaning: event.target.value })}
                  placeholder="中文释义"
                  aria-label={`第 ${index + 1} 条释义`}
                />
                <button
                  type="button"
                  className="icon-button icon-button--danger-ghost"
                  onClick={() =>
                    setField(
                      'definitions',
                      form.definitions.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  aria-label="删除这条释义"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">
            <div>
              <h3>
                <Feather size={17} /> 例句
              </h3>
              <p>放进真实语境里，会更容易记住。英文和中文都可以分开填写。</p>
            </div>
            <button
              type="button"
              className="button button--soft button--sm"
              onClick={() => setField('examples', [...form.examples, emptyExample()])}
            >
              <Plus size={14} /> 加一句
            </button>
          </div>
          {form.examples.length === 0 && (
            <button
              type="button"
              className="inline-empty"
              onClick={() => setField('examples', [emptyExample()])}
            >
              还没有例句，点这里写一句
            </button>
          )}
          <div className="repeater">
            {form.examples.map((example, index) => (
              <div className="example-editor" key={index}>
                <div className="example-editor__top">
                  <span>例句 {index + 1}</span>
                  <button
                    type="button"
                    className="icon-button icon-button--danger-ghost"
                    onClick={() =>
                      setField(
                        'examples',
                        form.examples.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label="删除这句例句"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
                <input
                  className="text-input"
                  value={example.en}
                  onChange={(event) => updateExample('examples', index, { en: event.target.value })}
                  placeholder="English sentence"
                  aria-label={`例句 ${index + 1} 英文`}
                />
                <input
                  className="text-input"
                  value={example.zh}
                  onChange={(event) => updateExample('examples', index, { zh: event.target.value })}
                  placeholder="中文翻译（选填）"
                  aria-label={`例句 ${index + 1} 中文`}
                />
              </div>
            ))}
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">
            <div>
              <h3>
                <Languages size={17} /> 常用词组
              </h3>
              <p>搭配和短语可以让表达更自然。</p>
            </div>
            <button
              type="button"
              className="button button--soft button--sm"
              onClick={() => setField('phrases', [...form.phrases, emptyExample()])}
            >
              <Plus size={14} /> 加一组
            </button>
          </div>
          {form.phrases.length === 0 && (
            <button
              type="button"
              className="inline-empty"
              onClick={() => setField('phrases', [emptyExample()])}
            >
              还没有词组，点这里添加
            </button>
          )}
          <div className="repeater">
            {form.phrases.map((phrase, index) => (
              <div className="repeater-row repeater-row--phrase" key={index}>
                <input
                  className="text-input"
                  value={phrase.en}
                  onChange={(event) => updateExample('phrases', index, { en: event.target.value })}
                  placeholder="phrase"
                  aria-label={`第 ${index + 1} 个词组`}
                />
                <input
                  className="text-input"
                  value={phrase.zh}
                  onChange={(event) => updateExample('phrases', index, { zh: event.target.value })}
                  placeholder="中文意思"
                  aria-label={`第 ${index + 1} 个词组的中文意思`}
                />
                <button
                  type="button"
                  className="icon-button icon-button--danger-ghost"
                  onClick={() =>
                    setField(
                      'phrases',
                      form.phrases.filter((_, itemIndex) => itemIndex !== index),
                    )
                  }
                  aria-label="删除这个词组"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ))}
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">
            <div>
              <h3>
                <WandSparkles size={17} /> 巧记口诀
              </h3>
              <p>谐音、拆词、联想法都可以，只写给你自己看。</p>
            </div>
          </div>
          <textarea
            className="text-input text-area"
            value={form.mnemonic}
            onChange={(event) => setField('mnemonic', event.target.value)}
            placeholder="比如：seren（平静）+ dipity，像平静海面漂来一份礼物…"
            rows={3}
          />
        </section>

        <section className="form-section">
          <div className="form-section__head">
            <div>
              <h3>
                <Link2 size={17} /> 词族与联想
              </h3>
              <p>派生词、近义词、反义词，用回车或逗号分隔。</p>
            </div>
          </div>
          <div className="tag-field-grid">
            <div className="form-field">
              <label>派生词</label>
              <TagInput
                value={form.derivatives}
                onChange={(next) => setField('derivatives', next)}
                placeholder="serendipitous…"
                ariaLabel="派生词"
              />
            </div>
            <div className="form-field">
              <label>同义词</label>
              <TagInput
                value={form.synonyms}
                onChange={(next) => setField('synonyms', next)}
                placeholder="chance, luck…"
                ariaLabel="同义词"
              />
            </div>
            <div className="form-field">
              <label>反义词</label>
              <TagInput
                value={form.antonyms}
                onChange={(next) => setField('antonyms', next)}
                placeholder="misfortune…"
                ariaLabel="反义词"
              />
            </div>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section__head">
            <div>
              <h3>
                <NotebookPen size={17} /> 个人备注
              </h3>
              <p>记下你遇见它的场景，或者任何想对自己说的话。</p>
            </div>
          </div>
          <textarea
            className="text-input text-area"
            value={form.note}
            onChange={(event) => setField('note', event.target.value)}
            placeholder="在某个傍晚的阅读里遇见的…"
            rows={3}
          />
        </section>

        <section className="form-section">
          <div className="form-section__head">
            <div>
              <h3>
                <Sparkles size={17} /> 自定义字段
              </h3>
              <p>想记什么都可以，字段名和内容都由你决定。</p>
            </div>
            <button
              type="button"
              className="button button--soft button--sm"
              onClick={() => setField('customFields', [...form.customFields, emptyCustomField()])}
            >
              <Plus size={14} /> 加字段
            </button>
          </div>
          {form.customFields.length === 0 ? (
            <p className="form-hint form-hint--block">
              比如「词源」「影视出处」「易混词」，都可以加在这里。
            </p>
          ) : (
            <div className="repeater">
              {form.customFields.map((field, index) => (
                <div className="repeater-row repeater-row--custom" key={index}>
                  <input
                    className="text-input text-input--label"
                    value={field.label}
                    onChange={(event) => updateCustomField(index, { label: event.target.value })}
                    placeholder="字段名"
                    aria-label={`第 ${index + 1} 个自定义字段的名称`}
                  />
                  <input
                    className="text-input"
                    value={field.value}
                    onChange={(event) => updateCustomField(index, { value: event.target.value })}
                    placeholder="内容"
                    aria-label={`第 ${index + 1} 个自定义字段的内容`}
                  />
                  <button
                    type="button"
                    className="icon-button icon-button--danger-ghost"
                    onClick={() =>
                      setField(
                        'customFields',
                        form.customFields.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                    aria-label="删除这个自定义字段"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </form>
    </Modal>
  );
}
