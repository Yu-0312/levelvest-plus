import React, { useMemo } from 'react';
import type { ChartSpec } from '../types';
import { generateCandles, movingAverage } from '../utils/candles';

interface StockChartProps {
  spec: ChartSpec;
  /** 說明用 aria 文字（無障礙） */
  label?: string;
  height?: number;
}

/**
 * 題幹附圖：純 SVG 自繪 K 線（不依賴繪圖库）。
 * 決定論式生成 → 同一題每次畫面都長一樣。
 */
export const StockChart: React.FC<StockChartProps> = ({ spec, label, height = 180 }) => {
  const { candles, ma, pad, xOf, yOf } = useMemo(() => {
    const candles = generateCandles(spec);
    const ma = spec.ma ? movingAverage(candles, spec.ma) : null;
    const pad = { t: 8, r: 6, b: 18, l: 6 };
    let minP = Infinity;
    let maxP = -Infinity;
    for (const c of candles) {
      if (c.l < minP) minP = c.l;
      if (c.h > maxP) maxP = c.h;
    }
    if (ma) for (const v of ma) if (v != null && v < minP) minP = v, void 0;
    if (ma) for (const v of ma) if (v != null && v > maxP) maxP = v;
    const span = maxP - minP || 1;
    minP -= span * 0.05;
    maxP += span * 0.05;
    const yOf = (p: number, h: number) =>
      pad.t + ((maxP - p) / (maxP - minP)) * (h - pad.t - pad.b);
    const W = 320;
    const xOf = (i: number) => pad.l + (i + 0.5) * ((W - pad.l - pad.r) / candles.length);
    return { candles, ma, pad, xOf, yOf, minP, maxP };
  }, [spec]);

  const W = 320;
  const H = height;
  const candleW = Math.max(2, ((W - pad.l - pad.r) / candles.length) * 0.6);
  const first = candles[0];
  const last = candles[candles.length - 1];
  const change = ((last.c - first.o) / first.o) * 100;
  const up = change >= 0;

  return (
    <figure
      className="bg-slate-900 rounded-2xl border-2 border-slate-700 overflow-hidden"
      role="img"
      aria-label={label ?? `K 線圖：${spec.pattern}，期間變動 ${change.toFixed(1)}%`}
    >
      <figcaption className="flex items-center justify-between px-3 py-1.5 text-[10px] font-black text-slate-400 border-b border-slate-700">
        <span>示範行情（非即時報價）</span>
        <span className={up ? 'text-emerald-400' : 'text-rose-400'}>
          {up ? '▲' : '▼'} {Math.abs(change).toFixed(1)}%
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full block" style={{ height }} aria-hidden>
        {/* 水平參考線 */}
        {[0.25, 0.5, 0.75].map((f) => {
          const y = pad.t + f * (H - pad.t - pad.b);
          return <line key={f} x1={pad.l} x2={W - pad.r} y1={y} y2={y} stroke="#1e293b" strokeWidth={1} />;
        })}
        {/* K 棒 */}
        {candles.map((c, i) => {
          const x = xOf(i);
          const rising = c.c >= c.o;
          const color = rising ? '#22c55e' : '#ef4444';
          const yTop = yOf(Math.max(c.o, c.c), H);
          const yBot = yOf(Math.min(c.o, c.c), H);
          const bodyH = Math.max(1, yBot - yTop);
          return (
            <g key={i}>
              <line x1={x} x2={x} y1={yOf(c.h, H)} y2={yOf(c.l, H)} stroke={color} strokeWidth={1} />
              <rect
                x={x - candleW / 2}
                y={yTop}
                width={candleW}
                height={bodyH}
                fill={rising ? '#22c55e' : '#ef4444'}
                stroke={color}
                strokeWidth={0.5}
              />
            </g>
          );
        })}
        {/* 均線 */}
        {ma && (
          <polyline
            fill="none"
            stroke="#facc15"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            points={ma
              .map((v, i) => (v == null ? null : `${xOf(i)},${yOf(v, H)}`))
              .filter(Boolean)
              .join(' ')}
          />
        )}
        {/* 日期軸（僅首尾） */}
        <text x={pad.l} y={H - 5} fill="#64748b" fontSize={8} fontWeight={700}>
          T-{candles.length}
        </text>
        <text x={W - pad.r} y={H - 5} fill="#64748b" fontSize={8} fontWeight={700} textAnchor="end">
          今日
        </text>
      </svg>
      {spec.ma && (
        <div className="px-3 pb-1.5 text-[10px] font-bold text-yellow-500/90">
          ─ ─ {spec.ma}MA 均線{spec.ma === 20 ? '（月線生命線）' : ''}
        </div>
      )}
    </figure>
  );
};
