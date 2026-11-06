export interface BoardTheme {
  id: string;
  name: string;
  price: number;
  grassA: string;
  grassB: string;
  lines: string;
  frame: string;
  labels: string;
}

export const BOARD_THEMES: BoardTheme[] = [
  { id: 'classic', name: 'Classic Pitch', price: 0, grassA: '#2f8a3c', grassB: '#2a7d36', lines: 'rgba(255,255,255,.78)', frame: '#0d1426', labels: '#d9c27a' },
  { id: 'night', name: 'Night Stadium', price: 300, grassA: '#145a4a', grassB: '#114f41', lines: 'rgba(200,240,255,.7)', frame: '#050b18', labels: '#7fd6e8' },
  { id: 'chalk', name: 'Retro Chalkboard', price: 300, grassA: '#2c3a33', grassB: '#28352f', lines: 'rgba(240,235,220,.85)', frame: '#3b2a1c', labels: '#e9dcc0' },
  { id: 'gold', name: 'Gold Edition', price: 600, grassA: '#1d2a1f', grassB: '#18241a', lines: 'rgba(232,193,92,.9)', frame: '#0b0b0b', labels: '#e8c15c' },
];

export interface Kit {
  id: string;
  name: string;
  price: number;
  fill: string;
  ink: string;
}

export const HOME_KITS: Kit[] = [
  { id: 'royal', name: 'Royal Blue', price: 0, fill: '#1f4fd1', ink: '#ffffff' },
  { id: 'sky', name: 'Sky', price: 200, fill: '#59a8ec', ink: '#08213d' },
  { id: 'emerald', name: 'Emerald', price: 200, fill: '#0f9b6e', ink: '#ffffff' },
  { id: 'onyx', name: 'Onyx & Gold', price: 400, fill: '#151515', ink: '#e8c15c' },
];

export const AWAY_KITS: Kit[] = [
  { id: 'crimson', name: 'Crimson', price: 0, fill: '#cf2433', ink: '#ffffff' },
  { id: 'orange', name: 'Sunset Orange', price: 200, fill: '#ef7a1a', ink: '#2a1300' },
  { id: 'purple', name: 'Royal Purple', price: 200, fill: '#6b3fc4', ink: '#ffffff' },
  { id: 'white', name: 'Clean White', price: 300, fill: '#f2f2ee', ink: '#1a1a1a' },
];
