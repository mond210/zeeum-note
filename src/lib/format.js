export function normalizeTitle(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.slice(0, 120) || "Untitled note";
}

export function sortNotes(notes) {
  return [...notes].sort((left, right) => {
    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

export function summarize(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 130) || "아직 내용이 없습니다.";
}

export function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function countLines(text) {
  return text ? text.split("\n").length : 0;
}

export function formatFullDate(value) {
  if (!value) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

export function formatRelativeDate(value) {
  if (!value) {
    return "";
  }

  const seconds = Math.round((new Date(value).getTime() - Date.now()) / 1000);
  const formatter = new Intl.RelativeTimeFormat("ko-KR", { numeric: "auto" });
  const ranges = [
    { limit: 60, unit: "second" },
    { limit: 3600, unit: "minute", step: 60 },
    { limit: 86400, unit: "hour", step: 3600 },
    { limit: 604800, unit: "day", step: 86400 },
    { limit: 2592000, unit: "week", step: 604800 }
  ];

  for (const range of ranges) {
    if (Math.abs(seconds) < range.limit) {
      const valueForUnit = range.step ? Math.round(seconds / range.step) : seconds;
      return formatter.format(valueForUnit, range.unit);
    }
  }

  return formatFullDate(value);
}
