/** Join conditional class names without coupling the UI foundation to a CSS framework. */
export function cn(...values) {
  return values.flat(Infinity).filter(Boolean).join(' ');
}
