// Chart.js bundlé (aucun CDN) : seuls les composants utilisés sont enregistrés.
import { Chart, LineController, ScatterController, LineElement, PointElement, LinearScale, Tooltip, Legend, Filler } from 'chart.js';
import { dayNumber, fromDayNumber } from './engine.js';
import { fmtDate } from './ui.js';

Chart.register(LineController, ScatterController, LineElement, PointElement, LinearScale, Tooltip, Legend, Filler);
Chart.defaults.color = '#8d8d99';
Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
Chart.defaults.font.family = "'Outfit Variable', system-ui, sans-serif";
Chart.defaults.font.size = 12;
Chart.defaults.plugins.tooltip.backgroundColor = '#f6f6f7';
Chart.defaults.plugins.tooltip.titleColor = '#09090b';
Chart.defaults.plugins.tooltip.bodyColor = '#09090b';
Chart.defaults.plugins.tooltip.padding = 10;
Chart.defaults.plugins.tooltip.cornerRadius = 12;
Chart.defaults.plugins.tooltip.displayColors = false;
Chart.defaults.maintainAspectRatio = false;
Chart.defaults.plugins.legend.labels.usePointStyle = true;

export const COLORS = { accent: '#d4ff3f', info: '#a594ff', muted: 'rgba(141,141,153,0.6)', warn: '#ff7a45' };

/** Remplissage en dégradé vertical sous une courbe (couleur RGB « r,g,b »). */
export function fade(rgb = '212,255,63', top = 0.32) {
  return (c) => {
    const { ctx, chartArea } = c.chart;
    if (!chartArea) return 'transparent';
    const g = ctx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
    g.addColorStop(0, `rgba(${rgb},${top})`);
    g.addColorStop(1, `rgba(${rgb},0)`);
    return g;
  };
}

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
