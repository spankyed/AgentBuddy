import { useState, useEffect } from 'react';
import { Theme } from '../types';

export function useTheme(): [Theme, (theme: Theme) => void] {
  const [theme, setTheme] = useState<Theme>('light');
  
  useEffect(() => {
    // Check if user has a saved preference
    const savedTheme = localStorage.getItem('color-theme') as Theme | null;
    
    // Check if user has OS-level preference
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    // Default to dark if OS preference is dark and no saved preference
    if (prefersDark && !savedTheme) {
      setTheme('dark');
    } else if (savedTheme) {
      setTheme(savedTheme);
    }
  }, []);
  
  useEffect(() => {
    localStorage.setItem('color-theme', theme);
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);
  
  return [theme, setTheme];
}