import MarkdownIt from "markdown-it";

export const EMPTY_DOC = {
  type: "doc",
  content: [{ type: "paragraph" }]
};

const markdown = new MarkdownIt({
  breaks: true,
  html: false,
  linkify: true
});

export function markdownToHtml(markdownText) {
  return markdown.render(markdownText || "");
}

export function plainTextFromDoc(node) {
  if (!node || typeof node !== "object") {
    return "";
  }

  if (typeof node.text === "string") {
    return node.text;
  }

  if (!Array.isArray(node.content)) {
    return "";
  }

  return node.content.map(plainTextFromDoc).join(" ");
}

export function markdownFromDoc(node, level = 0) {
  if (!node || typeof node !== "object") {
    return "";
  }

  if (node.type === "doc") {
    return (node.content || []).map((child) => markdownFromDoc(child, level)).join("\n\n").trim();
  }

  if (node.type === "paragraph") {
    return (node.content || []).map((child) => markdownFromDoc(child, level)).join("");
  }

  if (node.type === "text") {
    let text = node.text || "";

    if (Array.isArray(node.marks)) {
      for (const mark of node.marks) {
        if (mark.type === "bold") {
          text = `**${text}**`;
        } else if (mark.type === "italic") {
          text = `*${text}*`;
        } else if (mark.type === "strike") {
          text = `~~${text}~~`;
        } else if (mark.type === "link") {
          text = `[${text}](${mark.attrs?.href || "#"})`;
        }
      }
    }

    return text;
  }

  if (node.type === "heading") {
    const hashes = "#".repeat(node.attrs?.level || 1);
    return `${hashes} ${(node.content || []).map((child) => markdownFromDoc(child, level)).join("")}`;
  }

  if (node.type === "bulletList") {
    return (node.content || []).map((child) => markdownFromDoc(child, level)).join("\n");
  }

  if (node.type === "orderedList") {
    return (node.content || []).map((child, index) => markdownFromDoc({ ...child, orderIndex: index + 1 }, level)).join("\n");
  }

  if (node.type === "listItem") {
    const content = (node.content || []).map((child) => markdownFromDoc(child, level + 1)).join("\n");
    return `${"  ".repeat(level)}- ${content}`;
  }

  if (node.type === "blockquote") {
    return (node.content || [])
      .map((child) => markdownFromDoc(child, level))
      .join("\n")
      .split("\n")
      .map((line) => `> ${line}`)
      .join("\n");
  }

  if (node.type === "codeBlock") {
    return `\`\`\`\n${plainTextFromDoc(node)}\n\`\`\``;
  }

  if (node.type === "horizontalRule") {
    return "---";
  }

  if (node.type === "taskList") {
    return (node.content || []).map((child) => markdownFromDoc(child, level)).join("\n");
  }

  if (node.type === "taskItem") {
    const checked = node.attrs?.checked ? "x" : " ";
    const content = (node.content || []).map((child) => markdownFromDoc(child, level + 1)).join("");
    return `${"  ".repeat(level)}- [${checked}] ${content}`;
  }

  if (node.type === "image") {
    return `![image](${node.attrs?.src || ""})`;
  }

  if (node.type === "videoBlock") {
    return `<video src="${node.attrs?.src || ""}" />`;
  }

  return (node.content || []).map((child) => markdownFromDoc(child, level)).join("");
}

export function ensureRichDoc(content) {
  if (content && typeof content === "object" && content.type === "doc") {
    return content;
  }

  return EMPTY_DOC;
}
