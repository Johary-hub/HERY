// Chart.js bundlé (aucun CDN) : seuls les composants utilisés sont enregistrés.
import { Chart, LineController, ScatterController, LineElement, PointElement, LinearScale, Tooltip, Legend } from 'chart.js';
import { dayNumber, fromDayNumber } from './engine.js';
import { fmtDate } from './ui.js';

Chart.register(LineController, ScatterController, LineElement, PointElement, LinearScale, Tooltip, Legend);
Chart.defaults.color = '#9aa3b2';
Chart.defaults.borderColor = '#2a3140';
Chart.defaults.font.family = 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif';
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.plugins.legend.labels.usePointStyle = true;

export const COLORS = { accent: '#4ade80', info: '#60a5fa', muted: 'rgba(154,163,178,0.55)', warn: '#fbbf24' };

/** Point {x: jour, y} à partir d'une date ISO. */
export const pt = (iso, y) => ({ x: dayNumber(iso), y });

/** Axe X temporel sans adaptateur de dates : jours numériques formatés en français. */
export function dateAxis(points = []) {
  const xs = points.map((p) => p.x);
  const lo = xs.length ? Math.min(...xs) : undefined;
  const hi = xs.length ? Math.max(...xs) : undefined;
  const pad = lo === hi ? 3 : Math.max(1, Math.round((hi - lo) * 0.04));
  return {
    type: 'linear',
    min: lo == null ? undefined : lo - pad,
    max: hi == null ? undefined : hi + pad,
    ticks: { maxTicksLimit: 6, callback: (v) => fmtDate(fromDayNumber(Math.round(v)), { weekday: false }) },
    grid: { display: false },
  };
}

export function tooltipDate() {
  return { callbacks: { title: (items) => fmtDate(fromDayNumber(Math.round(items[0].parsed.x))) } };
}

export function makeChart(canvas, config) {
  return new Chart(canvas, config);
}
