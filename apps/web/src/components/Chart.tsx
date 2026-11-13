import { useEffect, useMemo, useRef, useState } from "react";

export interface Series {
  label: string;
  /** CSS colour (use a token). */
  color: string;
  values: (number | null)[];
  kind?: "line" | "bar";
  /** Dashed line, for reference values. */
  dashed?: boolean;
}

interface Props {
  labels: string[];
  series: Series[];
  format: (v: number) => string;
  height?: number;
  /** Horizontal reference line, e.g. 1.0 for breakeven. */
  reference?: { value: number; label: string };
  /** Index of a point to annotate (e.g. the inflation cut). */
  marker?: { index: number; label: string };
  ariaLabel: string;
  /** Start the y axis at zero (default true). */
  zero?: boolean;
}

const PAD = { top: 18, right: 14, bottom: 26, left: 52 };

/** The smallest "round" top of the axis whose quarter steps are round too (0.5, 1, 1.5, 2 ... of a power of ten). */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const raw = v / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10]) if (m * p * 4 >= v) return m * p * 4;
  return 40 * p;
}

/** Axis labels drop trailing zeros: "$600.0K" → "$600K", "1.00M" → "1M", "1.50M" → "1.5M". */
export function tickLabel(text: string): string {
  return text.replace(/(\d)\.(\d*?)0+(?!\d)/g, (_m, a: string, b: string) => (b ? `${a}.${b}` : a));
}

/**
 * A small SVG chart with one interaction: move across it to read every series
 * at that point. Lines draw themselves once, the first time the chart is seen.
 */
export function Chart({ labels, series, format, height = 240, reference, marker, ariaLabel, zero = true }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [hover, setHover] = useState<number | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => e && setWidth(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && setSeen(true), { threshold: 0.35 });
    io.observe(el);
    return () => {
      ro.disconnect();
      io.disconnect();
    };
  }, []);

  const { yMin, yMax, ticks } = useMemo(() => {
    const all = series.flatMap((s) => s.values.filter((v): v is number => v !== null));
    if (reference) all.push(reference.value);
    const max = niceMax(Math.max(...all, 0));
    const min = zero ? 0 : Math.min(...all);
    const t = [0, 0.25, 0.5, 0.75, 1].map((f) => min + (max - min) * f);
    return { yMin: min, yMax: max, ticks: t };
  }, [series, reference, zero]);

  const n = labels.length;
  const iw = width - PAD.left - PAD.right;
  const ih = height - PAD.top - PAD.bottom;
  const x = (i: number) => PAD.left + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.top + ih - ((v - yMin) / (yMax - yMin || 1)) * ih;
  const barW = Math.max(2, (iw / n) * 0.62 / Math.max(1, series.filter((s) => s.kind === "bar").length));
  const bars = series.filter((s) => s.kind === "bar");
  const labelEvery = Math.ceil(n / Math.max(2, Math.floor(iw / 64)));

  const onMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * width;
    const i = Math.round(((px - PAD.left) / iw) * (n - 1));
    setHover(Math.min(n - 1, Math.max(0, i)));
  };

  return (
    <figure className="chart" ref={wrap}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label={ariaLabel}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
        className={seen ? "is-seen" : undefined}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} className="chart-grid" />
            <text x={PAD.left - 8} y={y(t) + 4} className="chart-tick" textAnchor="end">
              {tickLabel(format(t))}
            </text>
          </g>
        ))}
        {labels.map((l, i) =>
          (i % labelEvery === 0 && n - 1 - i >= labelEvery * 0.6) || i === n - 1 ? (
            <text key={l} x={x(i)} y={height - 6} className="chart-tick" textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"}>
              {l}
            </text>
          ) : null,
        )}
        {reference && (
          <g>
            <line x1={PAD.left} x2={width - PAD.right} y1={y(reference.value)} y2={y(reference.value)} className="chart-ref" />
            <text x={width - PAD.right} y={y(reference.value) - 6} textAnchor="end" className="chart-ref-label">
              {reference.label}
            </text>
          </g>
        )}
        {marker && (
          <g>
            <line x1={x(marker.index)} x2={x(marker.index)} y1={PAD.top} y2={PAD.top + ih} className="chart-marker" />
            <text x={x(marker.index) + 6} y={PAD.top + 10} className="chart-ref-label">
              {marker.label}
            </text>
          </g>
        )}
        {bars.map((s, bi) =>
          s.values.map((v, i) =>
            v === null ? null : (
              <rect
                key={`${s.label}-${i}`}
                x={x(i) - (barW * bars.length) / 2 + bi * barW}
                y={y(Math.max(v, yMin))}
                width={barW - 1}
                height={Math.max(0, y(yMin) - y(Math.max(v, yMin)))}
                fill={s.color}
                opacity={hover === null || hover === i ? 1 : 0.45}
                className="chart-bar"
                style={{ transitionDelay: `${i * 12}ms` }}
              />
            ),
          ),
        )}
        {series
          .filter((s) => s.kind !== "bar")
          .map((s) => {
            let d = "";
            let pen = false;
            s.values.forEach((v, i) => {
              if (v === null) {
                pen = false;
                return;
              }
              d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`;
              pen = true;
            });
            return (
              <path
                key={s.label}
                d={d}
                fill="none"
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 5" : undefined}
                pathLength={s.dashed ? undefined : 1}
                className={s.dashed ? "chart-line-static" : "chart-line"}
              />
            );
          })}
        {hover !== null && (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={PAD.top} y2={PAD.top + ih} className="chart-cross" />
            {series
              .filter((s) => s.kind !== "bar")
              .map((s) => {
                const v = s.values[hover];
                return v === null || v === undefined ? null : <circle key={s.label} cx={x(hover)} cy={y(v)} r={4} fill={s.color} className="chart-dot" />;
              })}
          </g>
        )}
      </svg>
      <figcaption className="chart-readout" aria-live="polite">
        <span className="chart-readout-x">{hover === null ? labels[n - 1] : labels[hover]}</span>
        {series.map((s) => {
          const v = s.values[hover ?? n - 1];
          return (
            <span key={s.label} className="chart-readout-item">
              <i style={{ background: s.color }} />
              {s.label} <b>{v === null || v === undefined ? "no data" : format(v)}</b>
            </span>
          );
        })}
      </figcaption>
    </figure>
  );
}
