import { useEffect } from 'react';

/*
 * Development only (`npm run dev`, then /?preview): the app as a dashboard
 * widget at every grid size Qaicu gives one, each in a card like the host's —
 * the frame filling it with no padding around — on the card surface.
 */

export const WIDGET_SIZES = [
  { label: '1×1', width: 280, height: 178 },
  { label: '2×1', width: 580, height: 178 },
  { label: '1×2', width: 280, height: 378 },
  { label: '2×2', width: 580, height: 378 },
  { label: '3×2', width: 880, height: 378 },
  { label: '3×3', width: 760, height: 578 },
];

export function WidgetPreview() {
  const src = `${window.location.pathname}?qaicuPlacement=widget&surface=card`;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', gap: '1.5rem', padding: '1.5rem' }}>
      {WIDGET_SIZES.map((size) => (
        <figure key={size.label} style={{ margin: 0 }}>
          <figcaption style={{ marginBottom: '0.5rem', fontSize: 12, color: 'var(--muted-foreground)' }}>
            {size.label} · {size.width}×{size.height}
          </figcaption>
          <div
            style={{
              overflow: 'hidden',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--card)',
            }}
          >
            <iframe
              title={`Widget ${size.label}`}
              src={src}
              width={size.width}
              height={size.height}
              style={{ display: 'block', border: 0 }}
            />
          </div>
        </figure>
      ))}
    </div>
  );
}

/**
 * Inside a preview frame: no dev bar, the card surface the host sets, and the
 * theme following the dev bar's toggle on the preview page around it.
 */
export function useDevFrameSurface() {
  useEffect(() => {
    if (!import.meta.env.DEV || window.self === window.top) return;
    if (new URLSearchParams(window.location.search).get('surface') !== 'card') return;
    const style = document.createElement('style');
    style.textContent =
      '#qaicu-dev-bar{display:none!important} body{padding-top:0!important}' +
      'html:root{--background:var(--card)!important}';
    document.head.appendChild(style);
    // The dev bar stores its theme in localStorage; a storage event reaches every other frame.
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'qaicu-dev-theme' && e.newValue) {
        document.documentElement.setAttribute('data-qaicu-theme', e.newValue);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => {
      style.remove();
      window.removeEventListener('storage', onStorage);
    };
  }, []);
}
