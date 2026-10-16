export type TabType = 'learn' | 'leaderboard' | 'journal' | 'badges';

export interface LeaderboardStudent {
  id: string;
  rank: number;
  name: string;
  school: string;
  avatar: string;
  weeklyXp: number;
  decisionWinRate: number;
  streak: number;
  isCurrentUser?: boolean;
  cheerCount: number;
  badgeTitle: string;
}

export interface UserStats {
  streak: number;
  /** 最近一次「三項任務全清」的日期（在地日），連勝判定用；無則視為尚未連勝 */
  lastStreakDate?: string;
  gems: number;
  hearts: number;
  maxHearts: number;
  level: number;
  title: string;
  userName: string;
  xp: number;
  nextLevelXp: number;
  soundEnabled: boolean;
}

/** Onboarding questionnaire result — drives title & recommended path */
export interface OnboardingProfile {
  name: string;
  /** self-rated knowledge */
  knowledge: 'novice' | 'aware' | 'watcher' | 'analyst';
  /** investable capital bands the user selected */
  capitalBands: string[];
  /** risk appetite */
  risk: 'conservative' | 'balanced' | 'aggressive';
  /** main goal */
  goal: 'retire' | 'side-income' | 'grow' | 'protect';
  completedAt: string;
}

export type NodeStatus = 'completed' | 'active' | 'locked';

export type QuestionKind =
  | 'concept'
  | 'calc'
  | 'scenario'
  | 'data'
  | 'order'
  | 'detect'
  | 'simulate'
  | 'dialogue'
  | 'review';

/**
 * 題型：
 * - mcq   選擇題（預設，舊資料沒寫 type 即視為 mcq）
 * - input 計算輸入題：學員直接輸入數字／答案字串，系統比對（真正的實作計算）
 * - chart 圖表判讀題：題幹附 K 線圖，作答方式仍是選擇（看圖決定買賣／判斷形態）
 */
export type QuestionType = 'mcq' | 'input' | 'chart';

/** K 線圖型（由 seed 決定論式生成，同一 seed 必定長一樣） */
export type ChartPattern =
  | 'uptrend'
  | 'downtrend'
  | 'range'
  | 'breakout'
  | 'false-breakout'
  | 'double-top'
  | 'head-shoulders'
  | 'pullback'
  | 'vol-spike';

/** 題幹附圖規格 */
export interface ChartSpec {
  /** 決定論式生成的種子 */
  seed: number;
  /** 圖型 */
  pattern: ChartPattern;
  /** K 棒數（預設 60） */
  bars?: number;
  /** 起始價（預設 500） */
  startPrice?: number;
  /** 疊加均線週期（如 20 → 20MA） */
  ma?: number;
}

export interface QuizQuestion {
  q: string;
  choices: string[];
  /** mcq/chart：正確選項索引；input：未使用（設 -1） */
  answer: number;
  explain: string;
  /** 缺省視為 'mcq'（相容舊題庫） */
  type?: QuestionType;
  /** input 題：可接受答案（比對前會正規化：全形轉半形、去逗號空白） */
  accept?: string[];
  /** input 題：數值容差（絕對值；0 則要求完全相符） */
  tolerance?: number;
  /** input 題：輸入框右側單位（如「元」「股」「天」） */
  unit?: string;
  /** input 題：給學員的提示 */
  hint?: string;
  /** chart 題：K 線圖 */
  chart?: ChartSpec;
}

export interface Lesson {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  kind: QuestionKind;
  summary: string;
  takeaway: string;
  questions: QuizQuestion[];
  isBoss?: boolean;
}

export interface Section {
  id: string;
  code: string;
  title: string;
  subtitle: string;
  color: string;
  badge: string;
  lessons: Lesson[];
}

/** 題目鑰匙（lessonId#題號），用來追蹤錯題出現次數 */
export type QuestionKey = string;

/** 複習題庫的一題（含出處，方便複習時回顧章節） */
export interface ReviewQuestion {
  key: QuestionKey;
  question: QuizQuestion;
  lessonId: string;
  lessonTitle: string;
  sectionTitle: string;
  sectionCode: string;
  sectionColor: string;
  /** 歷史答錯次數（越高越優先出題） */
  missCount: number;
}

export interface LessonProgressEntry {
  stars: number;
  completed: boolean;
  /** true = 以「跳關」越過此關，未實際作答 */
  skipped?: boolean;
}

export type LessonProgress = Record<string, LessonProgressEntry>;

/* ── Legacy shapes kept for journal / badges tabs ── */

export interface TradeDecision {
  id: string;
  ticker: string;
  tickerName: string;
  date: string;
  action: '買進試單' | '逢高獲利' | '嚴格停損' | '空手觀望';
  rationale: string;
  disciplineFollowed: boolean;
  strategyTag: string;
  outcome: '符合預期' | '正常回檔' | '觸發停損' | '待觀察';
  emotions: '冷靜理性' | '略有猶豫' | '克服FOMO';
  gainOrDisciplineScore: string;
}

export interface BehavioralBadge {
  id: string;
  icon: string;
  name: string;
  description: string;
  unlocked: boolean;
  progress: number;
  maxProgress: number;
  tag: string;
}

export interface DailyTask {
  id: string;
  label: string;
  done: number;
  target: number;
}

export interface DailyState {
  date: string;
  tasks: DailyTask[];
}
