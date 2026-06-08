export const palettes = {
  classic: {
    name: 'Classic',
    background: '#f5f7fb',
    surface: '#ffffff',
    elevated: '#eef3ff',
    text: '#111827',
    muted: '#64748b',
    border: '#d8e1ef',
    primary: '#4f46e5',
    primaryText: '#ffffff',
    success: '#10b981',
    danger: '#ef4444',
    warning: '#f59e0b',
    info: '#0ea5e9',
  },
  focus: {
    name: 'Focus',
    background: '#07111f',
    surface: '#101b2d',
    elevated: '#1d2a3e',
    text: '#f8fafc',
    muted: '#9fb0c6',
    border: '#28364d',
    primary: '#38bdf8',
    primaryText: '#06111f',
    success: '#34d399',
    danger: '#fb7185',
    warning: '#fbbf24',
    info: '#60a5fa',
  },
};

export type ThemeName = keyof typeof palettes;
export type SamvaadPalette = typeof palettes.classic;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};
