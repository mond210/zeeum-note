import { tick } from "svelte";

export function captureMarkdownViewport(textarea) {
  if (!textarea) {
    return null;
  }

  return {
    scrollLeft: textarea.scrollLeft,
    scrollTop: textarea.scrollTop,
    selectionEnd: textarea.selectionEnd ?? 0,
    selectionStart: textarea.selectionStart ?? 0
  };
}

export async function restoreMarkdownViewport(textarea, snapshot) {
  if (!textarea || !snapshot) {
    return;
  }

  await tick();

  requestAnimationFrame(() => {
    if (!textarea) {
      return;
    }

    textarea.scrollTop = snapshot.scrollTop;
    textarea.scrollLeft = snapshot.scrollLeft;
    textarea.selectionStart = Math.min(snapshot.selectionStart, textarea.value.length);
    textarea.selectionEnd = Math.min(snapshot.selectionEnd, textarea.value.length);
  });
}

export function captureStyledViewport() {
  return window.scrollY;
}

export function restoreStyledViewport(scrollY) {
  requestAnimationFrame(() => {
    window.scrollTo(window.scrollX, scrollY);
  });
}
