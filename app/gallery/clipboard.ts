/** Falls back to a selection copy where the async clipboard is blocked. */
export async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Framed previews and older browsers deny the async clipboard.
  }

  const previousFocus = document.activeElement;
  try {
    const area = document.createElement("textarea");
    area.value = value;
    area.setAttribute("readonly", "");
    area.style.position = "fixed";
    area.style.opacity = "0";
    // An open modal makes the rest of the page inert, so a textarea outside it
    // could not take the selection and the copy would grab something else.
    (document.querySelector("dialog[open]") ?? document.body).append(area);
    area.select();
    const copied = document.execCommand("copy");
    area.remove();
    return copied;
  } catch {
    return false;
  } finally {
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  }
}
