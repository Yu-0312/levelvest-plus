import { Lesson, QuizQuestion } from '../../types';

export const q = (
  question: string,
  choices: string[],
  answer: number,
  explain: string
): QuizQuestion => ({ q: question, choices, answer, explain });

export const lesson = (
  code: string,
  title: string,
  subtitle: string,
  kind: Lesson['kind'],
  summary: string,
  takeaway: string,
  questions: QuizQuestion[],
  isBoss = false
): Lesson => ({
  id: code.toLowerCase().replace(/\./g, '-'),
  code,
  title,
  subtitle,
  kind,
  summary,
  takeaway,
  questions,
  isBoss,
});
