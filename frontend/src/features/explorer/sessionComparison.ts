import type { ExplorerManifest } from './types';

export function compareManifests(left: ExplorerManifest, right: ExplorerManifest) {
  const leftModalities = new Set(left.tracks.map((track) => track.modality));
  const rightModalities = new Set(right.tracks.map((track) => track.modality));
  const common = [...leftModalities].filter((modality) => rightModalities.has(modality)).sort();
  const onlyLeft = [...leftModalities].filter((modality) => !rightModalities.has(modality)).sort();
  const onlyRight = [...rightModalities].filter((modality) => !leftModalities.has(modality)).sort();
  return { common, onlyLeft, onlyRight, compatible: common.length > 0 };
}
