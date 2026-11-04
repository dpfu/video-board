import type { PointerEvent } from 'react';
import { GripVertical, Unplug } from 'lucide-react';
import { IconButton } from './Icons';

export type DockControls = { docked: boolean; onPeel: (event: PointerEvent) => void; onDetach: () => void };
export function ModuleGrip({ onPeel }: Pick<DockControls, 'onPeel'>) {
  return <button type="button" className="module-grip" aria-label="Drag module independently" title="Pull grip to undock · header moves group · Shift disables magnets" onPointerDown={onPeel}><GripVertical size={12} /></button>;
}
export function UndockButton({ docked, onDetach }: Pick<DockControls, 'docked' | 'onDetach'>) {
  return docked ? <IconButton icon={Unplug} label="Undock module" onClick={onDetach} /> : null;
}
