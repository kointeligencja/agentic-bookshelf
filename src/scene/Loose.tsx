import { useKTX2 } from '@react-three/drei';
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber';
import { useMemo, useRef, useState, type RefObject } from 'react';
import * as THREE from 'three';
import { useStore } from '../store.ts';
import type { AtlasSheet } from '../types.ts';
import { placementPose } from './Books.tsx';
import { FullBook } from './FullBook.tsx';
import type { Layout, Placement } from './layout.ts';
import { starFx } from './starLight.ts';

/** Shared hover/click wiring for books that are individual meshes rather than instances. */
function useLooseBook(id: string) {
  const hovered = useStore((s) => s.hovered === id && !s.focused);
  const hidden = useStore((s) => s.focused?.id === id);
  const invalidate = useThree((s) => s.invalidate);
  const handlers = {
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      const s = useStore.getState();
      if (!s.focused && s.hovered !== id) s.setHovered(id);
    },
    onPointerOut: () => {
      const s = useStore.getState();
      if (s.hovered === id) s.setHovered(null);
      invalidate();
    },
    onClick: (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation();
      if (e.delta <= 6 && !useStore.getState().focused) useStore.getState().focus(id);
    },
  };
  return { hovered, hidden, handlers };
}

/** Eases a 0..1 value towards a target inside the frame loop. */
function useEased(target: number, rate = 12): RefObject<number> {
  const v = useRef(0);
  const invalidate = useThree((s) => s.invalidate);
  useFrame((_, dt) => {
    const next = v.current + (target - v.current) * (1 - Math.exp(-rate * Math.min(dt, 0.1)));
    if (Math.abs(next - v.current) > 1e-4) invalidate();
    v.current = next;
  });
  return v;
}

/** A face-out favourite in the bookcase. Hover lifts it a little. */
function LooseBook({ placement, atlas }: { placement: Placement; atlas: THREE.Texture | null }) {
  const { hovered, hidden, handlers } = useLooseBook(placement.book.id);
  const pose = useMemo(() => placementPose(placement), [placement]);
  const lift = useEased(hovered ? 1 : 0);
  const group = useRef<THREE.Group>(null);
  const [glow, setGlow] = useState(0);
  useFrame(() => {
    const g = group.current;
    if (!g) return;
    g.position.copy(pose.position);
    g.position.z += lift.current * 14;
    g.position.y += lift.current * 4;
    // Books the theme lights stay lit when the room dims.
    const star = (useStore.getState().lit[placement.book.id] ?? 0) * starFx.amount * 7;
    const ng = Math.round((lift.current + star) * 20) / 20;
    if (ng !== glow) setGlow(ng);
  });
  return (
    <group ref={group} quaternion={pose.quaternion} visible={!hidden} {...handlers}>
      <FullBook book={placement.book} atlas={atlas} glow={glow} />
    </group>
  );
}

/** Books drawn individually: the face-out favourites. */
export function Loose({ layout, atlas }: { layout: Layout; atlas: AtlasSheet[] }) {
  const textures = useKTX2(
    atlas.map((s) => s.url),
    '/basis/',
  ) as THREE.Texture[];
  const loose = layout.placements.filter((p) => p.kind === 'display');
  return (
    <group>
      {loose.map((p) => (
        <LooseBook key={p.book.id} placement={p} atlas={textures[p.book.spineAtlas.sheet] ?? null} />
      ))}
    </group>
  );
}
