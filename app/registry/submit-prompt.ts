/** The token a contributor replaces with their public game link. */
export const PLAY_URL_PLACEHOLDER = "PASTE_YOUR_GAME_LINK";

export function extractSubmitPrompt(markdown: string) {
  const match = /```text\n([\s\S]*?)\n```/.exec(markdown);
  const prompt = match?.[1].trim();
  return prompt && prompt.includes(PLAY_URL_PLACEHOLDER) ? prompt : null;
}

/**
 * Inserts a contributor's link. Returns null unless the link meets the play-URL
 * contract: public HTTPS without credentials, query string, or fragment.
 */
export function fillSubmitPrompt(prompt: string, link: string) {
  const playUrl = normalizePlayUrl(link);
  // A callback inserts the link literally; a string would expand `$&` or `$'`,
  // which are valid in a URL path.
  return playUrl ? prompt.replace(PLAY_URL_PLACEHOLDER, () => playUrl) : null;
}

export function normalizePlayUrl(link: string) {
  let url: URL;
  try {
    url = new URL(link.trim());
  } catch {
    return null;
  }
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.hostname === "localhost"
  ) {
    return null;
  }
  return url.toString();
}
