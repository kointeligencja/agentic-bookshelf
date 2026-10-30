import { useFrame } from '@react-three/fiber';
import { DepthOfField, EffectComposer, SSAO, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode, type DepthOfFieldEffect } from 'postprocessing';
import { useRef } from 'react';
import { focusFx } from './FocusBook.tsx';

/**
 * Restrained post: subtle SSAO for contact darkening, a gentle vignette, and depth of field that
 * only comes in while a book is pulled out, and goes again as reading mode's walnut backdrop comes in: the backdrop is one flat
 * colour, so there is nothing for the blur to do but gather the bright book into it, which showed as a halo and a row of stepped,
 * dark blocks along the book's bottom edge (the bokeh kernel takes 64 widely spaced taps and a 16-tap maximum for the fill).
 */
export function Effects() {
  const dof = useRef<DepthOfFieldEffect>(null);
  useFrame(() => {
    const d = dof.current;
    if (!d) return;
    d.bokehScale = 5 * focusFx.amount * (1 - focusFx.read);
    d.target = d.bokehScale > 0.001 ? focusFx.position : null;
  });
  return (
    <EffectComposer multisampling={4} enableNormalPass>
      <SSAO
        samples={16}
        rings={5}
        radius={0.06}
        intensity={14}
        luminanceInfluence={0.55}
        bias={0.02}
        worldDistanceThreshold={2000}
        worldDistanceFalloff={600}
        worldProximityThreshold={20}
        worldProximityFalloff={12}
        color="#2a2016"
      />
      <DepthOfField ref={dof} focusRange={260} bokehScale={0} resolutionScale={0.5} />
      <Vignette offset={0.32} darkness={0.42} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
    </EffectComposer>
  );
}
