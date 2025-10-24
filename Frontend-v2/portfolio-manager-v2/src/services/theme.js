// Theme Service - Handle Dark/Light Mode
import { createSignal, createEffect } from 'solid-js';

const THEME_KEY = 'portfolio-theme';

// Get initial theme from localStorage or default to dark
const getInitialTheme = () => {
  const saved = localStorage.getItem(THEME_KEY);
  return saved || 'dark';
};

// Create theme signal
export const [theme, setTheme] = createSignal(getInitialTheme());

// Toggle between dark and light
export const toggleTheme = () => {
  const newTheme = theme() === 'dark' ? 'light' : 'dark';
  setTheme(newTheme);
  localStorage.setItem(THEME_KEY, newTheme);
};

// Apply theme to document
createEffect(() => {
  document.documentElement.setAttribute('data-theme', theme());
});

// Initialize theme on load
if (typeof document !== 'undefined') {
  document.documentElement.setAttribute('data-theme', theme());
}
