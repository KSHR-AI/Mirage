/** One recorded control line split into its keys and what they do. */
export type Control = { keys: string[]; action: string };

const SEPARATOR = /\s+(?:to|for)\s+/;
const KEY_SPLIT = /\s*(?:,|\/|\+|\bor\b|\band\b)\s*/;

/**
 * Splits a submission's free-text control, such as "WASD to move or drive",
 * into key caps and the action. Text that does not lead with short key names
 * stays whole, with no keys, so nothing is invented.
 */
export function parseControl(text: string): Control {
  const match = SEPARATOR.exec(text);
  if (!match || match.index === 0) return { keys: [], action: text };
  const head = text.slice(0, match.index);
  const action = text.slice(match.index + match[0].length);
  const keys = head
    .split(KEY_SPLIT)
    .map((key) => key.trim())
    .filter(Boolean)
    .flatMap((key) => (key === "WASD" ? ["W", "A", "S", "D"] : [key]));
  if (
    keys.length === 0 ||
    keys.some((key) => key.length > 12 || key.split(" ").length > 2) ||
    !action
  ) {
    return { keys: [], action: text };
  }
  return { keys, action };
}
