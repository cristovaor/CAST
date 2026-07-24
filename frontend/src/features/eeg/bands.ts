// Canonical EEG band definitions (order, color, label) shared by the chart
// and the co-activation panel so the palette never drifts between views.
export interface EEGBand {
  key: 'alpha' | 'beta' | 'theta' | 'delta' | 'gamma';
  label: string;
  color: string;
}

export const EEG_BANDS: EEGBand[] = [
  { key: 'alpha', label: 'Alpha', color: '#3b82f6' },
  { key: 'beta', label: 'Beta', color: '#ef4444' },
  { key: 'theta', label: 'Theta', color: '#10b981' },
  { key: 'delta', label: 'Delta', color: '#f59e0b' },
  { key: 'gamma', label: 'Gamma', color: '#8b5cf6' },
];
