import { useEffect, useState } from 'react';
import { getPlacement } from './qaicu';

export type View = 'widget' | 'full';

export type Frame = {
  width: number;
  height: number;
  /** null until the frame has a size: it is first laid out at zero. */
  view: View | null;
};

/**
 * Which view to show. Qaicu tells the app where it runs (`QDB.placement`): a
 * dashboard widget gets the widget, its own page or the full window the full
 * view. An older host says nothing, and then it is read from the frame — on a
 * dashboard the host paints the app on the widget's card surface
 * (`--background` is set to the `--card` colour), in a grid cell 132 px tall at
 * the smallest.
 *
 * `?view=widget|full` overrides both, for development.
 */
export function useFrame(): Frame {
  const [frame, setFrame] = useState<Frame>(measure);

  useEffect(() => {
    const update = () => setFrame(measure());
    update();
    // The host's theme style can land after the first paint.
    const raf = requestAnimationFrame(update);
    window.addEventListener('resize', update);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', update);
    };
  }, []);

  return frame;
}

function measure(): Frame {
  const width = window.innerWidth;
  const height = window.innerHeight;
  if (!width || !height) return { width, height, view: null };
  return { width, height, view: viewFor(width, height) };
}

export function viewFor(width: number, height: number): View {
  const forced = new URLSearchParams(window.location.search).get('view');
  if (forced === 'widget' || forced === 'full') return forced;

  const placement = getPlacement();
  if (placement === 'widget') return 'widget';
  if (placement) return 'full';

  // An older host: a widget stretched this large has room for the full view.
  if (width >= 900 && height >= 700) return 'full';
  if (onCardSurface()) return 'widget';
  if (height < 420 || width < 340) return 'widget';
  return 'full';
}

function onCardSurface(): boolean {
  const style = getComputedStyle(document.documentElement);
  const background = style.getPropertyValue('--background').trim();
  const card = style.getPropertyValue('--card').trim();
  return background !== '' && background === card;
}
