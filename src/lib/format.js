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
      const amount = range.step ? Math.round(seconds / range.step) : seconds;
      return formatter.format(amount, range.unit);
    }
  }

  return formatFullDate(value);
}

export function normalizeTitle(value, fallback = "Untitled page") {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized.slice(0, 120) || fallback;
}

export function formatFileSize(value) {
  const size = Number(value || 0);

  if (!Number.isFinite(size) || size <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  const exponent = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const normalized = size / 1024 ** exponent;

  return `${normalized >= 10 || exponent === 0 ? normalized.toFixed(0) : normalized.toFixed(1)} ${units[exponent]}`;
}

export function countWords(text) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function summarize(text) {
  return text.replace(/\s+/g, " ").trim().slice(0, 140) || "내용이 아직 없습니다.";
}

export function sortPages(pages) {
  return [...pages].sort((left, right) => {
    if ((left.parentId || "") === (right.parentId || "")) {
      return left.position - right.position;
    }

    return (left.parentId || "").localeCompare(right.parentId || "");
  });
}

export function colorClass(color) {
  const classes = {
    amber: "bg-amber-100 text-amber-700 ring-amber-200",
    cyan: "bg-cyan-100 text-cyan-700 ring-cyan-200",
    emerald: "bg-emerald-100 text-emerald-700 ring-emerald-200",
    orange: "bg-orange-100 text-orange-700 ring-orange-200",
    rose: "bg-rose-100 text-rose-700 ring-rose-200",
    violet: "bg-violet-100 text-violet-700 ring-violet-200"
  };

  return classes[color] || classes.cyan;
}
