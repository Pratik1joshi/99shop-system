'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef } from 'react';

const KeyboardContext = createContext(null);
const isTypingTarget = (target) => target instanceof HTMLElement && (
  target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)
);

export function KeyboardProvider({ children }) {
  const shortcuts = useRef(new Map());
  const register = useCallback((combo, handler, options = {}) => {
    const key = combo.toLowerCase();
    if (shortcuts.current.has(key) && process.env.NODE_ENV !== 'production') console.warn(`ERP shortcut conflict: ${combo}`);
    shortcuts.current.set(key, { handler, allowInField: !!options.allowInField });
    return () => shortcuts.current.delete(key);
  }, []);
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.defaultPrevented) return;
      if (typeof event.key !== 'string' || !event.key) return;
      const parts = [];
      if (event.ctrlKey || event.metaKey) parts.push('mod');
      if (event.altKey) parts.push('alt');
      if (event.shiftKey) parts.push('shift');
      parts.push(event.key.toLowerCase());
      const shortcut = shortcuts.current.get(parts.join('+'));
      if (!shortcut || (isTypingTarget(event.target) && !shortcut.allowInField)) return;
      event.preventDefault();
      shortcut.handler(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
  const value = useMemo(() => ({ register }), [register]);
  return <KeyboardContext.Provider value={value}>{children}</KeyboardContext.Provider>;
}

export function useShortcut(combo, handler, options) {
  const context = useContext(KeyboardContext);
  useEffect(() => context?.register(combo, handler, options), [combo, context, handler, options]);
}
