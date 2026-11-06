import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ChevronDown, MoreHorizontal, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { Mascot } from './Mascot';

interface EmptyStateProps {
  title: string;
  description?: string;
  action?: ReactNode;
  compact?: boolean;
  mascotSize?: number;
}

export function EmptyState({
  title,
  description,
  action,
  compact = false,
  mascotSize = 130,
}: EmptyStateProps) {
  return (
    <div className={cn('empty-state', compact && 'empty-state--compact')}>
      <div className="empty-state__mascot">
        <Mascot size={mascotSize} />
      </div>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}

export function PageLoader({ label = '正在把单词摆整齐…' }: { label?: string }) {
  return (
    <div className="page-loader" role="status" aria-live="polite">
      <div className="page-loader__bird" aria-hidden="true">
        <span className="page-loader__dot" />
        <span className="page-loader__dot" />
        <span className="page-loader__dot" />
      </div>
      <p>{label}</p>
    </div>
  );
}

export interface ActionMenuItem {
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

interface ActionMenuProps {
  items: ActionMenuItem[];
  label?: string;
  align?: 'left' | 'right';
  className?: string;
  triggerLabel?: string;
  triggerIcon?: LucideIcon;
  buttonClassName?: string;
}

export function ActionMenu({
  items,
  label = '更多操作',
  align = 'right',
  className,
  triggerLabel,
  triggerIcon: TriggerIcon,
  buttonClassName = 'button--soft',
}: ActionMenuProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  return (
    <div className={cn('action-menu', className)} ref={rootRef}>
      {triggerLabel ? (
        <button
          type="button"
          className={cn('button action-menu__trigger', buttonClassName, open && 'is-open')}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          {TriggerIcon && <TriggerIcon size={16} />}
          {triggerLabel}
          <ChevronDown size={13} className={cn('action-menu__chevron', open && 'is-open')} />
        </button>
      ) : (
        <button
          type="button"
          className={cn('icon-button icon-button--soft', open && 'is-active')}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={(event) => {
            event.stopPropagation();
            setOpen((value) => !value);
          }}
        >
          <MoreHorizontal size={18} />
        </button>
      )}
      {open && (
        <div className={cn('action-menu__panel', `action-menu__panel--${align}`)} role="menu">
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                className={cn('action-menu__item', item.danger && 'is-danger')}
                disabled={item.disabled}
                onClick={(event) => {
                  event.stopPropagation();
                  setOpen(false);
                  item.onSelect();
                }}
              >
                {Icon && <Icon size={16} />}
                <span>
                  {item.label}
                  {item.hint && <small>{item.hint}</small>}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
