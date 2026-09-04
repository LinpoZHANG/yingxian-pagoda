/**
 * ui/panels.js —— 信息面板(构件卡 / 帮助 / 来源)
 * ─────────────────────────────────────────────────────────────
 * 构件信息卡(picking 触发)、操作帮助与资料来源浮层。
 * 文案一律取自 data/narrative,本文件零硬编码文本。
 */

import { Vector3 } from 'three';
import { getPartInfo, HELP, CREDITS } from '../data/narrative.js';

const FLOOR_PLAN_ICONS = {
  1: { altar: 'round', dots: [[21, 22, 7, 'main']] },
  2: { altar: 'square', dots: [[21, 16, 4.5, 'main'], [13, 15, 2.8], [29, 15, 2.8], [14, 28, 3.3], [28, 28, 3.3]] },
  3: { altar: 'oct', dots: [[21, 10.5, 3.6, 'main'], [31.5, 21, 3.6, 'main'], [21, 31.5, 3.6, 'main'], [10.5, 21, 3.6, 'main']] },
  4: { altar: 'square', dots: [[21, 15, 4.5, 'main'], [13, 14, 2.4], [29, 14, 2.4], [14, 27, 3], [28, 27, 3], [8, 25, 1.8, 'attendant'], [34, 25, 1.8, 'attendant']] },
  5: { altar: 'square', dots: [[21, 21, 4.4, 'main'], [21, 9.5, 2.2], [32.5, 21, 2.2], [21, 32.5, 2.2], [9.5, 21, 2.2], [29, 13, 2.2], [29, 29, 2.2], [13, 29, 2.2], [13, 13, 2.2]] },
};

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  return n;
};
const svgText = (attrs, text) => {
  const n = svgEl('text', attrs);
  n.textContent = text;
  return n;
};

function renderFloorPlanIcon(floor) {
  const data = FLOOR_PLAN_ICONS[floor] ?? FLOOR_PLAN_ICONS[1];
  const wrap = el('span', 'statue-floor-plan');
  const svg = svgEl('svg', { viewBox: '0 0 42 42', 'aria-hidden': 'true' });
  if (data.altar === 'round') {
    svg.append(svgEl('circle', { cx: 21, cy: 21, r: 15, class: 'plan-altar' }));
  } else if (data.altar === 'oct') {
    svg.append(svgEl('polygon', { points: '21,5 32,10 37,21 32,32 21,37 10,32 5,21 10,10', class: 'plan-altar' }));
  } else {
    svg.append(svgEl('rect', { x: 8, y: 8, width: 26, height: 26, class: 'plan-altar' }));
  }
  svg.append(
    svgEl('line', { x1: 21, y1: 5, x2: 21, y2: 37, class: 'plan-axis' }),
    svgEl('line', { x1: 5, y1: 21, x2: 37, y2: 21, class: 'plan-axis' }),
  );
  for (const [x, y, r, kind = 'side'] of data.dots) {
    svg.append(svgEl('circle', { cx: x, cy: y, r, class: `plan-dot ${kind}` }));
  }
  wrap.append(svg);
  return wrap;
}

function renderStatueVisual(visual) {
  if (!visual) return null;
  const figure = el('figure', 'statue-visual');
  const svg = svgEl('svg', { viewBox: '0 0 100 100', role: 'img', 'aria-label': visual.caption ?? '造像布局示意' });

  if (visual.levels) {
    const y0 = 16;
    visual.levels.forEach((item, i) => {
      const y = y0 + i * 16;
      svg.append(svgEl('line', { x1: 18, y1: y, x2: 82, y2: y, class: 'level-line' }));
      svg.append(svgText({ x: 10, y: y + 3, class: 'floor-label' }, item.label));
      svg.append(svgText({ x: 86, y: y + 3, class: 'count-label' }, `${item.count}尊`));
      for (let j = 0; j < item.count; j++) {
        const x = 50 + (j - (item.count - 1) / 2) * 5.4;
        svg.append(svgEl('circle', { cx: x, cy: y - 1, r: j === 0 ? 2.4 : 1.8, class: j === 0 ? 'dot main' : 'dot side' }));
      }
    });
  } else {
    const altar = visual.altar === 'oct'
      ? '50,16 74,26 84,50 74,74 50,84 26,74 16,50 26,26'
      : visual.altar === 'round'
        ? null
        : '24,24 76,24 76,76 24,76';
    if (visual.altar === 'round') {
      svg.append(svgEl('circle', { cx: 50, cy: 50, r: 33, class: 'altar' }));
    } else {
      svg.append(svgEl('polygon', { points: altar, class: 'altar' }));
    }
    svg.append(svgEl('line', { x1: 50, y1: 8, x2: 50, y2: 92, class: 'axis' }));
    svg.append(svgEl('line', { x1: 8, y1: 50, x2: 92, y2: 50, class: 'axis' }));
    for (const p of visual.points ?? []) {
      svg.append(svgEl('circle', { cx: p.x, cy: p.y, r: p.r, class: `dot ${p.kind ?? 'side'}` }));
      svg.append(svgText({ x: p.x, y: p.y + p.r + 7, class: 'point-label' }, p.label));
    }
  }

  figure.append(svg);
  if (visual.caption) figure.append(el('figcaption', null, visual.caption));
  return figure;
}

function renderStatueImages(images = [], onOpen = null) {
  if (!images.length) return null;
  const gallery = el('div', 'statue-image-grid');
  for (const image of images) {
    const figure = el('figure', 'statue-image');
    const img = document.createElement('img');
    img.src = image.src;
    img.alt = image.alt ?? image.caption ?? '佛像参考图';
    img.loading = 'lazy';
    if (onOpen) {
      img.tabIndex = 0;
      img.addEventListener('click', () => onOpen(image));
      img.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(image);
        }
      });
    }
    figure.append(img);
    if (image.caption) figure.append(el('figcaption', null, image.caption));
    gallery.append(figure);
  }
  return gallery;
}

function renderFloorSections(sections = [], registry = null, {
  expandedFloors = new Set(),
  onToggle = null,
  onImageOpen = null,
} = {}) {
  if (!sections.length) return null;
  const compact = sections.length > 1;
  const displaySections = compact
    ? [...sections].sort((a, b) => b.floor - a.floor)
    : sections;
  const wrap = el('div', compact ? 'statue-floor-sections is-compact' : 'statue-floor-sections');
  for (const section of displaySections) {
    const selected = expandedFloors.has(section.floor);
    const expanded = !compact || selected;
    const article = el('article', 'statue-floor-card');
    article.dataset.floor = String(section.floor);
    article.toggleAttribute('data-expanded', expanded);
    article.toggleAttribute('data-selected', selected);
    const head = document.createElement('button');
    head.type = 'button';
    head.className = 'statue-floor-head';
    head.title = `查看第 ${section.floor} 层造像详情`;
    head.setAttribute('aria-expanded', String(compact ? selected : expanded));
    head.setAttribute('aria-label', `查看第 ${section.floor} 层造像详情:${section.title}`);
    if (compact) {
      const index = el('span', 'statue-floor-index', String(section.floor).padStart(2, '0'));
      const copy = el('span', 'statue-floor-copy');
      copy.append(el('h4', null, section.title));
      if (section.subtitle) copy.append(el('em', null, section.subtitle));
      head.append(renderFloorPlanIcon(section.floor), index, copy);
    } else {
      head.append(el('b', null, `${section.floor}层`), el('h4', null, section.title), el('span', 'statue-floor-toggle', expanded ? '收起' : '展开'));
    }
    head.addEventListener('click', () => onToggle?.(section.floor, section));
    article.append(head);
    if (!compact && section.subtitle) article.append(el('p', 'statue-floor-subtitle', section.subtitle));
    if (!compact && expanded) {
      const detail = el('div', 'statue-floor-detail');
      const images = renderStatueImages(section.images ?? [], onImageOpen);
      if (images) detail.append(images);
      detail.append(el('p', 'statue-floor-text', section.text));
      if (section.note) detail.append(el('p', 'statue-floor-note', section.note));
      if (section.facts?.length) {
        const facts = el('dl', 'statue-floor-facts');
        for (const [k, v] of section.facts) {
          const row = el('div');
          row.append(el('dt', null, k), el('dd', null, v));
          facts.append(row);
        }
        detail.append(facts);
      }
      article.append(detail);
    }
    registry?.set(section.floor, article);
    wrap.append(article);
  }
  return wrap;
}

function renderStatueDetail(section, onImageOpen = null) {
  const fragment = document.createDocumentFragment();
  const title = el('h3', null, section.title);
  title.append(el('span', 'role', '楼层详情'));
  fragment.append(title);
  if (section.subtitle) fragment.append(el('p', 'statue-floor-subtitle', section.subtitle));
  const images = renderStatueImages(section.images ?? [], onImageOpen);
  if (images) fragment.append(images);
  fragment.append(el('p', 'statue-floor-text', section.text));
  if (section.note) fragment.append(el('p', 'statue-floor-note', section.note));
  if (section.facts?.length) {
    const facts = el('dl', 'statue-floor-facts');
    for (const [k, v] of section.facts) {
      const row = el('div');
      row.append(el('dt', null, k), el('dd', null, v));
      facts.append(row);
    }
    fragment.append(facts);
  }
  return fragment;
}

export function createPanels(mount) {
  /* ── 构件信息卡 ────────────────────────────────────────── */
  const card = el('aside', 'hud-part');
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');
  const close = el('button', null, '×');
  close.setAttribute('aria-label', '关闭构件说明');
  const h3 = el('h3');
  const role = el('span', 'role');
  h3.append(role);
  const visualSlot = el('div', 'part-visual-slot');
  const sectionSlot = el('div', 'part-section-slot');
  const p = el('p');
  const facts = el('dl', 'part-facts');
  const source = el('p', 'source');
  card.append(close, h3, visualSlot, p, sectionSlot, facts, source);
  mount.append(card);

  const statueDetail = el('aside', 'hud-part statue-detail-card');
  statueDetail.dataset.kind = 'statueDetail';
  const detailClose = el('button', null, '×');
  detailClose.setAttribute('aria-label', '关闭佛像楼层详情');
  const detailBody = el('div', 'statue-detail-body');
  statueDetail.append(detailClose, detailBody);
  mount.append(statueDetail);

  const imageLightbox = el('div', 'image-lightbox');
  imageLightbox.setAttribute('role', 'dialog');
  imageLightbox.setAttribute('aria-modal', 'true');
  const lightboxInner = el('figure', 'image-lightbox-inner');
  const lightboxImg = document.createElement('img');
  const lightboxCaption = el('figcaption');
  const lightboxClose = el('button', 'image-lightbox-close', '×');
  lightboxClose.setAttribute('aria-label', '关闭大图');
  lightboxInner.append(lightboxImg, lightboxCaption, lightboxClose);
  imageLightbox.append(lightboxInner);
  mount.append(imageLightbox);

  const statueSectionNodes = new Map();
  const expandedStatueFloors = new Set();
  const statueFloorSelectListeners = new Set();
  let lastInfo = null;

  function openImageLightbox(image) {
    lightboxImg.src = image.src;
    lightboxImg.alt = image.alt ?? image.caption ?? '佛像参考图';
    lightboxCaption.textContent = image.caption ?? image.alt ?? '';
    imageLightbox.setAttribute('data-open', '');
    lightboxClose.focus();
  }

  function closeImageLightbox() {
    imageLightbox.removeAttribute('data-open');
  }

  function showStatueDetail(section) {
    detailBody.replaceChildren(renderStatueDetail(section, openImageLightbox));
    statueDetail.setAttribute('data-open', '');
  }

  function hideStatueDetail() {
    statueDetail.removeAttribute('data-open');
    detailBody.replaceChildren();
  }

  function openStatueFloor(floor, { notify = true } = {}) {
    const section = lastInfo?.sections?.find((item) => item.floor === Number(floor));
    if (!section) return false;
    expandedStatueFloors.clear();
    expandedStatueFloors.add(Number(floor));
    showStatueDetail(section);
    if (notify) for (const fn of statueFloorSelectListeners) fn(Number(floor), section);
    renderStatueSections(lastInfo);
    return true;
  }

  function toggleStatueFloor(floor, section) {
    if (expandedStatueFloors.has(Number(floor))) {
      expandedStatueFloors.delete(floor);
      hideStatueDetail();
    } else {
      expandedStatueFloors.clear();
      expandedStatueFloors.add(Number(floor));
      showStatueDetail(section);
      for (const fn of statueFloorSelectListeners) fn(Number(floor), section);
    }
    renderStatueSections(lastInfo);
  }

  function renderStatueSections(info) {
    if (!info) return;
    sectionSlot.replaceChildren();
    statueSectionNodes.clear();
    const sections = renderFloorSections(info.sections, statueSectionNodes, {
      expandedFloors: expandedStatueFloors,
      onImageOpen: openImageLightbox,
      onToggle: toggleStatueFloor,
    });
    if (sections) sectionSlot.append(sections);
  }

  function showPart(key, meta) {
    const info = getPartInfo(key, meta);
    if (!info) return hidePart();
    lastInfo = info;
    card.dataset.kind = info.kind ?? '';
    h3.firstChild?.remove?.();
    h3.textContent = info.name;
    role.textContent = info.kind === 'statue' ? '' : info.role;
    h3.append(role);
    visualSlot.replaceChildren();
    sectionSlot.replaceChildren();
    statueSectionNodes.clear();
    const hasOverviewSections = (info.sections?.length ?? 0) > 1;
    const hasFocusedSection = !hasOverviewSections && info.sections?.[0];
    expandedStatueFloors.clear();
    if (hasFocusedSection) expandedStatueFloors.add(info.sections[0].floor);
    const visual = renderStatueVisual(info.visual);
    if (visual) visualSlot.append(visual);
    if (hasOverviewSections) renderStatueSections(info);
    else statueSectionNodes.clear();
    if (hasFocusedSection) showStatueDetail(info.sections[0]);
    if (hasOverviewSections) hideStatueDetail();
    // 铺作命中时附带该朵的等级,让「同一文法生成不同斗拱」可被验证
    const grade = meta?.grade?.grade ?? meta?.grade;
    const focusedText = hasFocusedSection
      ? (meta?.id
        ? `当前选中: ${meta.name ?? '造像'}。左侧已展开本层的图文资料、尺度和修复提示。`
        : '左侧已展开本层的图文资料、尺度和修复提示。')
      : (hasOverviewSections
        ? '点击右侧楼层索引或塔内造像,相机会推近到对应楼层,左侧展开该层图文资料。'
        : info.text);
    p.textContent = focusedText + (
      typeof grade === 'string' ? `\n\n此朵:${grade}` : ''
    );
    facts.replaceChildren();
    for (const [k, v] of info.facts ?? []) {
      const row = el('div');
      row.append(el('dt', null, k), el('dd', null, v));
      facts.append(row);
    }
    source.textContent = info.source ? `依据:${info.source}` : '';
    card.setAttribute('data-open', '');
  }
  function hidePart() {
    card.removeAttribute('data-open');
    delete card.dataset.kind;
    statueGuideLayer.removeAttribute('data-open');
    hideStatueDetail();
  }
  close.addEventListener('click', hidePart);
  detailClose.addEventListener('click', () => {
    expandedStatueFloors.clear();
    hideStatueDetail();
    if ((lastInfo?.sections?.length ?? 0) > 1) renderStatueSections(lastInfo);
  });
  lightboxClose.addEventListener('click', closeImageLightbox);
  imageLightbox.addEventListener('click', (event) => {
    if (event.target === imageLightbox) closeImageLightbox();
  });
  imageLightbox.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') closeImageLightbox();
  });

  /* ── 佛像楼层引线 ─────────────────────────────────────── */
  // 引线现在只画楼层标记盘(tick + disc + 编号),不画折线,
  // 故早先那套 <defs><marker id="statue-guide-arrow"> 的箭头定义已无人引用,连同
  // .statue-guide-line/.dot/.label/.arrow 四条样式一并撤掉(第51轮清理)。
  const statueGuideLayer = svgEl('svg', { class: 'hud-statue-guides', 'aria-hidden': 'true' });
  mount.append(statueGuideLayer);
  let statueGuideAnchors = [];
  const guidePoint = new Vector3();
  let statueGuideCacheKey = '';

  function setStatueGuideAnchors(items = []) {
    statueGuideAnchors = items;
    statueGuideCacheKey = '';
  }
  function showStatueGuides(on) {
    statueGuideLayer.toggleAttribute('data-open', Boolean(on));
    statueGuideCacheKey = '';
  }
  function updateStatueGuides(camera, dom) {
    if (!statueGuideLayer.hasAttribute('data-open') || !card.hasAttribute('data-open')) return;
    const w = dom.clientWidth || window.innerWidth;
    const h = dom.clientHeight || window.innerHeight;
    const cardRect = card.getBoundingClientRect();
    const activeFloors = [...expandedStatueFloors].sort((a, b) => a - b).join(',');
    const cacheKey = [
      w, h, Math.round(cardRect.left), Math.round(cardRect.top), Math.round(cardRect.height),
      camera.fov.toFixed(2),
      camera.position.x.toFixed(3), camera.position.y.toFixed(3), camera.position.z.toFixed(3),
      camera.quaternion.x.toFixed(4), camera.quaternion.y.toFixed(4),
      camera.quaternion.z.toFixed(4), camera.quaternion.w.toFixed(4),
      activeFloors,
    ].join('|');
    if (cacheKey === statueGuideCacheKey) return;
    statueGuideCacheKey = cacheKey;

    statueGuideLayer.setAttribute('viewBox', `0 0 ${w} ${h}`);
    statueGuideLayer.replaceChildren();

    const projectedItems = [];
    for (const item of statueGuideAnchors) {
      const section = statueSectionNodes.get(item.floor);
      if (!section) continue;
      item.anchor.getWorldPosition(guidePoint);
      guidePoint.project(camera);
      if (guidePoint.z > 1) continue;
      const x = (guidePoint.x * 0.5 + 0.5) * w;
      const y = (-guidePoint.y * 0.5 + 0.5) * h;
      if (x < -80 || x > w + 80 || y < -80 || y > h + 80) continue;
      projectedItems.push({ item, section, x, y });
    }
    if (!projectedItems.length) return;

    const maxAnchorX = Math.max(...projectedItems.map((p) => p.x));
    const markerX = Math.min(cardRect.left - 42, Math.max(maxAnchorX + 86, w * 0.61));
    const ordered = projectedItems.sort((a, b) => b.item.floor - a.item.floor);
    const top = Math.max(88, h * 0.15);
    const bottom = Math.min(h - 128, h * 0.82);
    const gap = Math.min(58, Math.max(44, (bottom - top) / Math.max(1, ordered.length - 1)));

    ordered.forEach((entry, index) => {
      const preferredY = Math.min(Math.max(entry.y, top), bottom);
      const y = index === 0
        ? preferredY
        : Math.max(preferredY, Number(ordered[index - 1].__placedY) + gap);
      entry.__placedY = Math.min(y, bottom);
    });
    for (let i = ordered.length - 2; i >= 0; i--) {
      ordered[i].__placedY = Math.min(ordered[i].__placedY, ordered[i + 1].__placedY - gap);
    }

    for (const entry of ordered) {
      const floor = entry.item.floor;
      const y = Math.min(Math.max(entry.__placedY, top), bottom);
      const active = expandedStatueFloors.has(floor);
      const g = svgEl('g', {
        class: 'statue-floor-marker',
        transform: `translate(${markerX.toFixed(1)} ${y.toFixed(1)})`,
        'data-selected': active ? 'true' : 'false',
      });
      g.addEventListener('click', () => toggleStatueFloor(floor, entry.section));
      g.append(
        svgEl('line', { x1: -77, y1: 0, x2: -19, y2: 0, class: 'statue-marker-tick' }),
        svgEl('circle', { cx: 0, cy: 0, r: active ? 17 : 14.5, class: 'statue-marker-disc' }),
        svgText({ x: 0, y: 4.5, class: 'statue-marker-text' }, String(floor).padStart(2, '0')),
      );
      statueGuideLayer.append(g);
    }
  }

  /* ── 浮层(帮助 / 来源合一)────────────────────────────── */
  const sheet = el('div', 'hud-sheet');
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  const inner = el('div', 'inner');
  sheet.append(inner);

  const helpTitle = el('h2', null, HELP.title);
  const keys = el('dl', 'keys');
  for (const [k, v] of HELP.items) { keys.append(el('dt', null, k), el('dd', null, v)); }

  /* 场景说明:键位之外「它会怎么动」的部分。
   * 文本里的 **…** 作强调,拆成 <b> —— 面板本来就没有 markdown 渲染。 */
  const notes = el('ul', 'scene-notes');
  for (const line of (HELP.notes ?? [])) {
    const li = el('li');
    line.split('**').forEach((seg, i) => {
      if (!seg) return;
      li.append(i % 2 ? el('b', null, seg) : document.createTextNode(seg));
    });
    notes.append(li);
  }

  const credTitle = el('h2', null, CREDITS.title);
  credTitle.style.marginTop = '26px';
  /* 署名放在「资料来源」的开头 —— 评审打开说明第一眼看到的就是它,
   * 紧接着才是引用清单,两者的边界因此一目了然。 */
  const author = el('p', 'author');
  author.append(el('b', null, CREDITS.author));
  if (CREDITS.authorNote) {
    author.append(document.createElement('br'), document.createTextNode(CREDITS.authorNote));
  }
  const list = el('ul');
  for (const item of CREDITS.items) list.append(el('li', null, item));
  const tags = el('div', 'tags');
  for (const [tag, desc] of CREDITS.sourceTags) {
    const s = el('span');
    s.append(el('b', null, `[${tag}]`), document.createTextNode(desc));
    tags.append(s);
  }
  const note = el('p', 'note', CREDITS.note);
  const closeBtn = el('button', 'close', '关闭');

  inner.append(helpTitle, keys, notes, credTitle, author, list, tags, note, closeBtn);
  mount.append(sheet);

  function showHelp() {
    sheet.setAttribute('data-open', '');
    /* preventScroll 是必需的:焦点落在底部的「关闭」键上,浏览器会把它滚进视野,
     * 于是面板一打开就停在最底下 —— 内容越长越明显。 */
    closeBtn.focus({ preventScroll: true });
    inner.scrollTop = 0;
  }
  function hideHelp() { sheet.removeAttribute('data-open'); }
  closeBtn.addEventListener('click', hideHelp);
  sheet.addEventListener('click', (e) => { if (e.target === sheet) hideHelp(); });
  sheet.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideHelp(); });

  /* ── 斗拱特写的构件标注 ────────────────────────────────────
   * 三维锚点每帧投影到屏幕,标注跟着构件走(分解动画中不脱节)。
   * 只标主干七类,并按屏幕纵向做最小间距去重,避免糊成一片。 */
  const labelLayer = el('div', 'hud-labels');
  mount.append(labelLayer);
  let labelItems = [];
  const projected = new Vector3();

  function setLabels(items) {
    labelItems = items.map((it) => {
      const node = el('div', 'hud-label');
      node.append(el('i'), el('span', null, it.label), el('em', null, it.role));
      labelLayer.append(node);
      return { ...it, node };
    });
  }
  function clearLabels() {
    for (const it of labelItems) it.node.remove();
    labelItems = [];
  }
  function updateLabels(camera, dom) {
    if (!labelItems.length) return;
    const w = dom.clientWidth, h = dom.clientHeight;
    const placed = [];
    // 由近及远排布,近的优先占位
    const rows = labelItems.map((it) => {
      it.mesh.getWorldPosition(projected);
      const depth = projected.distanceTo(camera.position);
      projected.project(camera);
      return { it, x: (projected.x * 0.5 + 0.5) * w, y: (-projected.y * 0.5 + 0.5) * h,
               visible: projected.z < 1, depth };
    }).sort((a, b) => a.depth - b.depth);

    for (const r of rows) {
      const clash = placed.some((q) => Math.abs(q.y - r.y) < 22 && Math.abs(q.x - r.x) < 150);
      const show = r.visible && !clash && r.x > 0 && r.x < w && r.y > 0 && r.y < h;
      r.it.node.style.display = show ? '' : 'none';
      if (!show) continue;
      r.it.node.style.transform = `translate(${r.x}px, ${r.y}px)`;
      placed.push(r);
    }
  }
  function showLabels(on) { labelLayer.toggleAttribute('data-open', on); }

  /* ── 神游建造的工匠视角入口 ─────────────────────────────── */
  const craftBtn = el('button', 'hud-craft-entry');
  craftBtn.type = 'button';
  craftBtn.textContent = '点击进入工匠视角';
  craftBtn.title = '进入塔内建造视角';
  mount.append(craftBtn);
  let craftAnchor = null;
  let craftVisible = false;
  const craftListeners = new Set();

  craftBtn.addEventListener('click', () => {
    for (const fn of craftListeners) fn();
  });

  function setCraftEntryAnchor(anchor) {
    craftAnchor = anchor;
  }

  function showCraftEntry(on) {
    craftVisible = !!on;
    craftBtn.toggleAttribute('data-open', craftVisible);
  }

  function updateCraftEntry(camera, dom) {
    if (!craftVisible || !craftAnchor) return;
    const w = dom.clientWidth, h = dom.clientHeight;
    projected.copy(craftAnchor).project(camera);
    const x = (projected.x * 0.5 + 0.5) * w;
    const y = (-projected.y * 0.5 + 0.5) * h;
    const visible = projected.z < 1 && x > 0 && x < w && y > 0 && y < h;
    craftBtn.style.display = visible ? '' : 'none';
    if (visible) craftBtn.style.transform = `translate(${x}px, ${y}px)`;
  }

  return {
    showPart, hidePart, showHelp, hideHelp,
    setLabels, clearLabels, updateLabels, showLabels,
    setCraftEntryAnchor, updateCraftEntry, showCraftEntry,
    setStatueGuideAnchors, updateStatueGuides, showStatueGuides,
    openStatueFloor,
    onCraftEntry(fn) {
      craftListeners.add(fn);
      return () => craftListeners.delete(fn);
    },
    onStatueFloorSelect(fn) {
      statueFloorSelectListeners.add(fn);
      return () => statueFloorSelectListeners.delete(fn);
    },
    get helpOpen() { return sheet.hasAttribute('data-open'); },
    toggleHelp() { return sheet.hasAttribute('data-open') ? hideHelp() : showHelp(); },
  };
}
