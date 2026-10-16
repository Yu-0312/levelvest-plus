/* 一次性重構腳本：把 curriculumPart1/2 拆成 src/data/lessons/s1.ts … s10.ts */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, 'src/data/lessons');
fs.mkdirSync(OUT, { recursive: true });

const HELPERS = `import { Lesson, QuizQuestion, Section } from '../../types';

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
  id: code.toLowerCase().replace(/\\./g, '-'),
  code,
  title,
  subtitle,
  kind,
  summary,
  takeaway,
  questions,
  isBoss,
});
`;
fs.writeFileSync(path.join(OUT, 'helpers.ts'), HELPERS);

function extractSections(file) {
  const src = fs.readFileSync(file, 'utf8');
  const blocks = {};
  // 找 `const sN: Section = {` 到下一個頂格 `};`
  const re = /const (s\d+): Section = \{/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index;
    let depth = 0;
    let i = src.indexOf('{', start);
    let end = -1;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) {
          end = src.indexOf(';', i);
          break;
        }
      }
    }
    blocks[m[1]] = src.slice(start, end + 1);
  }
  return blocks;
}

const all = {
  ...extractSections(path.join(ROOT, 'src/data/curriculumPart1.ts')),
  ...extractSections(path.join(ROOT, 'src/data/curriculumPart2.ts')),
};

for (let n = 1; n <= 10; n++) {
  const name = `s${n}`;
  const block = all[name];
  if (!block) throw new Error(`missing ${name}`);
  const body = block.replace(/^const s\d+: Section = /, 'export const ' + name + ': Section = ');
  const content =
    `/* S${n} 關卡資料（由重構腳本自動產生；題目擴充請直接編輯此檔） */\n` +
    `import { Section } from '../../types';\n` +
    `import { q, lesson } from './helpers';\n\n` +
    body +
    `\n`;
  fs.writeFileSync(path.join(OUT, `${name}.ts`), content);
  console.log(`${name}.ts`, content.length, 'bytes');
}

console.log('done');
