import { summarize } from "./format.js";
import { plainTextFromDoc } from "./rich-doc.js";

export function pageText(page) {
  if (!page) {
    return "";
  }

  if (page.contentFormat === "markdown") {
    return typeof page.content === "string" ? page.content : "";
  }

  return plainTextFromDoc(page.content);
}

export function pageExcerpt(page) {
  return summarize(pageText(page));
}

export function pageWordCount(page) {
  return pageText(page)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

export function buildPageTree(pages, parentId = null, depth = 0) {
  return pages
    .filter((page) => (page.parentId ?? null) === parentId)
    .sort((left, right) => left.position - right.position)
    .flatMap((page) => {
      return [
        { ...page, depth },
        ...buildPageTree(pages, page.id, depth + 1)
      ];
    });
}

export function childPages(pages, parentId) {
  return pages
    .filter((page) => page.parentId === parentId)
    .sort((left, right) => left.position - right.position);
}

export function breadcrumbTrail(pages, pageId) {
  const trail = [];
  let current = pages.find((page) => page.id === pageId) || null;

  while (current) {
    trail.unshift(current);
    current = pages.find((page) => page.id === current.parentId) || null;
  }

  return trail;
}

export function recentPages(pages, count = 5) {
  return [...pages]
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime())
    .slice(0, count);
}

export function isDescendant(pages, pageId, parentId) {
  if (!parentId) {
    return false;
  }

  let current = pages.find((page) => page.id === parentId) || null;

  while (current) {
    if (current.id === pageId) {
      return true;
    }

    current = pages.find((page) => page.id === current.parentId) || null;
  }

  return false;
}
