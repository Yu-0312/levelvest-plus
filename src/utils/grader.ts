import type { QuizQuestion } from '../types';

/** 逐步批改結果：steps＝每一行一個步驟；offline＝true 表示走內建離線解析 */
export interface GradeResult {
  steps: string[];
  offline: boolean;
}

const MODEL = 'gemini-2.5-flash';
/** 網路卡住時不能讓「老師批改中…」永遠轉圈 */
const TIMEOUT_MS = 25_000;

const hasApiKey = (): boolean => Boolean(import.meta.env.VITE_GEMINI_API_KEY?.trim());

/** 正確答案字樣（accept[0]；缺值時給中性提示） */
function correctAnswerText(q: QuizQuestion): string {
  const accept = q.accept?.[0]?.trim();
  return accept || '（請對照課本解析）';
}

/** System 指令：把題幹、課本解析、正確答案、學員輸入一併交給 Gemini */
function buildSystemInstruction(q: QuizQuestion, userAnswer: string): string {
  return [
    '你是 LevelVest 的計算題批改老師，正在逐步批改學生寫下的算式。',
    '請遵守以下規則：',
    '1. 一律使用繁體中文，語氣像耐心的家教，溫柔、具體、不責備。',
    '2. 以條列方式輸出 2〜4 個步驟，每步一行，一行只講一件事，不寫多餘開頭或結語。',
    '3. 第 1 步先肯定學生做對的部分（條件抓對、方向正確、某一步算對都算）。',
    '4. 第 2 步起指出算式哪裡錯：哪個數字、哪個單位、哪一步漏乘或錯乘。',
    '5. 最後一行給出正確算式與答案。',
    '6. 全文不超過 200 字。',
    '7. 只講解這一道題，不提供任何投資建議（不報明牌、不預測漲跌、不說該買該賣哪檔股票）。',
    '',
    `【題幹】${q.q}`,
    `【課本解析】${q.explain}`,
    `【正確答案】${correctAnswerText(q)}`,
    `【學生輸入】${userAnswer}`,
  ].join('\n');
}

/** 模型回覆 → 步驟陣列：依換行切，去掉空行與模型自帶的序號／項目符號 */
function toSteps(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        .replace(/^\s*(?:\d+\s*[.、)]|[（(]\d+[）)]|[-–—•*‧]+|[一二三四五六七八九十]+\s*[、.])\s*/, '')
        .trim()
    )
    .filter(Boolean);
}

/** 內建離線解析（無金鑰／逾時／失敗時的降級路徑） */
function offlineResult(q: QuizQuestion, userAnswer: string): GradeResult {
  return {
    offline: true,
    steps: [
      `你的答案：${userAnswer}（正確答案：${correctAnswerText(q)}）`,
      `課本解析：${q.explain}`,
      `提示：${q.hint ?? '先確認題目給的條件與單位換算'}`,
    ],
  };
}

/** 呼叫 Gemini（含 25 秒逾時保護）；失敗一律丟錯，由 gradeWork 降級 */
async function askGemini(q: QuizQuestion, userAnswer: string): Promise<string> {
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY?.trim();
  if (!apiKey) throw new Error('缺少 VITE_GEMINI_API_KEY');
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey });
  const request = ai.models.generateContent({
    model: MODEL,
    contents: [{ role: 'user', parts: [{ text: '請逐步批改下面這題學生的算式。' }] }],
    config: { systemInstruction: buildSystemInstruction(q, userAnswer) },
  });
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('請求逾時（25 秒）')), TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([request, timeout]);
    const text = res.text?.trim();
    if (!text) throw new Error('模型回覆為空');
    return text;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/**
 * 逐步批改：給題目、學員輸入，回傳講解步驟陣列。
 * 有金鑰時交給 Gemini 逐步糾正；無金鑰／逾時／失敗時回傳內建離線解析，不丟錯。
 */
export async function gradeWork(q: QuizQuestion, userAnswer: string): Promise<GradeResult> {
  if (!hasApiKey()) return offlineResult(q, userAnswer);
  try {
    const steps = toSteps(await askGemini(q, userAnswer));
    if (steps.length === 0) throw new Error('模型回覆為空');
    return { steps, offline: false };
  } catch {
    return offlineResult(q, userAnswer);
  }
}
