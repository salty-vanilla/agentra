import { ANIM_DRAW_MS, ANIM_STAGGER_MS, type AnimBox } from '@/lib/deck-anim';

/**
 * Transient animation overlay for AnimatedSlidePreview (Epic #424).
 *
 * Rendered on top of the already-sanitized static slide SVG (so it never passes
 * through DOMPurify), it plays the SDPM-style "agent is drawing" effect over the
 * changed components: a wireframe outline draws on while an agent cursor taps
 * each box, staggered in order. Purely decorative (aria-hidden); the real content
 * is the static SVG underneath, so the slide is fully readable throughout.
 */

const KEYFRAMES = `
@keyframes deck-wire-draw {
  0% { opacity: 0; transform: scale(0.96); }
  18% { opacity: 1; }
  72% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; }
}
@keyframes deck-cursor-tap {
  0% { opacity: 0; transform: translate(-50%, -50%) scale(0.4); }
  22% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
  78% { opacity: 1; }
  100% { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
}`;

export interface AnimatedSlideOverlayProps {
  boxes: AnimBox[];
  /** Changing this (e.g. composeUrl) replays the animation. */
  runKey: string | number;
}

export function AnimatedSlideOverlay({ boxes, runKey }: AnimatedSlideOverlayProps) {
  if (boxes.length === 0) return null;
  return (
    <div
      key={runKey}
      aria-hidden
      data-testid="animated-slide-overlay"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static, author-controlled keyframes (no user input) */}
      <style dangerouslySetInnerHTML={{ __html: KEYFRAMES }} />
      {boxes.map((box, i) => {
        const delay = `${i * ANIM_STAGGER_MS}ms`;
        return (
          <div key={box.index}>
            {/* Wireframe outline drawing on over the changed component. */}
            <div
              className="absolute rounded-sm border-2 border-primary/70 border-dashed"
              style={{
                left: `${box.leftPct}%`,
                top: `${box.topPct}%`,
                width: `${box.widthPct}%`,
                height: `${box.heightPct}%`,
                animation: `deck-wire-draw ${ANIM_DRAW_MS}ms ease-out both`,
                animationDelay: delay,
              }}
            />
            {/* Agent cursor tapping the component's center. */}
            <div
              className="absolute size-2.5 rounded-full bg-primary shadow-[0_0_0_4px_rgba(99,102,241,0.25)]"
              style={{
                left: `${box.cxPct}%`,
                top: `${box.cyPct}%`,
                animation: `deck-cursor-tap ${ANIM_DRAW_MS}ms ease-out both`,
                animationDelay: delay,
              }}
            />
          </div>
        );
      })}
    </div>
  );
}
