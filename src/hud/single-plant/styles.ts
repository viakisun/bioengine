// Shared style constants for the Single-Plant Analysis panels.
// Global crop simulator look: light theme, serif title + monospace data
// + sans-serif body. Defined once so every panel ties to the same tone.

export const FONT_SERIF = 'Georgia, "Source Serif Pro", "Times New Roman", serif';
export const FONT_MONO = 'ui-monospace, "SF Mono", Consolas, monospace';
export const FONT_SANS = 'system-ui, -apple-system, "Helvetica Neue", sans-serif';

export const C_BG = '#fafaf7';
export const C_PANEL = '#ffffff';
export const C_BORDER = 'rgba(25, 30, 25, 0.10)';
export const C_BORDER_STRONG = 'rgba(25, 30, 25, 0.18)';
export const C_FG = '#1a1d1a';
export const C_FG_MUTE = '#5a615a';
export const C_FG_DIM = '#8a8f87';
export const C_ACCENT = '#0ea5e9';
export const C_BAD = '#dc2626';
export const C_WARN = '#d97706';
export const C_OK = '#16a34a';

/** Per-variable ColorBrewer Set1-ish palette for the TimelineChart. */
export const CHART_COLORS: Record<string, string> = {
  TT: '#e41a1c',
  LAI: '#377eb8',
  W: '#4daf4a',
  W_f: '#984ea3',
  W_m: '#ff7f00',
  HI: '#a65628',
  N: '#f781bf',
  heightCm: '#999999',
  PAR_now: '#ffba00',
  T_now: '#00bcd4',
};

export const PANEL_HEADER_LABEL: import('react').CSSProperties = {
  fontFamily: FONT_SANS,
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: '0.08em',
  color: C_FG_MUTE,
  textTransform: 'uppercase',
  marginBottom: 8,
};
