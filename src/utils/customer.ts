// Human-readable customer labels. Olist source IDs are anonymized hex tokens,
// so we pair a short ID with the real home city/state from dim_customer.

export function shortId(id: string, len = 8): string {
  return id ? id.slice(0, len) : '—';
}

export function locationLabel(city?: string | null, state?: string | null): string {
  if (city && state) return `${toTitle(city)} · ${state.toUpperCase()}`;
  if (state) return state.toUpperCase();
  if (city) return toTitle(city);
  return '—';
}

function toTitle(s: string): string {
  return s
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w))
    .join(' ');
}

export function rfmParts(score?: string | null): [string, string, string] {
  if (!score || score.length !== 3) return ['—', '—', '—'];
  return [score[0], score[1], score[2]];
}
