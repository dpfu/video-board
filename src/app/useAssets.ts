import { useLifetime } from '../lifetime';
import { useState } from 'react';
import { AssetLibrary, type AssetSnapshot } from '../assets';

export function useAssets() {
  const [snapshot, setSnapshot] = useState<AssetSnapshot>({ urls: {}, generation: 0 });
  const [library] = useState(() => new AssetLibrary(setSnapshot));
  useLifetime(() => library.dispose());
  return { ...snapshot, library };
}
export type Assets = ReturnType<typeof useAssets>;
