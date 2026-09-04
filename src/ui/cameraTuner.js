/**
 * ui/cameraTuner.js —— 开发期相机调试面板
 * ─────────────────────────────────────────────────────────────
 * 只负责读写 PerspectiveCamera 与 OrbitControls.target,不参与场景/模型语义。
 */

const fmt = (n) => Number(n).toFixed(3).replace(/\.?0+$/, '');
const ratio = (n, H) => Number(n / H).toFixed(3).replace(/\.?0+$/, '');

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

function makeField({ label, min, max, step, value, onInput }) {
  const row = el('label', 'camera-tuner-row');
  const name = el('span', 'camera-tuner-label', label);
  const range = document.createElement('input');
  range.type = 'range';
  range.min = String(min);
  range.max = String(max);
  range.step = String(step);
  const number = document.createElement('input');
  number.type = 'number';
  number.min = String(min);
  number.max = String(max);
  number.step = String(step);

  function set(v, silent = false) {
    const next = Math.min(max, Math.max(min, Number(v)));
    range.value = String(next);
    number.value = String(Number(next.toFixed(3)));
    if (!silent) onInput(next);
  }

  range.addEventListener('input', () => set(range.value));
  number.addEventListener('input', () => set(number.value));
  set(value, true);
  row.append(name, range, number);
  return { row, set, get value() { return Number(number.value); } };
}

export function createCameraTuner({
  mount,
  camera,
  controls,
  rig,
  totalHeight,
  initialOpen = false,
  slots = [],
}) {
  const H = totalHeight;
  const root = el('aside', 'camera-tuner');
  root.hidden = !initialOpen;
  root.toggleAttribute('data-open', initialOpen);

  const header = el('div', 'camera-tuner-head');
  header.append(el('h2', null, '相机调试'));
  const close = el('button', 'camera-tuner-icon', '×');
  close.type = 'button';
  close.title = '隐藏相机调试面板';
  header.append(close);

  const slotBar = el('div', 'camera-tuner-slots');
  const slotTitle = el('span', null, '佛像位点');
  const slotButtons = new Map();
  slotBar.append(slotTitle);
  for (const slot of slots) {
    const button = el('button', null, slot.label);
    button.type = 'button';
    button.addEventListener('click', () => selectSlot(slot.id));
    slotButtons.set(slot.id, button);
    slotBar.append(button);
  }
  if (!slots.length) slotBar.hidden = true;

  const grid = el('div', 'camera-tuner-grid');
  const output = document.createElement('textarea');
  output.className = 'camera-tuner-output';
  output.readOnly = true;
  output.rows = slots.length ? 18 : 7;

  const status = el('p', 'camera-tuner-status', '');
  const actions = el('div', 'camera-tuner-actions');
  const syncBtn = el('button', null, '读取当前');
  const recordBtn = el('button', null, '记录到位点');
  const presetBtn = el('button', null, '回到预设');
  const copyBtn = el('button', null, '复制参数');
  syncBtn.type = recordBtn.type = presetBtn.type = copyBtn.type = 'button';
  recordBtn.disabled = !slots.length;
  actions.append(syncBtn, recordBtn, presetBtn, copyBtn);

  root.append(header, slotBar, grid, output, actions, status);
  mount.append(root);

  const preset = {
    px: camera.position.x,
    py: camera.position.y,
    pz: camera.position.z,
    tx: controls.target.x,
    ty: controls.target.y,
    tz: controls.target.z,
    fov: camera.fov,
  };

  const values = { ...preset };
  const slotValues = new Map();
  let selectedSlotId = null;
  let applying = false;

  function setValue(key, value) {
    values[key] = value;
    apply();
  }

  const fields = {
    px: makeField({ label: '相机 X', min: -H * 1.8, max: H * 1.8, step: 0.1, value: values.px, onInput: (v) => setValue('px', v) }),
    py: makeField({ label: '相机 Y', min: H * 0.1, max: H * 1.45, step: 0.1, value: values.py, onInput: (v) => setValue('py', v) }),
    pz: makeField({ label: '相机 Z', min: -H * 1.8, max: H * 1.8, step: 0.1, value: values.pz, onInput: (v) => setValue('pz', v) }),
    tx: makeField({ label: '目标 X', min: -H * 0.35, max: H * 0.35, step: 0.1, value: values.tx, onInput: (v) => setValue('tx', v) }),
    ty: makeField({ label: '目标 Y', min: 0, max: H, step: 0.1, value: values.ty, onInput: (v) => setValue('ty', v) }),
    tz: makeField({ label: '目标 Z', min: -H * 0.35, max: H * 0.35, step: 0.1, value: values.tz, onInput: (v) => setValue('tz', v) }),
    fov: makeField({ label: 'FOV', min: 18, max: 65, step: 0.5, value: values.fov, onInput: (v) => setValue('fov', v) }),
  };

  grid.append(
    fields.px.row, fields.py.row, fields.pz.row,
    fields.tx.row, fields.ty.row, fields.tz.row,
    fields.fov.row,
  );

  function valueSnippet(v) {
    return [
      `target: new Vector3(H * ${ratio(v.tx, H)}, H * ${ratio(v.ty, H)}, H * ${ratio(v.tz, H)}),`,
      `position: new Vector3(H * ${ratio(v.px, H)}, H * ${ratio(v.py, H)}, H * ${ratio(v.pz, H)}),`,
      `fov: ${fmt(v.fov)},`,
      `// meters position(${fmt(v.px)}, ${fmt(v.py)}, ${fmt(v.pz)}) target(${fmt(v.tx)}, ${fmt(v.ty)}, ${fmt(v.tz)})`,
    ];
  }

  function valuesForSlot(slot) {
    if (slotValues.has(slot.id)) return slotValues.get(slot.id);
    return null;
  }

  function payload() {
    if (slots.length) {
      const lines = ['// 佛像五层镜头位点参数', 'const STATUE_FLOOR_VIEWS = {'];
      for (const slot of slots) {
        const v = valuesForSlot(slot);
        if (!v) {
          lines.push(`  // ${slot.floor}: 未记录`);
          continue;
        }
        lines.push(`  ${slot.floor}: {`);
        for (const line of valueSnippet(v)) lines.push(`    ${line}`);
        lines.push('  },');
      }
      lines.push('};');
      if (selectedSlotId) {
        const slot = slots.find((item) => item.id === selectedSlotId);
        const v = slot ? valuesForSlot(slot) : values;
        lines.push('', `// 当前选中:${slot?.label ?? selectedSlotId}`);
        if (v) lines.push(...valueSnippet(v).map((line) => `// ${line}`));
        else lines.push('// 未记录:请调好相机后点击“记录到位点”。');
      }
      return lines.join('\n');
    }
    return [
      '// 佛像剖透视相机参数',
      `const target = new Vector3(H * ${ratio(values.tx, H)}, H * ${ratio(values.ty, H)}, H * ${ratio(values.tz, H)});`,
      `const position = new Vector3(H * ${ratio(values.px, H)}, H * ${ratio(values.py, H)}, H * ${ratio(values.pz, H)});`,
      `camera.fov = ${fmt(values.fov)};`,
      '',
      `// meters: position(${fmt(values.px)}, ${fmt(values.py)}, ${fmt(values.pz)}) target(${fmt(values.tx)}, ${fmt(values.ty)}, ${fmt(values.tz)})`,
    ].join('\n');
  }

  function refreshOutput() {
    output.value = payload();
  }

  function setFieldsFromValues() {
    Object.entries(fields).forEach(([key, field]) => field.set(values[key], true));
    refreshOutput();
  }

  function apply() {
    applying = true;
    camera.position.set(values.px, values.py, values.pz);
    camera.fov = values.fov;
    camera.updateProjectionMatrix();
    controls.object.position.copy(camera.position);
    controls.target.set(values.tx, values.ty, values.tz);
    controls.update();
    rig.sync(camera.position, controls.target);
    refreshOutput();
    applying = false;
  }

  function updateSlotButtons() {
    for (const slot of slots) {
      const button = slotButtons.get(slot.id);
      if (!button) continue;
      button.toggleAttribute('data-active', slot.id === selectedSlotId);
      button.toggleAttribute('data-recorded', slotValues.has(slot.id));
    }
    recordBtn.disabled = !selectedSlotId;
  }

  function selectSlot(id) {
    const slot = slots.find((item) => item.id === id);
    if (!slot) return;
    selectedSlotId = id;
    syncFromCamera();
    updateSlotButtons();
    status.textContent = `正在记录${slot.label}:相机不会跳转,请直接调整当前画面。`;
  }

  function recordSelectedSlot() {
    if (!selectedSlotId) return;
    syncFromCamera();
    slotValues.set(selectedSlotId, { ...values });
    updateSlotButtons();
    const slot = slots.find((item) => item.id === selectedSlotId);
    status.textContent = `已记录${slot?.label ?? selectedSlotId}。`;
  }

  function syncFromCamera() {
    if (applying) return;
    values.px = camera.position.x;
    values.py = camera.position.y;
    values.pz = camera.position.z;
    values.tx = controls.target.x;
    values.ty = controls.target.y;
    values.tz = controls.target.z;
    values.fov = camera.fov;
    setFieldsFromValues();
  }

  function setOpen(open) {
    root.hidden = !open;
    root.toggleAttribute('data-open', open);
    if (open) syncFromCamera();
  }

  close.addEventListener('click', () => setOpen(false));
  syncBtn.addEventListener('click', () => {
    syncFromCamera();
    status.textContent = '已读取当前视角。';
  });
  presetBtn.addEventListener('click', () => {
    Object.assign(values, preset);
    setFieldsFromValues();
    apply();
    status.textContent = '已回到当前源码预设。';
  });
  recordBtn.addEventListener('click', recordSelectedSlot);
  copyBtn.addEventListener('click', async () => {
    if (selectedSlotId) recordSelectedSlot();
    refreshOutput();
    output.select();
    try {
      await navigator.clipboard.writeText(output.value);
      status.textContent = '已复制参数，可以直接发给我。';
    } catch {
      status.textContent = '复制被浏览器拦截，参数已选中。';
    }
  });

  controls.addEventListener('change', syncFromCamera);
  refreshOutput();
  updateSlotButtons();

  return {
    root,
    open() { setOpen(true); },
    close() { setOpen(false); },
    toggle() { setOpen(root.hidden); },
    sync: syncFromCamera,
    dispose() {
      controls.removeEventListener('change', syncFromCamera);
      root.remove();
    },
  };
}
