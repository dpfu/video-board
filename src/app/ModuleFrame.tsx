import type { HTMLAttributes, PointerEventHandler, ReactNode } from 'react';
import type { Card } from '../model';

type Props = Omit<HTMLAttributes<HTMLElement>, 'children'> & {
  card: Card;
  kind: 'video' | 'still' | 'track' | 'clip' | 'codes' | 'space';
  fixedHeight?: boolean;
  resizeLabel: string;
  onResize: PointerEventHandler<HTMLButtonElement>;
  children: ReactNode;
};

export function ModuleFrame({
  card,
  kind,
  fixedHeight,
  className = '',
  resizeLabel,
  onResize,
  children,
  ...attributes
}: Props) {
  return (
    <article
      {...attributes}
      className={`board-card ${kind}-card ${className}`}
      data-module-id={card.id}
      data-docked-to={card.dock?.to}
      style={{
        left: card.x,
        top: card.y,
        width: card.width,
        height: fixedHeight ? card.height : undefined,
        zIndex: card.z,
      }}
    >
      {children}
      <button
        type="button"
        className="resize-handle"
        aria-label={resizeLabel}
        onPointerDown={onResize}
      />
    </article>
  );
}
