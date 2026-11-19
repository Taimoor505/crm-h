'use client';

import { LazyMotion, MotionConfig } from 'motion/react';

const loadFeatures = () => import('./features').then((m) => m.default);

/**
 * Material motion for the app (motion library, lazily loaded). `m.*`
 * components render immediately and start animating once the features arrive.
 * Honors the person's reduced-motion setting.
 */
export function MotionProvider({ children }: { children: React.ReactNode }) {
  return (
    <LazyMotion features={loadFeatures} strict>
      <MotionConfig reducedMotion="user" transition={{ type: 'spring', stiffness: 520, damping: 40, mass: 0.9 }}>
        {children}
      </MotionConfig>
    </LazyMotion>
  );
}
