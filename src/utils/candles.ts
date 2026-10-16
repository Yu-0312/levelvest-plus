import type { ChartPattern, ChartSpec } from '../types';

export interface Candle {
  o: number;
  h: number;
  l: number;
  c: number;
  /** 成交量相對值 0–1 */
  v: number;
}

/** mulberry32：小而穩定的決定論式 PRNG，同一 seed 必產生同一序列 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 依圖型的目標日均報酬（%）與波動度 */
const PATTERN_PROFILE: Record<ChartPattern, { drift: number; vol: number; volMul?: (i: number, n: number) => number }> = {
  uptrend: { drift: 0.35, vol: 1.2 },
  downtrend: { drift: -0.35, vol: 1.4 },
  range: { drift: 0, vol: 1.5 },
  breakout: {
    drift: 0.25,
    vol: 1.1,
    // 前段盤整、後段噴出
    volMul: (i, n) => (i < n * 0.6 ? 0.7 : 1.6),
  },
  'false-breakout': {
    drift: -0.05,
    vol: 1.6,
    // 前段假突破後急殺
    volMul: (i, n) => (i > n * 0.72 ? 2.2 : 1),
  },
  'double-top': { drift: -0.15, vol: 1.5 },
  'head-shoulders': { drift: -0.18, vol: 1.5 },
  pullback: {
    drift: 0.22,
    vol: 1.2,
    // 中段回檔
    volMul: (i, n) => (i > n * 0.45 && i < n * 0.62 ? 1.8 : 0.9),
  },
  'vol-spike': {
    drift: 0.1,
    vol: 1.3,
    volMul: (i, n) => (i > n * 0.75 ? 3 : 1),
  },
};

/** 讓指定比例的 K 棒出現明顯的上下影線（假裝有買賣力道拉扯） */
function withShadows(prevClose: number, body: number, rand: () => number, volatility: number): Candle {
  const o = prevClose;
  const c = o + body;
  const wick = volatility * (0.4 + rand());
  const upper = rand() > 0.45 ? wick * rand() : 0;
  const lower = rand() > 0.45 ? wick * rand() : 0;
  return {
    o,
    c,
    h: Math.max(o, c) + upper,
    l: Math.min(o, c) - lower,
    v: 0.3 + rand() * 0.7,
  };
}

/**
 * 生成題目用 K 線序列（純函式、決定論）。
 * 圖型只控制「整體走勢的統計樣貌」，不保證每個教科書形態完全標準——
 * 題目問的是方向/位置判斷，不問「這是第幾波」這類絕對形態題。
 */
export function generateCandles(spec: ChartSpec): Candle[] {
  const n = Math.max(20, Math.min(120, spec.bars ?? 60));
  const profile = PATTERN_PROFILE[spec.pattern] ?? PATTERN_PROFILE.range;
  const rand = rng(spec.seed);
  const candles: Candle[] = [];
  let price = spec.startPrice ?? 500;

  const baseVol = price * 0.012; // 每棒基礎波動 ≈ 1.2%

  for (let i = 0; i < n; i++) {
    const mul = profile.volMul?.(i, n) ?? 1;
    const volatility = baseVol * profile.vol * mul;

    // 漂移：圖型目標 + 中期擺動（range / double-top 類靠擺動製造高低點）
    let drift = profile.drift;
    if (spec.pattern === 'range') drift = Math.sin((i / n) * Math.PI * 3) * 0.9;
    if (spec.pattern === 'double-top') {
      // 兩個高點（i≈0.25、0.6）間的雙峰、中段回落
      const p = i / n;
      drift = p < 0.25 ? 0.7 : p < 0.42 ? -0.9 : p < 0.6 ? 0.75 : p < 0.75 ? -0.9 : -0.4;
    }
    if (spec.pattern === 'head-shoulders') {
      const p = i / n;
      // 左肩→頭→右肩，頸線後跌破
      drift = p < 0.2 ? 0.6 : p < 0.32 ? -0.5 : p < 0.5 ? 1.0 : p < 0.62 ? -0.7 : p < 0.74 ? 0.5 : p < 0.84 ? -0.7 : -1.1;
    }

    const shock = (rand() - 0.5) * 2 * volatility;
    const body = (drift / 100) * price + shock;
    candles.push(withShadows(price, body, rand, volatility));
    price = candles[candles.length - 1].c;
    if (price <= 0) price = baseVol; // 防呆：價格不得歸零
  }
  return candles;
}

/** 簡單移動平均線（回傳每根的值，前面不足期數為 null） */
export function movingAverage(candles: Candle[], period: number): (number | null)[] {
  const out: (number | null)[] = [];
  let sum = 0;
  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].c;
    if (i >= period) sum -= candles[i - period].c;
    out.push(i >= period - 1 ? sum / period : null);
  }
  return out;
}
