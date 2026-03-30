const fs = require("node:fs");
const path = require("node:path");

const pagesPath = path.join(process.cwd(), "data", "pages.json");

function stripKnownCorruptionText(text) {
  return String(text || "")
    .replace(/\b(?:CHECK|SYNC|RECHECK)_\d+\b/g, "")
    .replace(/\bMD_(?=\b|$)/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function richNodeText(node) {
  if (!node || typeof node !== "object") {
    return "";
  }

  if (node.type === "text") {
    return node.text || "";
  }

  if (node.type === "hardBreak") {
    return "\n";
  }

  return Array.isArray(node.content) ? node.content.map(richNodeText).join("") : "";
}

function sanitizeNode(node) {
  if (!node || typeof node !== "object") {
    return null;
  }

  if (node.type === "text") {
    const text = stripKnownCorruptionText(node.text || "");
    return text ? { ...node, text } : null;
  }

  const next = { ...node };

  if (Array.isArray(node.content)) {
    next.content = node.content.map(sanitizeNode).filter(Boolean);
  }

  const text = stripKnownCorruptionText(richNodeText(next));

  if ((node.type === "paragraph" || node.type === "heading") && !text) {
    return null;
  }

  return next;
}

function collapseRepeatedBlockWindows(nodes, maxWindow = 80) {
  let blocks = Array.isArray(nodes) ? [...nodes] : [];

  for (let size = Math.min(maxWindow, Math.floor(blocks.length / 2)); size >= 2; size -= 1) {
    const next = [];

    for (let index = 0; index < blocks.length;) {
      if (index + size * 2 <= blocks.length) {
        const base = blocks
          .slice(index, index + size)
          .map((node) => JSON.stringify(node))
          .join("\u0000");

        let repeats = 1;

        while (index + size * (repeats + 1) <= blocks.length) {
          const candidate = blocks
            .slice(index + size * repeats, index + size * (repeats + 1))
            .map((node) => JSON.stringify(node))
            .join("\u0000");

          if (candidate !== base) {
            break;
          }

          repeats += 1;
        }

        if (repeats > 1) {
          next.push(...blocks.slice(index, index + size));
          index += size * repeats;
          continue;
        }
      }

      next.push(blocks[index]);
      index += 1;
    }

    blocks = next;
  }

  return blocks;
}

function normalizeRichDoc(content) {
  if (!content || typeof content !== "object" || content.type !== "doc" || !Array.isArray(content.content)) {
    return { type: "doc", content: [{ type: "paragraph" }] };
  }

  const cleaned = content.content.map(sanitizeNode).filter(Boolean);
  const collapsed = collapseRepeatedBlockWindows(cleaned);

  return {
    ...content,
    content: collapsed.length > 0 ? collapsed : [{ type: "paragraph" }]
  };
}

const pages = JSON.parse(fs.readFileSync(pagesPath, "utf8"));
let changed = false;

for (const page of pages) {
  if (page.contentFormat !== "tiptap-json" || !page.content || typeof page.content !== "object") {
    continue;
  }

  const before = JSON.stringify(page.content);
  const normalized = normalizeRichDoc(page.content);
  const after = JSON.stringify(normalized);

  if (before !== after) {
    page.content = normalized;
    page.updatedAt = new Date().toISOString();
    changed = true;
    console.log(`cleaned ${page.title} -> ${normalized.content.length} blocks`);
  }
}

if (changed) {
  fs.writeFileSync(pagesPath, `${JSON.stringify(pages, null, 2)}\n`);
}

console.log(JSON.stringify({ changed }));
