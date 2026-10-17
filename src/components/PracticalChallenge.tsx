import React, { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  CheckCircle2,
  Gem,
  Lightbulb,
  RotateCcw,
  Sparkles,
  Timer,
  Trophy,
  X,
  XCircle,
  Zap,
} from 'lucide-react';
import { QuizQuestion } from '../types';
import { curriculum } from '../data/curriculum';
import { StockChart } from './StockChart';
import { Mascot } from './Mascot';
import { isAnswerCorrect, normalizeAnswer } from './LessonPlayer';
import { sound } from '../utils/audio';

/**
 * 實作題挑戰（限時挑戰訓練場）
 *
 * - 從 curriculum 匯集全部 type 為 'input'（計算輸入）或 'chart'（K 線判讀）的題目，
 *   一輪 Fisher–Yates 隨機抽 5 題（不足 5 題則有多少玩多少）
 * - 關卡流程 intro → quiz → result；整輪 180 秒倒數，歸零立即結算
 * - 結算獎勵：答對數×8 XP ＋ 答對數×4 寶石，全對再 +30 XP / +15 寶石，
 *   結算時呼叫一次 onReward（由主控入帳）
 * - 最佳成績存本功能專屬 key 'levelvest-practical-v1'（不碰主存檔）
 * - 題庫不足 5 題時 intro 顯示實際題數；題庫為空時只留關閉出口
 */
export interface PracticalChallengeProps {
  /** 關閉抽屜／彈窗 */
  onClose: () => void;
  /** 結算時呼叫一次，由主控發放 XP 與寶石 */
  onReward: (xp: number, gems: number) => void;
}

type Phase = 'intro' | 'quiz' | 'result';

/** 抽題一輪的題數 */
const ROUND_SIZE = 5;
/** 整輪限時（秒） */
const ROUND_SECONDS = 180;
/** 答對 1 題的獎勵 */
const XP_PER_CORRECT = 8;
const GEMS_PER_CORRECT = 4;
/** 全對額外獎勵 */
const PERFECT_XP = 30;
const PERFECT_GEMS = 15;
/** 答完後自動下一題的等待時間（ms） */
const AUTO_ADVANCE_MS = 2000;
/** 最佳成績存檔（本功能專屬 key） */
const STORAGE_KEY = 'levelvest-practical-v1';

/* ────────────────────────── 題庫匯集 ────────────────────────── */

/** 一題實作題＋出處（章節／單元） */
interface ChallengeItem {
  key: string;
  question: QuizQuestion;
  sectionCode: string;
  sectionTitle: string;
  sectionColor: string;
  lessonCode: string;
  lessonTitle: string;
}

/** 掃描全課程，取出所有計算輸入題與圖表判讀題 */
function collectPool(): ChallengeItem[] {
  const pool: ChallengeItem[] = [];
  for (const section of curriculum) {
    for (const lesson of section.lessons) {
      lesson.questions.forEach((question, idx) => {
        if (question.type !== 'input' && question.type !== 'chart') return;
        pool.push({
          key: `${lesson.id}#${idx}`,
          question,
          sectionCode: section.code,
          sectionTitle: section.title,
          sectionColor: section.color,
          lessonCode: lesson.code,
          lessonTitle: lesson.title,
        });
      });
    }
  }
  return pool;
}

const QUESTION_POOL = collectPool();

/** Fisher–Yates 洗牌（回傳新陣列） */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** 抽一輪題目：最多 ROUND_SIZE 題，題庫不足時有多少玩多少 */
function pickRound(): ChallengeItem[] {
  return shuffle(QUESTION_POOL).slice(0, ROUND_SIZE);
}

/* ────────────────────────── 最佳成績存檔 ────────────────────────── */

interface BestRecord {
  correct: number;
  total: number;
  /** 結算時間（epoch ms） */
  at: number;
}

/** 讀取最佳成績；損毀／格式不符的資料優雅忽略 */
function readBest(): BestRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { best?: Partial<BestRecord> } | null;
    const best = parsed && typeof parsed === 'object' ? parsed.best : null;
    if (!best || typeof best !== 'object') return null;
    if (typeof best.correct !== 'number' || !Number.isFinite(best.correct)) return null;
    if (typeof best.total !== 'number' || !Number.isFinite(best.total) || best.total <= 0) return null;
    if (best.correct < 0 || best.correct > best.total) return null;
    return {
      correct: Math.round(best.correct),
      total: Math.round(best.total),
      at: typeof best.at === 'number' && Number.isFinite(best.at) ? best.at : 0,
    };
  } catch {
    return null;
  }
}

function writeBest(best: BestRecord) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ best }));
  } catch {
    /* 儲存空間不足時靜默略過，不影響作答 */
  }
}

/** 比較兩輪成績：先比正確率，同正確率再比答對題數 */
function isBetterRecord(a: BestRecord, b: BestRecord): boolean {
  const rateA = a.total > 0 ? a.correct / a.total : 0;
  const rateB = b.total > 0 ? b.correct / b.total : 0;
  if (rateA !== rateB) return rateA > rateB;
  return a.correct > b.correct;
}

/** 秒數 → mm:ss */
function formatTime(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

/* ────────────────────────── 元件 ────────────────────────── */

export const PracticalChallenge: React.FC<PracticalChallengeProps> = ({
  onClose,
  onReward,
}) => {
  const [phase, setPhase] = useState<Phase>('intro');
  const [round, setRound] = useState<ChallengeItem[]>(() => pickRound());
  const [qIndex, setQIndex] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  /** input 題的學員輸入 */
  const [inputText, setInputText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  /** 整輪倒數（秒） */
  const [timeLeft, setTimeLeft] = useState(ROUND_SECONDS);
  /** 本輪結算獎勵（進到 result 前為 null） */
  const [reward, setReward] = useState<{ xp: number; gems: number; perfect: boolean } | null>(null);
  /** 是否因時間到而結算 */
  const [timedOut, setTimedOut] = useState(false);
  /** 是否刷新最佳紀錄 */
  const [isNewBest, setIsNewBest] = useState(false);
  const [best, setBest] = useState<BestRecord | null>(() => readBest());
  /** 確保一輪只發一次獎勵（自動推進與倒數歸零可能同幀觸發） */
  const rewardedRef = useRef(false);

  const total = round.length;
  const current = total > 0 && qIndex < total ? round[qIndex] : undefined;

  /* ── 倒數：僅在 quiz 階段每秒遞減，歸零立即結算 ── */
  useEffect(() => {
    if (phase !== 'quiz') return;
    const id = window.setInterval(() => {
      setTimeLeft((t) => (t <= 1 ? 0 : t - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase === 'quiz' && timeLeft === 0) {
      finish('timeout');
    }
    // finish 每次渲染重建，僅在倒數歸零時需要觸發一次（rewardedRef 會擋住重複結算）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  /* ── 送出後 2 秒自動下一題（學員也可按按鈕跳過）── */
  useEffect(() => {
    if (phase !== 'quiz' || !submitted) return;
    const id = window.setTimeout(() => advance(), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, submitted, qIndex]);

  /* ── Esc 關閉 ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sound.playClick();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** 回到 intro 並重置一輪狀態（不重抽題） */
  const resetRoundState = () => {
    setQIndex(0);
    setSelected(null);
    setInputText('');
    setSubmitted(false);
    setCorrectCount(0);
    setTimeLeft(ROUND_SECONDS);
    setReward(null);
    setTimedOut(false);
    setIsNewBest(false);
    rewardedRef.current = false;
  };

  /** 結算（一輪只會執行一次） */
  const finish = (reason: 'done' | 'timeout') => {
    if (rewardedRef.current || phase !== 'quiz') return;
    rewardedRef.current = true;
    const perfect = total > 0 && correctCount === total;
    const xp = correctCount * XP_PER_CORRECT + (perfect ? PERFECT_XP : 0);
    const gems = correctCount * GEMS_PER_CORRECT + (perfect ? PERFECT_GEMS : 0);
    setReward({ xp, gems, perfect });
    setTimedOut(reason === 'timeout');
    if (reason === 'timeout') {
      sound.playError();
    } else {
      sound.playSuccess();
    }
    onReward(xp, gems);
    // 最佳成績（先比再寫，損毀資料已在讀取時忽略）
    const record: BestRecord = { correct: correctCount, total, at: Date.now() };
    const isBetter = !best || isBetterRecord(record, best);
    setIsNewBest(isBetter && total > 0);
    if (isBetter && total > 0) {
      setBest(record);
      writeBest(record);
    }
    setPhase('result');
  };

  /** 推進到下一題，最後一題則結算 */
  const advance = () => {
    if (qIndex + 1 < total) {
      setQIndex((i) => i + 1);
      setSelected(null);
      setInputText('');
      setSubmitted(false);
    } else {
      finish('done');
    }
  };

  const handleStart = () => {
    if (total === 0) return;
    sound.playClick();
    resetRoundState();
    setPhase('quiz');
  };

  /** 再挑戰一次：重新抽題並回到說明頁 */
  const handleRetry = () => {
    sound.playClick();
    setRound(pickRound());
    resetRoundState();
    setPhase('intro');
  };

  const handleClose = () => {
    sound.playClick();
    onClose();
  };

  const handleSelect = (idx: number) => {
    if (submitted) return;
    sound.playClick();
    setSelected(idx);
  };

  const inputMode = current?.question.type === 'input';
  /** 目前這題是否可送出 */
  const canSubmit = current
    ? inputMode
      ? normalizeAnswer(inputText).length > 0
      : selected !== null
    : false;

  const handleSubmit = () => {
    if (!current || submitted || !canSubmit) return;
    setSubmitted(true);
    const correct = inputMode
      ? isAnswerCorrect(current.question, inputText)
      : selected === current.question.answer;
    if (correct) {
      sound.playSuccess();
      setCorrectCount((c) => c + 1);
    } else {
      sound.playError();
    }
  };

  const handleNext = () => {
    sound.playClick();
    advance();
  };

  const accuracy = total > 0 ? Math.round((correctCount / total) * 100) : 0;
  const perfect = reward?.perfect ?? false;

  return (
    <AnimatePresence>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="實作題挑戰：限時挑戰訓練場"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      >
        <motion.div
          initial={{ y: 40, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 40, opacity: 0 }}
          className="bg-white w-full max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92vh] overflow-y-auto shadow-2xl border-2 border-emerald-100"
        >
          {/* Header */}
          <div
            className="sticky top-0 z-10 px-5 pt-4 pb-3 border-b-2 border-emerald-100 bg-white"
            style={{ borderTopLeftRadius: 24, borderTopRightRadius: 24 }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-[#58CC02] text-white flex items-center gap-1">
                    <Zap className="w-3 h-3 fill-white" />
                    實作挑戰
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 truncate">
                    限時訓練場 · 計算輸入＋K 線判讀
                  </span>
                </div>
                <h2 className="text-lg font-black text-slate-800 truncate">實作題挑戰</h2>
              </div>

              <div className="flex items-center gap-2">
                {phase === 'quiz' && (
                  <span
                    role="timer"
                    aria-label={`本輪剩餘 ${timeLeft} 秒`}
                    className={`flex items-center gap-1 text-sm font-black px-2.5 py-1 rounded-full border ${
                      timeLeft <= 30
                        ? 'text-rose-600 bg-rose-50 border-rose-200 animate-pulse'
                        : 'text-amber-600 bg-amber-50 border-amber-200'
                    }`}
                  >
                    <Timer className="w-4 h-4" />
                    {formatTime(timeLeft)}
                  </span>
                )}
                <button
                  onClick={handleClose}
                  aria-label="關閉實作題挑戰"
                  className="p-2 rounded-full hover:bg-slate-100 text-slate-400 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {phase === 'quiz' && (
              <div className="mt-3 flex items-center gap-2">
                <div className="flex-1 h-2.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 bg-gradient-to-r from-[#58CC02] to-lime-300"
                    style={{ width: `${((qIndex + (submitted ? 1 : 0)) / Math.max(total, 1)) * 100}%` }}
                  />
                </div>
                <span className="text-[11px] font-black text-slate-500">
                  {Math.min(qIndex + 1, total)}/{total}
                </span>
              </div>
            )}
          </div>

          <div className="p-5">
            {/* ── INTRO ── */}
            {phase === 'intro' && (
              <div>
                <div className="flex items-start gap-3 mb-4">
                  <Mascot emotion="thinking" size="md" className="shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs font-bold text-emerald-500 mb-1">準備好動手算了嗎？</p>
                    <div className="bg-[#F7FFF3] border border-emerald-100 rounded-2xl p-3.5">
                      <p className="text-sm text-slate-800 leading-relaxed font-medium">
                        限時挑戰：<span className="font-black text-[#58CC02]">180 秒</span>內完成本輪
                        <span className="font-black">計算輸入題</span>與
                        <span className="font-black">K 線判讀題</span>
                        ，看圖也要能立刻下判斷！
                      </p>
                    </div>
                  </div>
                </div>

                {/* 本輪資訊 */}
                <div className="grid grid-cols-3 gap-2.5 mb-4">
                  <div className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-3 text-center">
                    <p className="text-[10px] font-black text-slate-400 mb-0.5">本輪題數</p>
                    <p className="text-lg font-black text-slate-700">{total} 題</p>
                  </div>
                  <div className="bg-amber-50 border-2 border-amber-100 rounded-2xl p-3 text-center">
                    <p className="text-[10px] font-black text-amber-500 mb-0.5">限時</p>
                    <p className="text-lg font-black text-amber-600">180 秒</p>
                  </div>
                  <div className="bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-3 text-center">
                    <p className="text-[10px] font-black text-emerald-500 mb-0.5">答對 1 題</p>
                    <p className="text-lg font-black text-emerald-600">+8 XP</p>
                  </div>
                </div>

                <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3.5 flex items-start gap-2.5 mb-4">
                  <Sparkles className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p className="text-sm font-bold text-amber-900 leading-relaxed">
                    答對 1 題 = 8 XP ＋ 4 寶石；本輪
                    <span className="font-black">全對再 +30 XP / +15 寶石</span>
                    。時間到立刻結算，沒答完就拿不到滿分獎勵！
                  </p>
                </div>

                {/* 最佳紀錄 */}
                <div className="rounded-2xl border-2 border-sky-200 bg-sky-50 p-3.5 flex items-center gap-2.5 mb-4">
                  <Trophy className="w-5 h-5 text-sky-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black text-sky-500">最佳紀錄</p>
                    {best ? (
                      <p className="text-sm font-black text-sky-800">
                        答對 {best.correct} / {best.total} 題（
                        {Math.round((best.correct / best.total) * 100)}%）
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-sky-700">尚無紀錄，來創下第一筆吧！</p>
                    )}
                  </div>
                </div>

                {QUESTION_POOL.length > 0 && (
                  <p className="text-[11px] text-slate-400 font-bold text-center mb-1">
                    題庫目前共 {QUESTION_POOL.length} 道實作題，每輪隨機抽 {Math.min(ROUND_SIZE, QUESTION_POOL.length)} 題
                  </p>
                )}

                {total === 0 ? (
                  <div className="text-center py-2">
                    <p className="text-sm font-bold text-slate-500 mb-4">
                      題庫還沒有實作題（計算輸入／圖表判讀），之後再來挑戰！
                    </p>
                    <button
                      onClick={handleClose}
                      className="w-full py-3.5 bg-[#58CC02] hover:bg-[#4cb502] text-white font-black text-base rounded-2xl border-b-4 border-[#3e9302] active:border-b-0 active:translate-y-1 transition-all shadow-md cursor-pointer"
                    >
                      關閉
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleStart}
                    aria-label={`開始 ${total} 題限時實作挑戰`}
                    className="w-full mt-1 py-3.5 bg-[#58CC02] hover:bg-[#4cb502] text-white font-black text-base rounded-2xl border-b-4 border-[#3e9302] active:border-b-0 active:translate-y-1 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Zap className="w-5 h-5" />
                    開始挑戰 · {total} 題 / 180 秒
                  </button>
                )}
              </div>
            )}

            {/* ── QUIZ ── */}
            {phase === 'quiz' && current && (
              <div>
                {/* 出處 */}
                <div className="flex items-center gap-2 mb-3">
                  <span
                    className="text-[10px] font-black px-2 py-0.5 rounded-full text-white shrink-0"
                    style={{ background: current.sectionColor }}
                  >
                    {current.sectionCode}
                  </span>
                  <span className="text-[10px] font-bold text-slate-400 truncate">
                    {current.lessonCode} · {current.lessonTitle} · {current.sectionTitle}
                  </span>
                </div>

                {/* chart 題：先看 K 線圖再作答 */}
                {current.question.chart && (
                  <div className="mb-4">
                    <StockChart
                      spec={current.question.chart}
                      label={`挑戰附圖：${current.question.q}`}
                      height={160}
                    />
                  </div>
                )}

                <p className="text-sm font-black text-slate-800 leading-relaxed mb-4">
                  {inputMode ? (
                    <span className="inline-block mr-1.5 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] align-middle">
                      ✏️ 計算題 · 請輸入答案
                    </span>
                  ) : (
                    <span className="inline-block mr-1.5 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] align-middle">
                      📈 看圖判斷
                    </span>
                  )}
                  {current.question.q}
                </p>

                {/* input 題：輸入框作答（Enter 送出） */}
                {inputMode && (
                  <div className="rounded-2xl border-2 border-b-4 border-amber-200 bg-amber-50/60 p-4">
                    <label
                      className="block text-xs font-black text-amber-700 mb-2"
                      htmlFor="practical-challenge-answer"
                    >
                      你的答案
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id="practical-challenge-answer"
                        value={inputText}
                        onChange={(e) => setInputText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !submitted) handleSubmit();
                        }}
                        disabled={submitted}
                        inputMode="decimal"
                        autoComplete="off"
                        aria-label="實作題答案輸入框"
                        placeholder={current.question.hint ?? '輸入數字或答案'}
                        className={`flex-1 min-w-0 px-3.5 py-3 rounded-xl border-2 bg-white font-black text-base text-slate-800 outline-none transition-all disabled:cursor-default ${
                          submitted
                            ? isAnswerCorrect(current.question, inputText)
                              ? 'border-emerald-400 bg-emerald-50 text-emerald-800'
                              : 'border-rose-400 bg-rose-50 text-rose-800'
                            : 'border-amber-300 focus:border-amber-500'
                        }`}
                      />
                      {current.question.unit && (
                        <span className="text-sm font-black text-slate-500 shrink-0">
                          {current.question.unit}
                        </span>
                      )}
                    </div>
                    {current.question.hint && !submitted && (
                      <p className="text-[11px] font-bold text-amber-600 mt-2 flex items-center gap-1">
                        <Lightbulb className="w-3.5 h-3.5" />
                        {current.question.hint}
                      </p>
                    )}
                    {submitted && (
                      <p className="text-[11px] font-black mt-2 text-slate-600">
                        正確答案：
                        <span className="text-emerald-700">
                          {current.question.accept?.[0]}
                          {current.question.unit ?? ''}
                        </span>
                      </p>
                    )}
                  </div>
                )}

                {/* chart／mcq：選項按鈕 */}
                {!inputMode && (
                  <div className="space-y-2.5">
                    {current.question.choices.map((choice, idx) => {
                      const isCorrect = idx === current.question.answer;
                      const isSelected = selected === idx;
                      let cls =
                        'border-slate-200 bg-white hover:bg-slate-50 border-b-slate-300 text-slate-700';
                      let chipCls = 'bg-slate-100 border-slate-200 text-slate-500';
                      if (submitted) {
                        if (isCorrect) {
                          cls = 'border-emerald-400 bg-emerald-50 border-b-emerald-500 text-emerald-900';
                          chipCls = 'bg-emerald-400 border-emerald-500 text-white';
                        } else if (isSelected) {
                          cls = 'border-rose-400 bg-rose-50 border-b-rose-500 text-rose-900';
                          chipCls = 'bg-rose-400 border-rose-500 text-white';
                        } else {
                          cls = 'border-slate-100 bg-slate-50 border-b-slate-100 text-slate-400';
                          chipCls = 'bg-slate-100 border-slate-200 text-slate-300';
                        }
                      } else if (isSelected) {
                        cls = 'border-sky-400 bg-sky-50 border-b-sky-500 text-sky-900 shadow-md';
                        chipCls = 'bg-sky-500 border-sky-600 text-white';
                      }
                      return (
                        <button
                          key={idx}
                          onClick={() => handleSelect(idx)}
                          disabled={submitted}
                          aria-label={`選項 ${String.fromCharCode(65 + idx)}：${choice}`}
                          className={`w-full text-left px-4 py-3.5 rounded-2xl border-2 border-b-4 font-bold text-sm transition-all active:translate-y-0.5 active:border-b-2 cursor-pointer disabled:cursor-default ${cls}`}
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`w-7 h-7 rounded-lg border-2 flex items-center justify-center text-xs font-black shrink-0 transition-colors ${chipCls}`}
                            >
                              {String.fromCharCode(65 + idx)}
                            </span>
                            <span className="flex-1 leading-snug">{choice}</span>
                            {submitted && isCorrect && (
                              <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                            )}
                            {submitted && isSelected && !isCorrect && (
                              <XCircle className="w-5 h-5 text-rose-500 shrink-0" />
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* 對錯回饋＋解析（2 秒後自動下一題） */}
                <AnimatePresence>
                  {submitted && (
                    <motion.div
                      role="status"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`mt-4 p-3.5 rounded-2xl border-2 ${
                        (inputMode
                          ? isAnswerCorrect(current.question, inputText)
                          : selected === current.question.answer)
                          ? 'border-emerald-200 bg-emerald-50'
                          : 'border-rose-200 bg-rose-50'
                      }`}
                    >
                      <p
                        className={`text-xs font-black mb-1 ${
                          (inputMode
                            ? isAnswerCorrect(current.question, inputText)
                            : selected === current.question.answer)
                            ? 'text-emerald-700'
                            : 'text-rose-700'
                        }`}
                      >
                        {(inputMode
                          ? isAnswerCorrect(current.question, inputText)
                          : selected === current.question.answer)
                          ? '答對了！'
                          : inputMode
                          ? '算錯了～'
                          : '答錯了～'}
                      </p>
                      <p className="text-sm text-slate-700 leading-relaxed">
                        {current.question.explain}
                      </p>
                      <p className="text-[11px] font-bold text-slate-400 mt-2">
                        2 秒後自動{qIndex + 1 < total ? '下一題' : '結算'}，或按下方按鈕繼續
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={submitted ? handleNext : handleSubmit}
                  disabled={!canSubmit}
                  aria-label={submitted ? '前往下一題' : '送出答案'}
                  className={`w-full mt-5 py-3.5 font-black text-base rounded-2xl transition-all ${
                    !canSubmit
                      ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                      : submitted
                      ? 'bg-sky-500 hover:bg-sky-600 text-white border-b-4 border-sky-700 active:border-b-0 active:translate-y-1 shadow-md cursor-pointer'
                      : 'bg-[#58CC02] hover:bg-[#4cb502] text-white border-b-4 border-[#3e9302] active:border-b-0 active:translate-y-1 shadow-md cursor-pointer'
                  }`}
                >
                  {submitted
                    ? qIndex + 1 < total
                      ? '下一題'
                      : '看結果'
                    : '確認答案'}
                </button>
              </div>
            )}

            {/* ── RESULT ── */}
            {phase === 'result' && (
              <div className="text-center">
                <Mascot
                  emotion={perfect || accuracy >= 60 ? 'celebrating' : 'oops'}
                  size="lg"
                  className="mx-auto mb-3"
                />
                <h3 className="text-2xl font-black text-slate-800 mb-1">
                  {timedOut ? '時間到！' : perfect ? '全部答對！' : '挑戰完成！'}
                </h3>
                {timedOut && (
                  <p className="text-xs font-bold text-rose-500 mb-1">
                    倒數歸零，未作答的題目不計分
                  </p>
                )}
                <p className="text-slate-500 text-sm mb-4">
                  答對 {correctCount} / {total} 題
                </p>

                {/* 成績 */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-[#F7FFF3] border-2 border-emerald-200 rounded-2xl p-3">
                    <p className="text-[10px] font-black text-emerald-500 mb-0.5">正確率</p>
                    <p className="text-xl font-black text-emerald-600">{accuracy}%</p>
                  </div>
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3">
                    <p className="text-[10px] font-black text-amber-500 mb-0.5">剩餘秒數</p>
                    <p className="text-xl font-black text-amber-600">{timeLeft} 秒</p>
                  </div>
                </div>

                {/* 獎勵 */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-3 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500 border-b-4 border-emerald-700 flex items-center justify-center shrink-0">
                      <Zap className="w-5 h-5 text-white fill-white" />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-emerald-600 font-black">經驗值</p>
                      <p className="text-lg font-black text-emerald-700">+{reward?.xp ?? 0} XP</p>
                    </div>
                  </div>
                  <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl p-3 flex items-center gap-2.5">
                    <div className="w-9 h-9 rounded-xl bg-sky-500 border-b-4 border-sky-700 flex items-center justify-center shrink-0">
                      <Gem className="w-5 h-5 text-white" />
                    </div>
                    <div className="text-left">
                      <p className="text-[10px] text-sky-600 font-black">寶石</p>
                      <p className="text-lg font-black text-sky-700">+{reward?.gems ?? 0}</p>
                    </div>
                  </div>
                </div>

                {perfect && (
                  <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-3 mb-4 flex items-center justify-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-amber-500" />
                    <p className="text-xs font-black text-amber-800">
                      全對加成！額外 +{PERFECT_XP} XP / +{PERFECT_GEMS} 寶石
                    </p>
                    <Sparkles className="w-4 h-4 text-amber-500" />
                  </div>
                )}

                {isNewBest && (
                  <div className="bg-sky-50 border-2 border-sky-200 rounded-2xl p-3 mb-4 flex items-center justify-center gap-1.5">
                    <Trophy className="w-4 h-4 text-sky-500" />
                    <p className="text-xs font-black text-sky-700">🎉 新的最佳紀錄！</p>
                  </div>
                )}

                <button
                  onClick={handleRetry}
                  aria-label="重新抽題再挑戰一次"
                  className="w-full py-3.5 bg-[#58CC02] hover:bg-[#4cb502] text-white font-black text-base rounded-2xl border-b-4 border-[#3e9302] active:border-b-0 active:translate-y-1 transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer"
                >
                  <RotateCcw className="w-5 h-5" />
                  再挑戰一次
                </button>
                <button
                  onClick={handleClose}
                  aria-label="關閉實作題挑戰"
                  className="w-full mt-2.5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  關閉
                </button>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
