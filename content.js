(async () => {
  if (window.top !== window || document.getElementById('job-route-assistant-host')) return;

  const MODULES = [
    { key: 'education', title: '教育经历', icon: '教' },
    { key: 'experience', title: '实习 / 工作经历', icon: '工' },
    { key: 'projects', title: '项目经历', icon: '项' },
    { key: 'campus', title: '校园经历', icon: '校' },
    { key: 'social', title: '社会实践', icon: '社' },
    { key: 'honors', title: '荣誉成果', icon: '荣' }
  ];
  const SENSITIVE_FIELDS = new Set(['身份证号', '身份证', '证件号码', '证件号']);
  const BULK_AMBIGUOUS_FIELDS = new Set(['开始时间', '结束时间', '岗位', '单位', '部门', '角色', '担任角色', '担任职务']);
  const ALIASES = {
    姓名: ['姓名', '名字', '真实姓名', 'name', 'full name', 'fullname', 'candidate name'],
    手机: ['手机', '手机号', '手机号码', '电话', '联系电话', 'mobile', 'phone', 'tel'],
    邮箱: ['邮箱', '电子邮箱', '邮件', 'email', 'e-mail'],
    微信: ['微信', '微信号', 'wechat', 'weixin'],
    性别: ['性别', 'gender', 'sex'],
    出生日期: ['出生日期', '出生年月', '生日', 'birth', 'birthday', 'date of birth'],
    现居地: ['现居地', '现居住地', '居住地', '所在地', 'location', 'city', 'current city'],
    求职意向: ['求职意向', '意向岗位', '期望职位', '应聘职位', 'target role', 'desired position'],
    身份证号: ['身份证号', '身份证号码', '证件号码', 'id card', 'identity number'],
    自我评价: ['自我评价', '个人评价', '个人简介', '个人总结', 'summary', 'profile', 'about me'],
    学校: ['学校', '学校名称', '院校', '毕业院校', 'school', 'university', 'college'],
    学院: ['学院', '院系', 'department', 'faculty'],
    专业: ['专业', '专业名称', 'major'],
    学历: ['学历', '学位', 'degree', 'education level'],
    GPA: ['gpa', '绩点', '平均绩点'],
    专业排名: ['专业排名', '成绩排名', '排名', 'rank'],
    单位: ['单位', '公司', '公司名称', '组织', 'company', 'employer', 'organization'],
    部门: ['部门', '事业部', '团队', 'department', 'team'],
    岗位: ['岗位', '职位', '职务', 'position', 'job title', 'role'],
    岗位职责: ['岗位职责', '工作内容', '工作描述', '职责描述', 'responsibilities', 'job description'],
    项目名称: ['项目名称', '项目', 'project', 'project name'],
    角色: ['角色', '项目角色', 'role'],
    项目描述: ['项目描述', '项目内容', '项目介绍', 'project description'],
    '组织/社团': ['组织', '社团', '组织/社团', 'association', 'club'],
    担任职务: ['担任职务', '职务', '职位', 'position', 'title'],
    经历描述: ['经历描述', '主要经历', '活动描述', 'description'],
    实践名称: ['实践名称', '社会实践', '活动名称', 'practice name'],
    担任角色: ['担任角色', '实践角色', '角色', 'role'],
    实践描述: ['实践描述', '实践内容', '活动内容', 'description'],
    荣誉名称: ['荣誉名称', '奖项名称', '荣誉', '奖项', 'award', 'honor'],
    奖项级别: ['奖项级别', '荣誉级别', '级别', 'award level'],
    奖项等级: ['奖项等级', '获奖等级', '等级', 'prize'],
    获奖时间: ['获奖时间', '颁发时间', 'award date'],
    开始时间: ['开始时间', '起始时间', '入学时间', 'start date', 'from'],
    结束时间: ['结束时间', '毕业时间', '离职时间', 'end date', 'to']
  };
  const BLOCKED_TYPES = new Set(['hidden', 'password', 'file', 'submit', 'button', 'reset', 'image', 'checkbox', 'radio']);
  const UI_POSITION_KEY = 'jobRoute.assistantUi.v1';

  const host = document.createElement('div');
  host.id = 'job-route-assistant-host';
  const shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);

  const state = {
    isOpen: false,
    profiles: [],
    activeProfileId: '',
    profile: {},
    activeEntries: {},
    openSections: new Set(['experience']),
    lastFocused: null,
    lastSelection: null,
    toastTimer: null,
    suppressLauncherClick: false
  };

  shadow.innerHTML = `
    <link rel="stylesheet" href="${chrome.runtime.getURL('sidebar-assistant.css')}">
    <button class="assistant-launcher" id="launcher" type="button" aria-label="打开简历助手"><span><img src="${chrome.runtime.getURL('job-route-logo.png')}" alt=""></span><strong>简历助手</strong></button>
    <aside class="assistant-panel closed" id="panel" aria-label="求职航线简历助手">
      <header class="assistant-head">
        <div class="assistant-brand"><span><img src="${chrome.runtime.getURL('job-route-logo.png')}" alt=""></span><div><strong>求职航线助手</strong><small id="pageLabel">正在连接当前页面</small></div></div>
        <div class="head-tools"><p class="shortcut-help"><span>按下 <strong>Alt / Option（⌥）+ J</strong></span><small>可以展开或收起侧边助手</small></p></div>
      </header>
      <div class="assistant-scroll">
        <section class="version-card">
          <label>当前岗位简历版本<select id="versionSelect"></select></label>
          <div class="version-state"><i></i><span>已与看板联动</span><small>修改后自动同步</small></div>
        </section>
        <section class="action-card">
          <button class="fill-button" id="fillPage" type="button"><span>↯</span><div><strong>填写当前页面</strong><small>仅填写空白且能明确识别的字段</small></div></button>
          <p>单项“填入”会追加在现有文字后；批量填写只处理空白字段。身份证等敏感信息仅支持手动填入。</p>
        </section>
        <ol class="interaction-guide"><li><b>1</b><span>点击网页填写栏</span></li><li><b>2</b><span>选择具体经历</span></li><li><b>3</b><span>点击“填入”</span></li></ol>
        <div class="section-list" id="sectionList"></div>
      </div>
      <footer class="assistant-foot"><button id="openRecords" type="button"><span>▥</span>投递看板</button><button id="openProfile" type="button"><span>⚙</span>简历资料库</button><button class="collapse-assistant" id="closePanel" type="button" aria-label="收起简历助手"><span>×</span>收起</button></footer>
      <div class="assistant-toast" id="toast"></div>
    </aside>`;

  const $ = selector => shadow.querySelector(selector);
  const panel = $('#panel');
  const launcher = $('#launcher');

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char]);
  }

  function send(message) {
    return new Promise(resolve => {
      try {
        chrome.runtime.sendMessage(message, response => {
          if (chrome.runtime.lastError) resolve({ ok: false, error: chrome.runtime.lastError.message });
          else resolve(response || { ok: false });
        });
      } catch (error) { resolve({ ok: false, error: error.message }); }
    });
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(state.toastTimer);
    state.toastTimer = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function toggle(force) {
    state.isOpen = typeof force === 'boolean' ? force : !state.isOpen;
    panel.classList.toggle('closed', !state.isOpen);
    launcher.classList.toggle('hidden', state.isOpen);
    if (state.isOpen) loadState();
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), Math.max(min, max));
  }

  function viewportBounds() {
    const viewport = window.visualViewport;
    return {
      left: viewport?.offsetLeft || 0,
      top: viewport?.offsetTop || 0,
      width: viewport?.width || innerWidth,
      height: viewport?.height || innerHeight
    };
  }

  function applyLauncherPosition(position = {}) {
    const viewport = viewportBounds();
    const top = clamp(Number(position.top) || Math.round(viewport.top + viewport.height * .34), viewport.top + 8, viewport.top + viewport.height - (launcher.offsetHeight || 50) - 8);
    launcher.style.top = `${top}px`;
    launcher.style.left = position.side === 'left' ? '14px' : 'auto';
    launcher.style.right = position.side === 'left' ? 'auto' : '14px';
  }

  function applyPanelPosition(position = {}) {
    const viewport = viewportBounds();
    const width = panel.offsetWidth || 360;
    const height = panel.offsetHeight || Math.min(720, innerHeight - 24);
    const left = clamp(Number(position.left), viewport.left + 8, viewport.left + viewport.width - width - 8);
    const top = clamp(Number(position.top), viewport.top + 8, viewport.top + viewport.height - height - 8);
    if (Number.isFinite(Number(position.left)) && Number.isFinite(Number(position.top))) {
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = 'auto';
    } else {
      panel.style.left = 'auto';
      panel.style.top = `${viewport.top + 12}px`;
      panel.style.right = `${Math.max(12, innerWidth - viewport.left - viewport.width + 12)}px`;
    }
  }

  async function savedUiPosition() {
    try {
      const saved = await chrome.storage.local.get(UI_POSITION_KEY);
      return saved[UI_POSITION_KEY] || {};
    } catch (_) { return {}; }
  }

  async function saveUiPosition(patch) {
    try {
      const current = await savedUiPosition();
      await chrome.storage.local.set({ [UI_POSITION_KEY]: { ...current, ...patch } });
    } catch (_) {}
  }

  function makeDraggable(element, handle, type) {
    let drag = null;
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0 || (type !== 'launcher' && event.target.closest('button, select, input, textarea, a'))) return;
      const rect = element.getBoundingClientRect();
      drag = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, moved: false };
      handle.setPointerCapture?.(event.pointerId);
      element.classList.add('dragging');
      event.preventDefault();
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (Math.abs(dx) + Math.abs(dy) > 5) drag.moved = true;
      const viewport = viewportBounds();
      const left = clamp(drag.left + dx, viewport.left + 8, viewport.left + viewport.width - element.offsetWidth - 8);
      const top = clamp(drag.top + dy, viewport.top + 8, viewport.top + viewport.height - element.offsetHeight - 8);
      element.style.left = `${left}px`;
      element.style.right = 'auto';
      element.style.top = `${top}px`;
    });
    const finish = event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      element.classList.remove('dragging');
      const rect = element.getBoundingClientRect();
      if (type === 'launcher') {
        const side = rect.left + rect.width / 2 < innerWidth / 2 ? 'left' : 'right';
        state.suppressLauncherClick = drag.moved;
        applyLauncherPosition({ side, top: rect.top });
        saveUiPosition({ launcher: { side, top: rect.top } });
      } else if (drag.moved) {
        saveUiPosition({ panel: { left: rect.left, top: rect.top } });
      }
      drag = null;
    };
    handle.addEventListener('pointerup', finish);
    handle.addEventListener('pointercancel', finish);
  }

  function moduleTitle(key, fallback) {
    return state.profile?.moduleConfig?.[key]?.title || fallback;
  }

  function filledEntries(key) {
    const entries = Array.isArray(state.profile?.[key]) ? state.profile[key] : [];
    return entries.length ? entries : [{}];
  }

  function entryTitle(item, sectionTitle, index) {
    return String(item?._title || `${sectionTitle} ${index + 1}`);
  }

  function cleanFields(source) {
    return Object.entries(source || {}).filter(([key, value]) => key !== '_title' && String(value ?? '').trim());
  }

  function fieldButton(label, value) {
    return `<button class="field-button" type="button" data-fill-label="${escapeHtml(label)}" data-fill-value="${escapeHtml(value)}"><span>${escapeHtml(label)}</span><strong title="${escapeHtml(value)}">${escapeHtml(value)}</strong><em>填入</em></button>`;
  }

  function renderSection(key, title, fields, countText = '') {
    const open = state.openSections.has(key);
    return `<section class="assistant-section${open ? ' open' : ''}" data-section="${escapeHtml(key)}">
      <button class="section-toggle" type="button"><span><strong>${escapeHtml(title)}</strong><small>${escapeHtml(countText || `${fields.length} 项`)}</small></span><i></i></button>
      <div class="section-content">${fields.length ? `<div class="field-list">${fields.map(([label, value]) => fieldButton(label, value)).join('')}</div>` : '<div class="empty-state">该版本暂未填写内容<br>可前往简历资料库补充</div>'}</div>
    </section>`;
  }

  function renderModule(module) {
    const title = moduleTitle(module.key, module.title);
    const entries = filledEntries(module.key);
    const selected = Math.min(Number(state.activeEntries[module.key] || 0), entries.length - 1);
    state.activeEntries[module.key] = selected;
    const item = entries[selected] || {};
    const picker = entries.length > 1 ? `<div class="entry-picker">${entries.map((entry, index) => `
      <button type="button" data-entry-key="${module.key}" data-entry-index="${index}" aria-selected="${index === selected}">
        <span>${index + 1}</span><strong>${escapeHtml(entryTitle(entry, title, index))}</strong><small>${index === selected ? '当前使用' : '选择'}</small>
      </button>`).join('')}</div>` : '';
    const fields = cleanFields(item);
    const open = state.openSections.has(module.key);
    return `<section class="assistant-section${open ? ' open' : ''}" data-section="${module.key}">
      <button class="section-toggle" type="button"><span><strong>${escapeHtml(title)}</strong><small>${entries.length} 段经历</small></span><i></i></button>
      <div class="section-content">${picker}${fields.length ? `<div class="field-list">${fields.map(([label, value]) => fieldButton(label, value)).join('')}</div>` : '<div class="empty-state">这段经历还是空的<br>可切换其他经历或前往资料库补充</div>'}</div>
    </section>`;
  }

  function render() {
    const versionSelect = $('#versionSelect');
    versionSelect.innerHTML = state.profiles.map(item => `<option value="${escapeHtml(item.id)}"${item.id === state.activeProfileId ? ' selected' : ''}>${escapeHtml(item.title || '未命名简历')}</option>`).join('');
    const basic = state.profile?.basic || {};
    const basicFields = cleanFields(basic);
    const customFields = cleanFields(state.profile?.custom || {});
    const sections = [
      renderSection('basic', '基本信息', basicFields),
      ...MODULES.map(renderModule)
    ];
    if (customFields.length) sections.push(renderSection('custom', '其他信息', customFields));
    $('#sectionList').innerHTML = sections.join('');
    bindSectionEvents();
  }

  function bindSectionEvents() {
    shadow.querySelectorAll('.section-toggle').forEach(button => button.addEventListener('click', () => {
      const section = button.closest('.assistant-section');
      const key = section.dataset.section;
      section.classList.toggle('open');
      if (section.classList.contains('open')) state.openSections.add(key); else state.openSections.delete(key);
    }));
    shadow.querySelectorAll('[data-entry-key]').forEach(button => button.addEventListener('click', () => {
      state.activeEntries[button.dataset.entryKey] = Number(button.dataset.entryIndex);
      state.openSections.add(button.dataset.entryKey);
      render();
    }));
    shadow.querySelectorAll('[data-fill-label]').forEach(button => button.addEventListener('click', () => {
      fillFocused(button.dataset.fillValue, button.dataset.fillLabel);
    }));
  }

  async function loadState() {
    const response = await send({ type: 'GET_APP_STATE' });
    if (!response?.ok) return showToast('暂时无法读取求职航线数据，请重新加载扩展');
    state.profiles = response.profiles || [];
    state.activeProfileId = response.activeProfile || state.profiles[0]?.id || '';
    state.profile = state.profiles.find(item => item.id === state.activeProfileId)?.profile || {};
    render();
  }

  function isEditable(element) {
    if (!element || element.closest?.('#job-route-assistant-host')) return false;
    if (element.matches?.('textarea, select, [contenteditable="true"], [contenteditable=""]')) return !element.disabled && !element.readOnly;
    if (element.matches?.('input')) return !element.disabled && !element.readOnly && !BLOCKED_TYPES.has((element.type || 'text').toLowerCase());
    return false;
  }

  function elementLabel(element) {
    const explicit = element.getAttribute?.('aria-label') || element.getAttribute?.('placeholder') || element.getAttribute?.('name') || element.getAttribute?.('id');
    if (explicit) return explicit;
    const id = element.id && CSS.escape(element.id);
    const linked = id ? document.querySelector(`label[for="${id}"]`)?.innerText : '';
    const wrapped = element.closest?.('label')?.innerText;
    const nearby = element.parentElement?.querySelector?.('label')?.innerText;
    return (linked || wrapped || nearby || element.tagName || '输入框').trim().replace(/\s+/g, ' ').slice(0, 60);
  }

  function updateTarget(element) {
    if (isEditable(element)) {
      state.lastFocused = element;
      if (element.isContentEditable) {
        const selection = window.getSelection();
        if (selection?.rangeCount) state.lastSelection = selection.getRangeAt(0).cloneRange();
      }
    } else if (!state.lastFocused?.isConnected) {
      state.lastFocused = null;
    }
  }

  function currentValue(element) {
    return element.isContentEditable ? element.innerText.trim() : String(element.value || '').trim();
  }

  function isAppendableTextControl(element) {
    if (element.isContentEditable || element.tagName === 'TEXTAREA') return true;
    if (element.tagName !== 'INPUT') return false;
    return !new Set(['date', 'datetime-local', 'month', 'week', 'time', 'color', 'range', 'number']).has((element.type || 'text').toLowerCase());
  }

  function appendSeparator(element, existing) {
    if (!existing || /\s$/.test(existing)) return '';
    return element.isContentEditable || element.tagName === 'TEXTAREA' ? '\n' : ' ';
  }

  function setNativeValue(element, value, { replaceExisting = false, appendExisting = false } = {}) {
    if (element.isContentEditable) {
      element.focus();
      const existing = currentValue(element);
      if (appendExisting && existing) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
        value = `${appendSeparator(element, existing)}${value}`;
      } else if (replaceExisting) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
      } else if (state.lastSelection) {
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(state.lastSelection);
      }
      const inserted = document.execCommand('insertText', false, value);
      if (!inserted) element.textContent = appendExisting && existing ? `${existing}${value}` : value;
    } else if (element.tagName === 'SELECT') {
      const normalized = normalize(value);
      const option = [...element.options].find(item => normalize(item.textContent).includes(normalized) || normalized.includes(normalize(item.textContent)));
      if (!option) return false;
      element.value = option.value;
    } else {
      const existing = currentValue(element);
      const nextValue = appendExisting && existing ? `${existing}${appendSeparator(element, existing)}${value}` : value;
      const prototype = element.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
      setter ? setter.call(element, nextValue) : (element.value = nextValue);
    }
    element.dispatchEvent(new Event('input', { bubbles: true }));
    element.dispatchEvent(new Event('change', { bubbles: true }));
    element.dataset.jobRouteFilled = 'true';
    return true;
  }

  function fillFocused(value, label) {
    const target = state.lastFocused;
    if (!isEditable(target) || !target.isConnected) return showToast('请先点击网页中需要填写的输入框');
    const hasExisting = Boolean(currentValue(target));
    const shouldAppend = hasExisting && target.tagName !== 'SELECT';
    if (shouldAppend && !isAppendableTextControl(target)) return showToast('该字段格式不支持追加，请手动修改');
    if (!setNativeValue(target, value, { replaceExisting: !shouldAppend, appendExisting: shouldAppend })) return showToast(`网页选项中没有与“${value}”匹配的内容`);
    target.focus();
    showToast(`${shouldAppend ? '已追加' : target.tagName === 'SELECT' ? '已选择' : '已填入'}：${label}`);
  }

  function normalize(value) {
    return String(value || '').toLowerCase().replace(/[\s_\-:：*()（）\[\]【】]/g, '');
  }

  function fieldContext(element) {
    const parts = [elementLabel(element), element.getAttribute?.('autocomplete'), element.getAttribute?.('data-field'), element.getAttribute?.('data-name')];
    const parent = element.parentElement;
    if (parent) parts.push(parent.innerText?.slice(0, 100));
    return normalize(parts.filter(Boolean).join(' '));
  }

  function selectedData() {
    const data = { ...(state.profile?.basic || {}), ...(state.profile?.custom || {}) };
    MODULES.forEach(module => {
      const entries = filledEntries(module.key);
      const selected = entries[state.activeEntries[module.key] || 0] || {};
      Object.entries(selected).forEach(([key, value]) => { if (key !== '_title' && String(value ?? '').trim()) data[key] = value; });
    });
    return data;
  }

  function matchField(element, data) {
    const context = fieldContext(element);
    let best = null;
    for (const [label, value] of Object.entries(data)) {
      if (!String(value ?? '').trim() || SENSITIVE_FIELDS.has(label) || BULK_AMBIGUOUS_FIELDS.has(label)) continue;
      const aliases = [label, ...(ALIASES[label] || [])];
      const score = aliases.reduce((max, alias) => {
        const token = normalize(alias);
        if (!token || !context.includes(token)) return max;
        return Math.max(max, token.length + (normalize(label) === token ? 3 : 0));
      }, 0);
      if (score >= 5 && (!best || score > best.score)) best = { label, value: String(value), score };
    }
    return best;
  }

  function isVisible(element) {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
  }

  function fillPage() {
    const data = selectedData();
    const fields = [...document.querySelectorAll('input, textarea, select, [contenteditable="true"], [contenteditable=""]')].filter(element => isEditable(element) && isVisible(element) && !currentValue(element));
    let filled = 0;
    fields.forEach(element => {
      const match = matchField(element, data);
      if (match && setNativeValue(element, match.value)) filled += 1;
    });
    showToast(filled ? `已填写 ${filled} 个空白字段，请检查后再提交` : '没有找到可明确匹配的空白字段，可使用单项“填入”');
  }

  launcher.addEventListener('click', () => {
    if (state.suppressLauncherClick) { state.suppressLauncherClick = false; return; }
    toggle(true);
  });
  $('#closePanel').addEventListener('click', () => toggle(false));
  $('#fillPage').addEventListener('click', fillPage);
  $('#openRecords').addEventListener('click', () => send({ type: 'OPEN_DASHBOARD', hash: '#records' }));
  $('#openProfile').addEventListener('click', () => send({ type: 'OPEN_DASHBOARD', hash: '#profile' }));
  $('#versionSelect').addEventListener('change', async event => {
    const response = await send({ type: 'SET_ACTIVE_PROFILE', profileId: event.target.value });
    if (!response?.ok) return showToast('切换简历版本失败');
    state.activeProfileId = event.target.value;
    state.profile = response.profile || {};
    state.activeEntries = {};
    render();
    showToast('已切换简历版本，并同步到看板');
  });

  document.addEventListener('focusin', event => updateTarget(event.target), true);
  document.addEventListener('click', event => { if (isEditable(event.target)) updateTarget(event.target); }, true);
  document.addEventListener('selectionchange', () => { if (state.lastFocused?.isContentEditable) updateTarget(state.lastFocused); });
  document.addEventListener('keydown', event => {
    if (event.altKey && event.key.toLowerCase() === 'j') { event.preventDefault(); toggle(); }
    if (event.key === 'Escape' && state.isOpen) { event.preventDefault(); toggle(false); }
  }, true);
  chrome.runtime.onMessage.addListener(message => { if (message?.type === 'TOGGLE_ASSISTANT') toggle(); });
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && Object.keys(changes).some(key => ['jobRoute.profile.v1', 'jobRoute.profiles.v2', 'jobRoute.activeProfile.v2'].includes(key))) loadState();
  });

  makeDraggable(launcher, launcher, 'launcher');
  makeDraggable(panel, shadow.querySelector('.assistant-head'), 'panel');
  addEventListener('resize', async () => {
    const saved = await savedUiPosition();
    applyLauncherPosition(saved.launcher || {});
    applyPanelPosition(saved.panel || {});
  });
  window.visualViewport?.addEventListener('resize', async () => {
    const saved = await savedUiPosition();
    applyLauncherPosition(saved.launcher || {});
    applyPanelPosition(saved.panel || {});
  });

  $('#pageLabel').textContent = location.hostname || '当前网页';
  const uiPosition = await savedUiPosition();
  applyLauncherPosition(uiPosition.launcher || {});
  applyPanelPosition(uiPosition.panel || {});
  await loadState();
})();
