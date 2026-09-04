/**
 * ui/hud.js —— HUD 骨架(标题 / 导航 / 状态控制)
 * ─────────────────────────────────────────────────────────────
 * 挂载到 #hud:竖排题字、右侧叙事面板、逐层导航、底部功能条。
 * 全部按钮只发状态机指令,不碰场景。文案取自 data/narrative。
 */

import { TITLE, STOREY_NOTES, STATE_LABELS } from '../data/narrative.js';
// 季节的标签/提示放在季节模块自己那儿,不挤 data/narrative.js
import { SEASON_CYCLE, SEASON_UI } from '../scene/seasons/SeasonConfig.js';

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const LEVEL_CN = ['全景', '一', '二', '三', '四', '五'];

export function createHUD(states, mount) {
  /* ── 竖排题字 ──────────────────────────────────────────── */
  const title = el('header', 'hud-title');
  const h1 = el('h1', null, TITLE.name);
  const meta = el('div', 'meta');
  meta.append(document.createTextNode(TITLE.formal + '　'), el('b', null, TITLE.era));
  title.append(h1, meta);
  mount.append(title);

  /* ── 叙事面板 ──────────────────────────────────────────── */
  const panel = el('section', 'hud-panel');
  panel.setAttribute('aria-live', 'polite');
  const pTitle = el('h2');
  const pLead = el('p', 'lead');
  const pBody = el('p', 'body');
  const pFacts = el('dl', 'facts');
  panel.append(pTitle, pLead, pBody, pFacts);
  mount.append(panel);

  function setNarrative(key) {
    const n = STOREY_NOTES[key] ?? STOREY_NOTES.all;
    pTitle.textContent = n.title;
    pLead.textContent = n.lead;
    pBody.textContent = n.body;
    pFacts.replaceChildren();
    for (const [k, v] of n.facts) {
      const row = el('div');
      row.append(el('dt', null, k), el('dd', null, v));
      pFacts.append(row);
    }
  }

  /* ── 底部功能条 ────────────────────────────────────────── */
  const bar = el('nav', 'hud-bar');
  bar.setAttribute('aria-label', '场景控制');

  const levelBtns = LEVEL_CN.map((label, i) => {
    const b = el('button', null, label);
    b.setAttribute('aria-current', 'false');
    b.title = i === 0 ? '回到全景' : `第${label}层`;
    b.addEventListener('click', () => {
      // 分解态下选层不退出分解,而是聚焦该结构层
      const inExploded = states.get().mode === 'exploded';
      states.set(i === 0
        ? { mode: inExploded ? 'exploded' : 'free', level: 'all' }
        : { mode: inExploded ? 'exploded' : 'storey', level: i });
    });
    return b;
  });
  bar.append(...levelBtns, el('div', 'sep'));

  const toggles = [
    ['cruise', STATE_LABELS.mode.cruise.label],
    ['exploded', STATE_LABELS.mode.exploded.label],
    ['buildtour', STATE_LABELS.mode.buildtour.label],
    ['bracket', STATE_LABELS.mode.bracket.label],
    ['statue', STATE_LABELS.mode.statue.label],
  ].map(([mode, label]) => {
    const b = el('button', null, label);
    b.setAttribute('aria-pressed', 'false');
    b.addEventListener('click', () => {
      if (mode === 'exploded') {
        const s = states.get();
        states.set({
          mode: 'exploded',
          level: 'all',
          pick: null,
          viewTick: (s.viewTick ?? 0) + 1,
        });
        return;
      }
      states.toggleMode(mode);
    });
    return b;
  });
  bar.append(...toggles);

  /* ── 古今面貌 ──────────────────────────────────────────────
   * 一枚键,点一次换一个年代。第40轮由「古貌 / 今貌」两枚互斥单选改成这样 ——
   * 底栏其余功能键都是「点一下切换」,单独这一组做成单选,反而要用户先分辨
   * 它是另一种控件。按下态 = 古貌(非现状),当前年代由提示行报出。
   * 资料源 reference/FacadeHistory。 */
  const eraBtn = el('button', null, STATE_LABELS.era.title);
  eraBtn.setAttribute('aria-pressed', 'false');
  eraBtn.addEventListener('click', () => states.toggleEra());
  bar.append(el('div', 'sep'), eraBtn);

  /* ── 春夏秋冬 ──────────────────────────────────────────────
   * 与「古今面貌」同一形状:一枚键,点一次换一个。
   * 循环是 四季(自动) → 春 → 夏 → 秋 → 冬 → 四季,
   * 「自动」留在环里,用户点满一圈就能回到随巡航轮换,
   * 不必靠切模式才退得出手动态。 */
  const seasonBtn = el('button', null, SEASON_UI.auto.label);
  seasonBtn.setAttribute('aria-pressed', 'false');
  seasonBtn.addEventListener('click', () => states.cycleSeason(SEASON_CYCLE));
  bar.append(el('div', 'sep'), seasonBtn);

  const timeBtn = el('button', null, STATE_LABELS.time.day.label);
  timeBtn.addEventListener('click', () => states.toggleTime());
  const helpBtn = el('button', null, '说明');
  bar.append(el('div', 'sep'), timeBtn, helpBtn);
  mount.append(bar);

  /* ── 提示行 ────────────────────────────────────────────── */
  const hint = el('p', 'hud-hint');
  mount.append(hint);

  /* ── 订阅状态机:UI 只反映状态,不自行决定 ─────────────── */
  let eraJustSet = false;
  let eraHintTimer = 0;
  let seasonJustSet = false;
  let seasonHintTimer = 0;

  function render(s) {
    mount.dataset.mode = s.mode;
    const levelActive = s.mode === 'storey' || s.mode === 'exploded';
    levelBtns.forEach((b, i) => {
      const on = i === 0 ? s.level === 'all' : (levelActive && s.level === i);
      b.setAttribute('aria-current', String(on));
    });
    toggles[0].setAttribute('aria-pressed', String(s.mode === 'cruise'));
    toggles[1].setAttribute('aria-pressed', String(s.mode === 'exploded'));
    toggles[2].setAttribute('aria-pressed', String(s.mode === 'buildtour'));
    toggles[3].setAttribute('aria-pressed', String(s.mode === 'bracket'));
    toggles[4].setAttribute('aria-pressed', String(s.mode === 'statue'));
    eraBtn.setAttribute('aria-pressed', String(s.era === 'ancient'));
    eraBtn.title = STATE_LABELS.era[s.era].hint;
    mount.dataset.era = s.era;
    mount.dataset.time = s.time;   // 题字按昼夜换深浅,亮背景用深字、夜景用浅字
    const su = SEASON_UI[s.season] ?? SEASON_UI.auto;
    seasonBtn.textContent = su.label;
    seasonBtn.title = su.hint;
    // 按下态 = 手动冻结在某一季(非自动),与 era 键的读法一致
    seasonBtn.setAttribute('aria-pressed', String(s.season !== 'auto'));
    mount.dataset.season = s.season;
    timeBtn.textContent = STATE_LABELS.time[s.time].label;
    timeBtn.title = STATE_LABELS.time[s.time].hint;
    // 刚切完年代的一瞬,提示行让位给年代说明 —— 这是这次点击的回执
    hint.textContent = (eraJustSet ? STATE_LABELS.era[s.era]?.hint : null)
      ?? (seasonJustSet ? su.hint : null)
      ?? STATE_LABELS.mode[s.mode]?.hint ?? '';
    setNarrative(levelActive && s.level !== 'all' ? s.level : 'all');
    // 专题模式使用自己的信息卡,首屏叙事面板退场。
    panel.toggleAttribute('data-dim', s.mode === 'exploded' || s.mode === 'bracket' || s.mode === 'statue');
  }
  states.onChange((s, patch, prev) => {
    if (s.season !== prev?.season) {
      seasonJustSet = true;
      clearTimeout(seasonHintTimer);
      seasonHintTimer = setTimeout(() => { seasonJustSet = false; render(states.get()); }, 3000);
    }
    if (s.era !== prev?.era) {
      eraJustSet = true;
      clearTimeout(eraHintTimer);
      // 过渡走 2 s,提示行比它多留一拍再交还给模式提示
      eraHintTimer = setTimeout(() => { eraJustSet = false; render(states.get()); }, 3600);
    }
    render(s);
  });
  render(states.get());

  return {
    root: mount,
    setNarrative,
    onHelp(fn) { helpBtn.addEventListener('click', fn); },
    setHint(text) { hint.textContent = text; },
  };
}
