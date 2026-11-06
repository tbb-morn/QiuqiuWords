import {
  BookOpen,
  CalendarDays,
  Feather,
  Languages,
  Link2,
  NotebookPen,
  Pencil,
  Sparkles,
  Star,
  Trash2,
  Undo2,
  WandSparkles,
} from 'lucide-react';
import type { WordWithProgress } from '../types';
import { Modal } from './Modal';
import { wordStatusLabel, wordStatusTone } from '../lib/words';
import { formatShortDate } from '../lib/utils';

interface WordDetailDrawerProps {
  open: boolean;
  word: WordWithProgress | null;
  libraryName: string;
  busy?: boolean;
  onClose: () => void;
  onEdit: (word: WordWithProgress) => void;
  onDelete: (word: WordWithProgress) => void;
  onToggleMastered: (word: WordWithProgress) => void;
}

export function WordDetailDrawer({
  open,
  word,
  libraryName,
  busy = false,
  onClose,
  onEdit,
  onDelete,
  onToggleMastered,
}: WordDetailDrawerProps) {
  if (!word) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={word.word}
      eyebrow={`WORD DETAIL · ${libraryName}`}
      description={word.phonetic || '这个单词的全部小档案'}
      size="lg"
      className="modal-card--drawer"
      footer={
        <>
          <button
            type="button"
            className="button button--danger-ghost button--sm"
            onClick={() => onDelete(word)}
            disabled={busy}
          >
            <Trash2 size={15} /> 删除
          </button>
          <span className="modal-card__footer-spacer" />
          <button
            type="button"
            className="button button--soft button--sm"
            onClick={() => onToggleMastered(word)}
            disabled={busy}
          >
            {word.progress.mastered ? <Undo2 size={15} /> : <Star size={15} />}
            {word.progress.mastered ? '取消熟练掌握' : '已熟练掌握'}
          </button>
          <button
            type="button"
            className="button button--primary button--sm"
            onClick={() => onEdit(word)}
            disabled={busy}
          >
            <Pencil size={15} /> 编辑
          </button>
        </>
      }
    >
      <div className="word-detail">
        <div className="word-detail__badges">
          <span className={`status-pill status-pill--${wordStatusTone(word.progress.status)}`}>
            {wordStatusLabel(word.progress.status)}
          </span>
          {word.progress.mastered && (
            <span className="status-pill status-pill--butter">
              <Star size={12} fill="currentColor" /> 已熟练掌握
            </span>
          )}
          <span className="word-detail__date">
            <CalendarDays size={13} /> {formatShortDate(word.createdAt)}
          </span>
        </div>

        {word.definitions.length > 0 ? (
          <section className="detail-block">
            <h3>
              <BookOpen size={16} /> 释义
            </h3>
            <ul className="definition-list">
              {word.definitions.map((definition, index) => (
                <li key={index}>
                  {definition.partOfSpeech && <em>{definition.partOfSpeech}</em>}
                  <span>{definition.meaning}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <p className="detail-muted">还没有添加释义，可以在编辑里补充。</p>
        )}

        {word.examples.length > 0 && (
          <section className="detail-block">
            <h3>
              <Feather size={16} /> 例句
            </h3>
            <div className="example-list">
              {word.examples.map((example, index) => (
                <blockquote key={index}>
                  <p>{example.en}</p>
                  {example.zh && <footer>{example.zh}</footer>}
                </blockquote>
              ))}
            </div>
          </section>
        )}

        {word.phrases.length > 0 && (
          <section className="detail-block">
            <h3>
              <Languages size={16} /> 常用词组
            </h3>
            <div className="phrase-list">
              {word.phrases.map((phrase, index) => (
                <div className="phrase-row" key={index}>
                  <span>{phrase.en}</span>
                  <span>{phrase.zh}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        {word.mnemonic && (
          <section className="detail-block">
            <h3>
              <WandSparkles size={16} /> 巧记口诀
            </h3>
            <div className="mnemonic-note">{word.mnemonic}</div>
          </section>
        )}

        {(word.derivatives.length > 0 || word.synonyms.length > 0 || word.antonyms.length > 0) && (
          <section className="detail-block">
            <h3>
              <Link2 size={16} /> 词族与联想
            </h3>
            <div className="relation-groups">
              {word.derivatives.length > 0 && (
                <div>
                  <span className="relation-label">派生词</span>
                  <div className="chip-wrap">
                    {word.derivatives.map((item) => (
                      <span className="soft-chip" key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              )}
              {word.synonyms.length > 0 && (
                <div>
                  <span className="relation-label">同义词</span>
                  <div className="chip-wrap">
                    {word.synonyms.map((item) => (
                      <span className="soft-chip" key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              )}
              {word.antonyms.length > 0 && (
                <div>
                  <span className="relation-label">反义词</span>
                  <div className="chip-wrap">
                    {word.antonyms.map((item) => (
                      <span className="soft-chip" key={item}>{item}</span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {word.note && (
          <section className="detail-block">
            <h3>
              <NotebookPen size={16} /> 个人备注
            </h3>
            <p className="note-text">{word.note}</p>
          </section>
        )}

        {word.customFields.length > 0 && (
          <section className="detail-block">
            <h3>
              <Sparkles size={16} /> 自定义字段
            </h3>
            <dl className="custom-field-list">
              {word.customFields.map((field, index) => (
                <div key={index}>
                  <dt>{field.label || '自定义'}</dt>
                  <dd>{field.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>
    </Modal>
  );
}
