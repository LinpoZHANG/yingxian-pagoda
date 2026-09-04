import { MeshStandardMaterial, Color } from 'three';

export function createStatueMaterials() {
  return {
    gildedSkin: new MeshStandardMaterial({
      color: new Color('#d6a657'),
      roughness: 0.7,
      metalness: 0.12,
    }),
    agedGold: new MeshStandardMaterial({
      color: new Color('#b57c3a'),
      roughness: 0.8,
      metalness: 0.14,
    }),
    redRobe: new MeshStandardMaterial({
      color: new Color('#8a3529'),
      roughness: 0.9,
      metalness: 0.05,
    }),
    ochreRobe: new MeshStandardMaterial({
      color: new Color('#b77a3d'),
      roughness: 0.92,
      metalness: 0.04,
    }),
    stoneGreen: new MeshStandardMaterial({
      color: new Color('#5e6c58'),
      roughness: 0.92,
      metalness: 0.04,
    }),
    darkBlueHair: new MeshStandardMaterial({
      color: new Color('#1b2f3e'),
      roughness: 0.7,
      metalness: 0.08,
    }),
    lotusRed: new MeshStandardMaterial({
      color: new Color('#8d2d22'),
      roughness: 0.9,
      metalness: 0.05,
    }),
    lotusGreen: new MeshStandardMaterial({
      color: new Color('#4c653a'),
      roughness: 0.9,
      metalness: 0.05,
    }),
    paintedClay: new MeshStandardMaterial({
      color: new Color('#b58c5d'),
      roughness: 0.95,
      metalness: 0.0,
    }),
    woodAltar: new MeshStandardMaterial({
      color: new Color('#7d3c2a'),
      roughness: 0.9,
      metalness: 0.06,
    }),
    mural: new MeshStandardMaterial({
      color: new Color('#ba8b58'),
      roughness: 1.0,
      metalness: 0.0,
    }),
  };
}
