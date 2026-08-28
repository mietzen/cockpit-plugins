export function formatBytes(bytes?: number | null, decimals = 2): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) {
    return "0 B";
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KiB", "MiB", "GiB", "TiB", "PiB", "EiB"];

  const i = Math.floor(Math.log(bytes) / Math.log(k));
  if (i < 0) {
    return `${bytes} B`;
  }
  const index = Math.min(i, sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(dm))} ${sizes[index]}`;
}

export function formatPercentage(val?: number | null): string {
  if (val === undefined || val === null || isNaN(val)) {
    return "0%";
  }
  return `${val.toFixed(1)}%`;
}

export function formatDate(epochSeconds?: number | null): string {
  if (!epochSeconds) {
    return "-";
  }
  const date = new Date(epochSeconds * 1000);
  return date.toLocaleString();
}

export function getHealthBadgeColor(health?: string): "success" | "warning" | "danger" | "grey" {
  switch (health?.toUpperCase()) {
    case "ONLINE":
    case "PASSED":
      return "success";
    case "DEGRADED":
    case "SUSPENDED":
      return "warning";
    case "FAULTED":
    case "UNAVAIL":
    case "FAILED":
      return "danger";
    default:
      return "grey";
  }
}
