export function buildMarkdownVisibilityMap(source) {
  const markdown = String(source || "");
  const rawToVisible = new Array(markdown.length + 1).fill(0);
  let rawIndex = 0;
  let visibleIndex = 0;
  let inCodeFence = false;
  let inLinkText = false;
  let inLinkUrl = false;
  let lineStart = true;

  while (rawIndex < markdown.length) {
    rawToVisible[rawIndex] = visibleIndex;

    if (!inCodeFence && lineStart) {
      const fence = markdown.slice(rawIndex).match(/^```[^\n]*(\n|$)/);

      if (fence) {
        inCodeFence = true;
        rawIndex += fence[0].length;
        visibleIndex += 1;
        lineStart = true;
        continue;
      }

      const heading = markdown.slice(rawIndex).match(/^#{1,6}\s+/);

      if (heading) {
        rawIndex += heading[0].length;
        lineStart = false;
        continue;
      }

      const blockquote = markdown.slice(rawIndex).match(/^>\s?/);

      if (blockquote) {
        rawIndex += blockquote[0].length;
        lineStart = false;
        continue;
      }

      const task = markdown.slice(rawIndex).match(/^-\s\[[ xX]\]\s+/);

      if (task) {
        rawIndex += task[0].length;
        lineStart = false;
        continue;
      }

      const bullet = markdown.slice(rawIndex).match(/^-\s+/);

      if (bullet) {
        rawIndex += bullet[0].length;
        lineStart = false;
        continue;
      }

      const ordered = markdown.slice(rawIndex).match(/^\d+\.\s+/);

      if (ordered) {
        rawIndex += ordered[0].length;
        lineStart = false;
        continue;
      }
    }

    if (inCodeFence) {
      const fence = markdown.slice(rawIndex).match(/^```[^\n]*(\n|$)/);

      if (fence && lineStart) {
        inCodeFence = false;
        rawIndex += fence[0].length;
        visibleIndex += 1;
        lineStart = true;
        continue;
      }
    }

    if (!inCodeFence) {
      if (!inLinkText && !inLinkUrl && markdown.startsWith("![", rawIndex)) {
        const closing = markdown.indexOf(")", rawIndex + 2);

        if (closing >= 0) {
          rawIndex = closing + 1;
          lineStart = false;
          continue;
        }
      }

      if (!inLinkText && !inLinkUrl && markdown[rawIndex] === "[") {
        inLinkText = true;
        rawIndex += 1;
        lineStart = false;
        continue;
      }

      if (inLinkText && markdown.startsWith("](", rawIndex)) {
        inLinkText = false;
        inLinkUrl = true;
        rawIndex += 2;
        continue;
      }

      if (inLinkUrl && markdown[rawIndex] === ")") {
        inLinkUrl = false;
        rawIndex += 1;
        continue;
      }

      if (inLinkUrl) {
        rawIndex += 1;
        continue;
      }

      let matchedMarker = false;

      for (const marker of ["**", "__", "~~", "`", "*", "_"]) {
        if (markdown.startsWith(marker, rawIndex)) {
          rawIndex += marker.length;
          lineStart = false;
          matchedMarker = true;
          break;
        }
      }

      if (matchedMarker) {
        continue;
      }
    }

    const char = markdown[rawIndex];
    rawIndex += 1;
    visibleIndex += 1;
    lineStart = char === "\n";
  }

  rawToVisible[markdown.length] = visibleIndex;

  return {
    markdown,
    rawToVisible,
    visibleLength: visibleIndex
  };
}

export function visibleOffsetFromMarkdownIndex(rawIndex, map) {
  const normalizedIndex = Math.max(0, Math.min(rawIndex, map.markdown.length));
  return map.rawToVisible[normalizedIndex] || 0;
}

export function markdownIndexFromVisibleOffset(visibleOffset, map) {
  const target = Math.max(0, Math.min(visibleOffset, map.visibleLength));

  for (let index = 0; index < map.rawToVisible.length; index += 1) {
    if (map.rawToVisible[index] >= target) {
      return index;
    }
  }

  return map.markdown.length;
}

export function proseVisibleOffsetFromPosition(editor, position) {
  if (!editor) {
    return 0;
  }

  return editor.state.doc.textBetween(0, position, "\n", "\n").length;
}

export function prosePositionFromVisibleOffset(editor, visibleOffset) {
  if (!editor) {
    return 1;
  }

  const maxPosition = editor.state.doc.content.size;
  let low = 0;
  let high = maxPosition;
  let best = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const current = proseVisibleOffsetFromPosition(editor, mid);

    if (current >= visibleOffset) {
      best = mid;
      high = mid - 1;
    } else {
      low = mid + 1;
    }
  }

  return Math.max(1, best);
}
