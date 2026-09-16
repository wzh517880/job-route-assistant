(() => {
  'use strict';

  const DEFAULT_STATUSES = ['已投递', '简历筛选', '待测评', 'AI面试', '笔试', '一面', '二面', '三面', 'hr面', 'offer', '已挂'];
  const KEYS = { records: 'jobRoute.records.v1', profile: 'jobRoute.profile.v1', profiles: 'jobRoute.profiles.v2', activeProfile: 'jobRoute.activeProfile.v2', statuses: 'jobRoute.statuses.v1' };
  const phaseOnePreview = new URLSearchParams(location.search).get('preview') === 'phase1';
  if (phaseOnePreview) Object.keys(KEYS).forEach(key => { KEYS[key] = `jobRoute.phase1Demo.${key}`; });
  const EMPTY_PROFILE = {
    basic: { '姓名': '', '手机': '', '邮箱': '', '微信': '', '性别': '', '出生日期': '', '现居地': '', '求职意向': '', '身份证号': '', '自我评价': '' },
    education: [{}], experience: [{}], projects: [{}], campus: [{}], social: [{}], honors: [{}], custom: {}, basicTitle: '基本与联系信息', moduleConfig: {}, pdfReviewRequired: false
  };
  const PROFILE_SCHEMAS = {
    education: { title: '教育经历', add: '添加教育经历', fields: ['学校', '学院', '专业', '学历', '开始时间', '结束时间', 'GPA', '专业排名'] },
    experience: { title: '实习 / 工作经历', add: '添加一段经历', fields: ['单位', '部门', '岗位', '开始时间', '结束时间', '岗位职责'] },
    projects: { title: '项目经历', add: '添加项目经历', fields: ['项目名称', '角色', '开始时间', '结束时间', '项目描述'] },
    campus: { title: '校园经历', add: '添加校园经历', fields: ['组织 / 社团', '担任职务', '开始时间', '结束时间', '经历描述'] },
    social: { title: '社会实践', add: '添加社会实践', fields: ['实践名称', '担任角色', '开始时间', '结束时间', '实践描述'] },
    honors: { title: '荣誉成果', add: '添加荣誉成果', fields: ['荣誉名称', '奖项级别', '奖项等级', '获奖时间'] }
  };

  let records = [];
  let profile = structuredClone(EMPTY_PROFILE);
  let resumeProfiles = [];
  let activeResumeId = '';
  let statuses = [...DEFAULT_STATUSES];
  let currentView = 'records';
  let selectedOcrFile = null;
  let reuseSection = '';
  let toastTimer = null;
  let deadlinePickerState = { recordId: '', date: null, month: null, anchor: null };

  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];

  function localDate(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 10);
  }

  function localDateTime(date = new Date()) {
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function clone(value) { return JSON.parse(JSON.stringify(value)); }

  function normalizeProfile(value = {}) {
    const next = { ...clone(EMPTY_PROFILE), ...clone(value) };
    next.basic = { ...clone(EMPTY_PROFILE.basic), ...(value.basic || {}) };
    next.custom = { ...(value.custom || {}) };
    next.moduleConfig = { ...(value.moduleConfig || {}) };
    Object.keys(PROFILE_SCHEMAS).forEach(section => {
      next[section] = Array.isArray(value[section]) && value[section].length ? value[section] : [{}];
      const saved = next.moduleConfig[section] || {};
      next.moduleConfig[section] = {
        title: saved.title || PROFILE_SCHEMAS[section].title,
        fields: [...new Set([...(saved.fields || PROFILE_SCHEMAS[section].fields)])]
      };
    });
    return next;
  }

  function activeResume() { return resumeProfiles.find(item => item.id === activeResumeId) || resumeProfiles[0]; }

  async function persistActiveProfile() {
    const active = activeResume();
    if (active) { active.profile = profile; active.title = $('#resumeTitleInput')?.value.trim() || active.title; }
    await setStorage({ [KEYS.profiles]: resumeProfiles, [KEYS.activeProfile]: activeResumeId, [KEYS.profile]: profile });
  }

  async function getStorage(keys) {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.get(keys);
    const list = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(list.map(key => {
      const raw = localStorage.getItem(key);
      return [key, raw ? JSON.parse(raw) : undefined];
    }));
  }

  async function setStorage(values) {
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.set(values);
    Object.entries(values).forEach(([key, value]) => localStorage.setItem(key, JSON.stringify(value)));
  }

  async function clearStorage() {
    await JobResumeFiles.remove();
    if (globalThis.chrome?.storage?.local) return chrome.storage.local.remove(Object.values(KEYS));
    Object.values(KEYS).forEach(key => localStorage.removeItem(key));
  }

  function showToast(message) {
    const toast = $('#toast');
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2400);
  }

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  }

  function companyKey(record) {
    return record.jobName.trim().replace(/\s+/g, ' ').toLowerCase();
  }

  function demoRecords() {
    return [
      {
        id: crypto.randomUUID(),
        jobName: '星航科技（示例）',
        position: '产品经理实习生',
        applicationDate: localDate(),
        stage: '已投递',
        url: 'https://example.com/careers',
        deadlineAt: '',
        notes: '这是一条示例记录，可直接修改或删除。',
        updatedAt: Date.now()
      }
    ];
  }

  function normalizeRecord(record = {}) {
    const legacyStage = { '待投递': '已投递', 'HR面': 'hr面', 'Offer': 'offer', '已结束': '已挂' }[record.stage] || record.stage;
    return {
      id: record.id || crypto.randomUUID(),
      jobName: record.jobName || record.company || '',
      url: record.url || record.applicationUrl || '',
      position: record.position || '',
      stage: statuses.includes(legacyStage) ? legacyStage : '已投递',
      applicationDate: record.applicationDate || localDate(),
      deadlineAt: record.deadlineAt || record.scheduleAt || '',
      notes: record.notes || '',
      ...JobDetails.normalize(record),
      updatedAt: record.updatedAt || Date.now()
    };
  }

  function includeAssessmentStatus() {
    if (statuses.includes('待测评')) return;
    const index = statuses.indexOf('AI面试');
    statuses.splice(index < 0 ? Math.max(0, statuses.indexOf('简历筛选') + 1) : index, 0, '待测评');
  }

  async function loadState() {
    const saved = await getStorage([KEYS.records, KEYS.profile, KEYS.profiles, KEYS.activeProfile, KEYS.statuses]);
    if (phaseOnePreview && !Array.isArray(saved[KEYS.records])) {
      const demo = JobDetails.demo();
      Object.assign(saved, { [KEYS.records]: demo.records, [KEYS.profiles]: demo.profiles, [KEYS.activeProfile]: demo.profiles[0].id });
      await setStorage({ [KEYS.records]: demo.records, [KEYS.profiles]: demo.profiles, [KEYS.activeProfile]: demo.profiles[0].id });
    }
    const standalone = !globalThis.chrome?.storage?.local;
    statuses = Array.isArray(saved[KEYS.statuses]) && saved[KEYS.statuses].length ? [...new Set(saved[KEYS.statuses].map(String))] : [...DEFAULT_STATUSES];
    const screeningMigrationKey = `${KEYS.statuses}.screeningAdded`;
    if (!(await getStorage(screeningMigrationKey))[screeningMigrationKey]) {
      if (!statuses.includes('简历筛选')) statuses.splice(Math.max(0, statuses.indexOf('已投递') + 1), 0, '简历筛选');
      await setStorage({ [KEYS.statuses]: statuses, [screeningMigrationKey]: true });
    }
    const assessmentMigrationKey = `${KEYS.statuses}.assessmentAdded`;
    if (!(await getStorage(assessmentMigrationKey))[assessmentMigrationKey]) {
      includeAssessmentStatus();
      await setStorage({ [KEYS.statuses]: statuses, [assessmentMigrationKey]: true });
    }
    records = (Array.isArray(saved[KEYS.records]) ? saved[KEYS.records] : (standalone ? demoRecords() : [])).map(normalizeRecord);
    if (records.length && records.every(record => !record.jobName.trim() && !record.position.trim() && !record.url.trim())) {
      records = demoRecords().map(normalizeRecord);
      await setStorage({ [KEYS.records]: records });
    }
    const legacyProfile = saved[KEYS.profile] && typeof saved[KEYS.profile] === 'object' ? saved[KEYS.profile] : clone(EMPTY_PROFILE);
    resumeProfiles = Array.isArray(saved[KEYS.profiles]) && saved[KEYS.profiles].length ? saved[KEYS.profiles] : [{ id: crypto.randomUUID(), title: '通用简历', profile: legacyProfile }];
    resumeProfiles = resumeProfiles.map(item => ({ id: item.id || crypto.randomUUID(), title: item.title || '未命名岗位简历', profile: normalizeProfile(item.profile) }));
    activeResumeId = resumeProfiles.some(item => item.id === saved[KEYS.activeProfile]) ? saved[KEYS.activeProfile] : resumeProfiles[0].id;
    profile = activeResume().profile;
  }

  function renderRoute() {
    $('#routeStrip').style.gridTemplateColumns = `repeat(${statuses.length}, minmax(72px, 1fr))`;
    $('#routeStrip').innerHTML = statuses.map(stage => {
      const count = records.filter(record => record.stage === stage).length;
      return `<button class="route-stop ${count ? 'has-items' : ''}" data-route-stage="${stage}" style="border:0;background:transparent;color:inherit;">
        <span class="route-dot"></span><strong>${stage}</strong><small>${count} 份</small>
      </button>`;
    }).join('');
  }

  function renderMetrics() {
    const active = records.filter(record => !['offer', '已挂'].includes(record.stage)).length;
    const upcoming = records.filter(record => record.deadlineAt && !['offer', '已挂'].includes(record.stage)).length;
    const offers = records.filter(record => record.stage === 'offer').length;
    const today = records.filter(record => record.applicationDate === localDate()).length;
    const items = [
      ['总投递', records.length, '所有航线'],
      ['进行中', active, '保持推进'],
      ['近期行动', upcoming, '别错过节点'],
      ['已获 offer', offers, today ? `今天新增 ${today}` : '继续出发']
    ];
    $('#metrics').innerHTML = items.map(([label, value, note]) => `<article class="metric"><span>${label}</span><strong>${value}</strong><em>${note}</em></article>`).join('');
  }

  function renderRecords() {
    const query = $('#searchInput').value.trim().toLowerCase();
    const stage = $('#stageFilter').value;
    const filtered = records.filter(record => {
      const text = `${record.jobName} ${record.position} ${record.stage}`.toLowerCase();
      return (!query || text.includes(query)) && (!stage || record.stage === stage);
    });

    const body = $('#recordsBody');
    const empty = $('#recordsEmpty');
    const companyCounts = records.reduce((counts, record) => {
      const key = companyKey(record);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map());
    body.innerHTML = filtered.map(record => {
      const sameCompanyCount = companyCounts.get(companyKey(record)) || 1;
      return `<tr data-record-row="${record.id}" class="${sameCompanyCount > 1 ? 'same-company-row' : ''}">
      <td><div class="company-cell"><input class="table-input company-name-input" data-record-id="${escapeHtml(record.id)}" data-field="jobName" value="${escapeHtml(record.jobName)}" placeholder="填写公司 / 招聘项目" aria-label="公司 / 招聘项目"><div class="company-detail-action"><button type="button" class="job-details-link" data-open-job="${escapeHtml(record.id)}">查看详细信息 <span aria-hidden="true">↗</span></button></div>${sameCompanyCount > 1 ? `<span class="company-count-badge" title="同一公司共投递 ${sameCompanyCount} 个岗位">同司 · ${sameCompanyCount} 岗</span>` : ''}</div></td>
      <td><div class="link-cell"><input class="table-input" type="url" data-record-id="${record.id}" data-field="url" value="${escapeHtml(record.url)}" placeholder="粘贴投递链接">${record.url ? `<a href="${escapeHtml(record.url)}" target="_blank" rel="noopener noreferrer" title="打开投递链接">↗</a>` : ''}</div></td>
      <td><input class="table-input" data-record-id="${record.id}" data-field="position" value="${escapeHtml(record.position)}" placeholder="具体岗位"></td>
      <td><select class="table-input stage-select" data-record-id="${record.id}" data-field="stage">${statuses.map(stage => `<option ${stage === record.stage ? 'selected' : ''}>${escapeHtml(stage)}</option>`).join('')}</select></td>
      <td><input class="table-input" type="date" data-record-id="${record.id}" data-field="applicationDate" value="${escapeHtml(record.applicationDate)}"></td>
      <td><button class="deadline-trigger ${deadlineMeta(record).className}" type="button" data-open-deadline="${escapeHtml(record.id)}" title="${escapeHtml(deadlineMeta(record).label)}" aria-label="设置 ${escapeHtml(record.jobName || '该岗位')} 的当前状态 DDL"><span>${escapeHtml(formatDeadlineDisplay(record.deadlineAt))}</span><i aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg></i></button></td>
      <td class="row-actions"><button class="delete-record" data-delete="${record.id}" title="删除这一行" aria-label="删除 ${escapeHtml(record.jobName || '这一行')}">删除</button></td>
    </tr>`;
    }).join('');
    empty.classList.toggle('hidden', filtered.length > 0);
    renderRoute();
    renderMetrics();
    renderUpcoming();
  }

  function renderUpcoming() {
    const filterControl = $('#upcomingStageFilter');
    const selectedStage = filterControl.value || '__action__';
    [...filterControl.options].forEach(option => {
      if (option.value !== '__action__') option.textContent = `${option.value} · ${records.filter(record => record.stage === option.value).length}`;
    });
    const list = records
      .filter(record => selectedStage === '__action__'
        ? !['已投递', 'offer', '已挂'].includes(record.stage)
        : record.stage === selectedStage)
      .sort((a, b) => {
        if (a.deadlineAt && b.deadlineAt) return new Date(a.deadlineAt) - new Date(b.deadlineAt);
        if (a.deadlineAt) return -1;
        if (b.deadlineAt) return 1;
        return statuses.indexOf(b.stage) - statuses.indexOf(a.stage);
      });
    const groups = [];
    const groupMap = new Map();
    list.forEach(record => {
      const key = companyKey(record) || `record:${record.id}`;
      if (!groupMap.has(key)) {
        const group = { company: record.jobName || '未命名公司', records: [] };
        groupMap.set(key, group);
        groups.push(group);
      }
      groupMap.get(key).records.push(record);
    });
    const criticalCount = list.filter(record => ['critical', 'overdue'].includes(deadlineMeta(record).className)).length;
    $('.next-panel').classList.toggle('has-critical', criticalCount > 0);
    $('#upcomingList').innerHTML = list.length ? `${criticalCount ? `<div class="urgent-summary">⚠ ${criticalCount} 个节点即将截止，请优先处理</div>` : ''}${groups.map(group => `<section class="company-reminder">
      <div class="company-reminder-head"><strong>${escapeHtml(group.company)}</strong>${group.records.length > 1 ? `<span>${group.records.length} 个岗位</span>` : ''}</div>
      <div class="company-role-list">${group.records.map(record => {
        const deadline = deadlineMeta(record);
        return `<article class="upcoming-item ${deadline.className}" ${['critical', 'overdue'].includes(deadline.className) ? 'role="alert"' : ''}>
          <div class="reminder-top"><span class="progress-type">${escapeHtml(record.stage)}</span><span class="deadline-badge">${escapeHtml(deadline.label)}</span></div>
          <strong class="reminder-role-name">${escapeHtml(record.position || '未填写投递岗位')}</strong>
          <p>${escapeHtml(progressAction(record.stage))}</p>
          ${record.deadlineAt ? `<time>DDL · ${escapeHtml(record.deadlineAt.replace('T', ' '))}</time>` : '<time>尚未设置当前状态 DDL</time>'}
        </article>`;
      }).join('')}</div>
    </section>`).join('')}` : `<div class="upcoming-empty">${selectedStage === '__action__' ? '暂无需要处理的面试或笔试。进入下一阶段后，这里会自动生成行动提醒。' : `暂无处于「${escapeHtml(selectedStage)}」状态的公司。`}</div>`;
  }

  function progressAction(stage) {
    const fixed = {
      '已投递': '关注邮件、短信和招聘系统通知',
      '简历筛选': '等待简历筛选结果，留意邮件和招聘系统通知',
      '待测评': '查看测评通知和截止时间，预留时间完成在线测评',
      'AI面试': '需要完成 AI 面试，检查设备并准备结构化回答',
      '笔试': '需要完成笔试或在线测评',
      '一面': '需要准备首轮面试和自我介绍',
      '二面': '需要准备业务深挖与案例追问',
      '三面': '需要准备终轮业务判断与综合追问',
      'hr面': '需要准备求职动机、薪资与到岗时间',
      'offer': '核对 offer 条款与回复期限',
      '已挂': '本条投递流程已结束'
    };
    if (fixed[stage]) return fixed[stage];
    if (/面|面试/i.test(stage)) return `需要准备「${stage}」相关面试内容`;
    if (/笔试|测评/i.test(stage)) return `需要完成「${stage}」相关测评`;
    return `当前处于「${stage}」，请确认下一步行动`;
  }

  function deadlineMeta(record) {
    if (!record.deadlineAt) return { className: '', label: '未设置 DDL' };
    const diff = new Date(record.deadlineAt).getTime() - Date.now();
    const hours = diff / 3600000;
    if (diff < 0) return { className: 'overdue', label: `已逾期 ${humanDuration(-diff)}` };
    if (hours <= 24) return { className: 'critical', label: `仅剩 ${humanDuration(diff)}` };
    if (hours <= 72) return { className: 'urgent', label: `还剩 ${humanDuration(diff)}` };
    if (hours <= 168) return { className: 'soon', label: `还剩 ${humanDuration(diff)}` };
    return { className: '', label: `还剩 ${humanDuration(diff)}` };
  }

  function parseDeadlineValue(value) {
    const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
    if (!match) return new Date();
    return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  }

  function deadlineValue(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function dateKey(date) {
    const pad = value => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function formatDeadlineDisplay(value) {
    if (!value) return '设置 DDL';
    return value.replace(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}).*$/, '$1/$2/$3 $4:$5');
  }

  function positionDeadlinePicker() {
    const picker = $('#deadlinePicker');
    const anchor = deadlinePickerState.anchor;
    if (!anchor?.isConnected || picker.hidden) return;
    const rect = anchor.getBoundingClientRect();
    const viewport = window.visualViewport;
    const leftEdge = viewport?.offsetLeft || 0;
    const topEdge = viewport?.offsetTop || 0;
    const width = viewport?.width || innerWidth;
    const height = viewport?.height || innerHeight;
    const pickerWidth = picker.offsetWidth;
    const pickerHeight = picker.offsetHeight;
    const left = Math.min(Math.max(rect.right - pickerWidth, leftEdge + 8), leftEdge + width - pickerWidth - 8);
    const below = rect.bottom + 8;
    const top = below + pickerHeight <= topEdge + height - 8 ? below : Math.max(topEdge + 8, rect.top - pickerHeight - 8);
    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;
  }

  function renderDeadlinePicker() {
    const selected = deadlinePickerState.date;
    const month = deadlinePickerState.month;
    if (!selected || !month) return;
    $('#deadlineMonthLabel').textContent = `${month.getFullYear()}年 ${month.getMonth() + 1}月`;
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const mondayOffset = (first.getDay() + 6) % 7;
    const start = new Date(month.getFullYear(), month.getMonth(), 1 - mondayOffset);
    const today = dateKey(new Date());
    const selectedKey = dateKey(selected);
    $('#deadlineCalendar').innerHTML = Array.from({ length: 42 }, (_, index) => {
      const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = dateKey(day);
      const classes = ['deadline-day'];
      if (day.getMonth() !== month.getMonth()) classes.push('outside');
      if (key === today) classes.push('today');
      if (key === selectedKey) classes.push('selected');
      return `<button class="${classes.join(' ')}" type="button" data-deadline-day="${key}" aria-label="${key}" aria-pressed="${key === selectedKey}">${day.getDate()}</button>`;
    }).join('');
    $('#deadlineHour').value = String(selected.getHours()).padStart(2, '0');
    $('#deadlineMinute').value = String(selected.getMinutes()).padStart(2, '0');
  }

  function openDeadlinePicker(recordId, anchor) {
    const record = records.find(item => item.id === recordId);
    if (!record) return;
    const selected = parseDeadlineValue(record.deadlineAt);
    deadlinePickerState = {
      recordId,
      date: selected,
      month: new Date(selected.getFullYear(), selected.getMonth(), 1),
      anchor
    };
    const picker = $('#deadlinePicker');
    picker.hidden = false;
    renderDeadlinePicker();
    requestAnimationFrame(positionDeadlinePicker);
  }

  function closeDeadlinePicker() {
    $('#deadlinePicker').hidden = true;
    deadlinePickerState = { recordId: '', date: null, month: null, anchor: null };
  }

  async function saveDeadlinePicker(clear = false) {
    const record = records.find(item => item.id === deadlinePickerState.recordId);
    if (!record) return closeDeadlinePicker();
    record.deadlineAt = clear ? '' : deadlineValue(deadlinePickerState.date);
    if (record.history?.length) record.history[record.history.length - 1].deadlineAt = record.deadlineAt;
    record.updatedAt = Date.now();
    await setStorage({ [KEYS.records]: records });
    closeDeadlinePicker();
    renderRecords();
    showToast(clear ? 'DDL 已清除' : 'DDL 已确认并保存');
  }

  function setupDeadlinePicker() {
    $('#deadlineHour').innerHTML = Array.from({ length: 24 }, (_, hour) => `<option value="${String(hour).padStart(2, '0')}">${String(hour).padStart(2, '0')}</option>`).join('');
    $('#deadlineMinute').innerHTML = Array.from({ length: 60 }, (_, minute) => `<option value="${String(minute).padStart(2, '0')}">${String(minute).padStart(2, '0')}</option>`).join('');
    $('#deadlinePicker').addEventListener('click', event => {
      const nav = event.target.closest('[data-deadline-nav]');
      const day = event.target.closest('[data-deadline-day]');
      if (nav) {
        deadlinePickerState.month = new Date(deadlinePickerState.month.getFullYear(), deadlinePickerState.month.getMonth() + Number(nav.dataset.deadlineNav), 1);
        renderDeadlinePicker();
      }
      if (day) {
        const [year, month, date] = day.dataset.deadlineDay.split('-').map(Number);
        deadlinePickerState.date = new Date(year, month - 1, date, deadlinePickerState.date.getHours(), deadlinePickerState.date.getMinutes());
        deadlinePickerState.month = new Date(year, month - 1, 1);
        renderDeadlinePicker();
      }
      if (event.target.closest('[data-deadline-clear]')) saveDeadlinePicker(true);
      if (event.target.closest('[data-deadline-confirm]')) saveDeadlinePicker(false);
    });
    $('#deadlineHour').addEventListener('change', event => deadlinePickerState.date?.setHours(Number(event.target.value)));
    $('#deadlineMinute').addEventListener('change', event => deadlinePickerState.date?.setMinutes(Number(event.target.value)));
    document.addEventListener('pointerdown', event => {
      const picker = $('#deadlinePicker');
      if (!picker.hidden && !picker.contains(event.target) && !event.target.closest('[data-open-deadline]')) closeDeadlinePicker();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape' && !$('#deadlinePicker').hidden) closeDeadlinePicker();
    });
    window.addEventListener('resize', positionDeadlinePicker);
  }

  function humanDuration(milliseconds) {
    const hours = Math.max(1, Math.ceil(milliseconds / 3600000));
    return hours < 24 ? `${hours} 小时` : `${Math.ceil(hours / 24)} 天`;
  }

  function renderProfile() {
    const active = activeResume();
    $('#resumeVersionSelect').innerHTML = resumeProfiles.map(item => `<option value="${item.id}" ${item.id === activeResumeId ? 'selected' : ''}>${escapeHtml(item.title)}</option>`).join('');
    $('#resumeVersionTriggerLabel').textContent = active?.title || '未命名岗位简历';
    $('#resumeVersionMenu').innerHTML = resumeProfiles.map(item => `<button type="button" role="option" data-resume-version="${item.id}" aria-selected="${item.id === activeResumeId}"><span></span><strong>${escapeHtml(item.title)}</strong>${item.id === activeResumeId ? '<small>当前版本</small>' : '<small>切换</small>'}</button>`).join('');
    $('#resumeTitleInput').value = active?.title || '未命名岗位简历';
    $('#deleteResumeVersionBtn').disabled = resumeProfiles.length <= 1;
    $('#pdfReviewNotice').classList.toggle('hidden', !profile.pdfReviewRequired);
    const basicEntries = Object.entries({ ...EMPTY_PROFILE.basic, ...profile.basic });
    let html = `<section class="profile-card" data-profile-section="basic">
      <div class="profile-card-head"><input class="module-title-input" data-basic-title value="${escapeHtml(profile.basicTitle || '基本与联系信息')}" aria-label="基本信息模块标题"><div class="profile-card-actions"><button class="secondary-btn reuse-module-btn" type="button" data-reuse-section="basic">↙ 沿用其他版本</button><span>BASIC</span></div></div>
      <div class="fields-grid">${basicEntries.map(([key, value]) => {
        const wide = ['自我评价'].includes(key) ? 'wide' : '';
        return `<label class="${wide}">${escapeHtml(key)}${wide
          ? `<textarea rows="3" data-basic-key="${escapeHtml(key)}">${escapeHtml(value)}</textarea>`
          : `<input data-basic-key="${escapeHtml(key)}" value="${escapeHtml(value)}">`}</label>`;
      }).join('')}</div></section>`;

    Object.entries(PROFILE_SCHEMAS).forEach(([section, defaults]) => {
      const config = profile.moduleConfig[section] || defaults;
      const list = Array.isArray(profile[section]) ? profile[section] : [];
      html += `<section class="profile-card" data-profile-section="${section}">
        <div class="profile-card-head"><input class="module-title-input" data-module-title="${section}" value="${escapeHtml(config.title)}" aria-label="模块标题"><div class="profile-card-actions"><button class="secondary-btn reuse-module-btn" type="button" data-reuse-section="${section}">↙ 沿用其他版本</button><button class="secondary-btn" data-add-experience="${section}">＋ 添加一条</button></div></div>
        <div data-experience-list="${section}">${list.map((item, index) => experienceHtml(section, config, item, index)).join('')}</div>
      </section>`;
    });

    $('#profileEditor').innerHTML = html;
  }

  function closeResumeVersionMenu() {
    $('#resumeVersionMenu').classList.add('hidden');
    $('#resumeVersionTrigger').setAttribute('aria-expanded', 'false');
  }

  function toggleResumeVersionMenu() {
    const menu = $('#resumeVersionMenu');
    const willOpen = menu.classList.contains('hidden');
    menu.classList.toggle('hidden', !willOpen);
    $('#resumeVersionTrigger').setAttribute('aria-expanded', String(willOpen));
    if (willOpen) setTimeout(() => menu.querySelector('[aria-selected="true"]')?.focus(), 0);
  }

  async function switchResumeVersion(nextId) {
    if (!nextId || nextId === activeResumeId) return closeResumeVersionMenu();
    profile = collectProfile();
    await persistActiveProfile();
    activeResumeId = nextId;
    profile = activeResume().profile;
    await setStorage({ [KEYS.activeProfile]: activeResumeId, [KEYS.profile]: profile });
    closeResumeVersionMenu();
    renderProfile();
    showToast(`已切换到「${activeResume().title}」`);
  }

  function experienceHtml(section, config, item = {}, index = 0) {
    const defaultTitle = `${config.title} ${index + 1}`;
    return `<article class="experience-card" data-experience="${section}" data-index="${index}">
      <div class="experience-head"><label class="experience-title-control"><span>本条标题</span><input class="experience-title-input" data-exp-title value="${escapeHtml(item._title || defaultTitle)}" placeholder="${escapeHtml(defaultTitle)}" maxlength="60" aria-label="自定义${escapeHtml(defaultTitle)}标题"></label><button data-remove-experience="${section}:${index}">删除</button></div>
      <div class="fields-grid">${config.fields.map(field => {
        const wide = /职责|描述/.test(field) ? 'wide' : '';
        return `<label class="${wide}">${field}${wide
          ? `<textarea rows="3" data-exp-field="${field}">${escapeHtml(item[field] || '')}</textarea>`
          : `<input data-exp-field="${field}" value="${escapeHtml(item[field] || '')}">`}</label>`;
      }).join('')}</div>
    </article>`;
  }

  function customFieldHtml(key = '', value = '') {
    return `<div class="experience-card" data-custom-row style="margin:0;display:grid;grid-template-columns:1fr 2fr auto;gap:8px;align-items:end;">
      <label>字段名<input data-custom-key value="${escapeHtml(key)}" placeholder="例如：作品集"></label>
      <label>内容<input data-custom-value value="${escapeHtml(value)}"></label>
      <button class="icon-btn" data-remove-custom type="button">×</button>
    </div>`;
  }

  function sectionFromResume(text, aliases) {
    const lines = text.split(/\n+/).map(line => line.trim()).filter(Boolean);
    const allHeadings = ['教育经历', '教育背景', '实习经历', '工作经历', '项目经历', '校园经历', '校内经历', '社会实践', '志愿经历', '荣誉成果', '荣誉奖项', '获奖经历', '技能', '证书', '自我评价'];
    const start = lines.findIndex(line => aliases.some(alias => line.includes(alias)));
    if (start < 0) return '';
    const collected = [];
    for (let index = start + 1; index < lines.length; index += 1) {
      if (allHeadings.some(heading => lines[index].includes(heading))) break;
      collected.push(lines[index]);
    }
    return collected.join('\n').slice(0, 1600);
  }

  async function parseResumePdf(file) {
    showToast('正在本机解析 PDF…');
    if (!globalThis.extractResumePdfText) await import('./pdf-parser.js');
    const text = await globalThis.extractResumePdfText(file);
    if (text.replace(/\s/g, '').length < 20) throw new Error('未读取到足够文字；扫描版 PDF 暂时需要先转为可复制文字');
    profile = collectProfile();
    const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0];
    const phone = text.match(/(?:\+?86[- ]?)?1[3-9]\d{9}/)?.[0];
    const firstLine = text.split(/\n+/).map(line => line.trim()).find(line => /^[\u4e00-\u9fa5·]{2,10}$/.test(line));
    if (firstLine && !profile.basic['姓名']) profile.basic['姓名'] = firstLine;
    if (phone && !profile.basic['手机']) profile.basic['手机'] = phone.replace(/\D/g, '').slice(-11);
    if (email && !profile.basic['邮箱']) profile.basic['邮箱'] = email;
    const sections = {
      education: ['教育经历', '教育背景'], experience: ['实习经历', '工作经历'], projects: ['项目经历'],
      campus: ['校园经历', '校内经历'], social: ['社会实践', '志愿经历'], honors: ['荣誉成果', '荣誉奖项', '获奖经历']
    };
    Object.entries(sections).forEach(([section, aliases]) => {
      const raw = sectionFromResume(text, aliases);
      if (!raw) return;
      const config = profile.moduleConfig[section];
      if (!config.fields.includes('解析原文（待核对）')) config.fields.push('解析原文（待核对）');
      const lines = raw.split('\n').filter(Boolean);
      const leadFields = {
        education: ['学校', '专业'], experience: ['单位', '岗位'], projects: ['项目名称', '角色'],
        campus: ['组织 / 社团', '担任职务'], social: ['实践名称', '担任角色'], honors: ['荣誉名称', '奖项级别']
      }[section];
      const parsedItem = { '解析原文（待核对）': raw };
      leadFields.forEach((field, index) => { if (lines[index]) parsedItem[field] = lines[index]; });
      if (profile[section].some(item => Object.values(item).some(Boolean))) profile[section].push(parsedItem);
      else profile[section] = [parsedItem];
    });
    profile.pdfReviewRequired = true;
    await persistActiveProfile();
    renderProfile();
    showToast('PDF 已填入当前岗位版本，请逐项核对');
  }

  function collectProfile() {
    const next = normalizeProfile(profile);
    next.basic = {};
    next.custom = {};
    next.basicTitle = $('[data-basic-title]')?.value.trim() || '基本与联系信息';
    $$('[data-basic-key]').forEach(input => { next.basic[input.dataset.basicKey] = input.value.trim(); });
    Object.keys(PROFILE_SCHEMAS).forEach(section => {
      const config = next.moduleConfig[section];
      config.title = $(`[data-module-title="${section}"]`)?.value.trim() || PROFILE_SCHEMAS[section].title;
      next[section] = $$(`[data-experience="${section}"]`).map(card => {
        const item = {};
        const defaultTitle = `${config.title} ${Number(card.dataset.index) + 1}`;
        const customTitle = card.querySelector('[data-exp-title]')?.value.trim();
        if (customTitle && customTitle !== defaultTitle) item._title = customTitle;
        card.querySelectorAll('[data-exp-field]').forEach(input => { item[input.dataset.expField] = input.value.trim(); });
        return item;
      });
    });
    $$('[data-custom-row]').forEach(row => {
      const key = row.querySelector('[data-custom-key]').value.trim();
      const value = row.querySelector('[data-custom-value]').value.trim();
      if (key) next.custom[key] = value;
    });
    return next;
  }

  function moduleLabel(section, targetProfile = profile) {
    if (section === 'basic') return targetProfile.basicTitle || '基本与联系信息';
    return targetProfile.moduleConfig?.[section]?.title || PROFILE_SCHEMAS[section]?.title || '经历模块';
  }

  function renderReusePreview() {
    const source = resumeProfiles.find(item => item.id === $('#reuseSourceSelect').value);
    if (!source) return;
    const sourceProfile = normalizeProfile(source.profile);
    const preview = $('#reuseModulePreview');
    if (reuseSection === 'basic') {
      const filled = Object.values(sourceProfile.basic).filter(Boolean).length;
      preview.innerHTML = `<strong>${escapeHtml(source.title)}</strong>${escapeHtml(moduleLabel('basic', sourceProfile))} · ${filled} 个已填写字段`;
      return;
    }
    const entries = sourceProfile[reuseSection] || [];
    const filledEntries = entries.filter(item => Object.values(item).some(Boolean)).length;
    preview.innerHTML = `<strong>${escapeHtml(source.title)}</strong>${escapeHtml(moduleLabel(reuseSection, sourceProfile))} · ${filledEntries ? `${filledEntries} 条已填写经历` : '1 条空白模板'}`;
  }

  function switchView(view) {
    currentView = view;
    $$('.view').forEach(node => node.classList.toggle('active', node.id === `${view}View`));
    $$('.nav-item').forEach(node => node.classList.toggle('active', node.dataset.view === view));
    $('#pageTitle').textContent = ({ records: '今天有哪些面试需要处理？', profile: '上传一次简历，之后投递一键填充', safety: '备份与恢复，让版本更新不丢数据' })[view];
    location.hash = view;
  }

  function openRecordDialog(record = null) {
    $('#recordDialogTitle').textContent = record ? '编辑岗位' : '新增岗位';
    $('#recordId').value = record?.id || '';
    $('#companyInput').value = record?.jobName || record?.company || '';
    $('#positionInput').value = record?.position || '';
    $('#dateInput').value = record?.applicationDate || localDate();
    $('#recordStage').value = record?.stage || '已投递';
    $('#scheduleInput').value = record?.deadlineAt || record?.scheduleAt || '';
    $('#urlInput').value = record?.url || '';
    $('#notesInput').value = record?.notes || '';
    $('#recordDialog').showModal();
    setTimeout(() => $('#companyInput').focus(), 30);
  }

  async function saveRecordFromDialog() {
    const id = $('#recordId').value || crypto.randomUUID();
    const existing = records.find(item => item.id === id);
    const record = {
      ...JobDetails.normalize(existing || {}),
      id,
      jobName: $('#companyInput').value.trim(),
      position: $('#positionInput').value.trim(),
      applicationDate: $('#dateInput').value || localDate(),
      stage: $('#recordStage').value,
      deadlineAt: $('#scheduleInput').value,
      url: $('#urlInput').value.trim(),
      notes: $('#notesInput').value.trim(),
      updatedAt: Date.now()
    };
    if (!record.jobName || !record.position) return showToast('请填写岗位名称和投递岗位');
    if (existing && existing.stage !== record.stage) {
      const nextStage = record.stage;
      const nextDeadline = record.deadlineAt;
      record.stage = existing.stage;
      record.deadlineAt = existing.deadlineAt;
      JobDetails.transition(record, nextStage, { deadlineAt: nextDeadline });
    }
    if (existing) records = records.map(item => item.id === id ? record : item);
    else records.unshift(record);
    await setStorage({ [KEYS.records]: records });
    $('#recordDialog').close();
    renderRecords();
    showToast(existing ? '投递记录已更新' : '投递记录已保存');
  }

  async function exportBackup() {
    profile = currentView === 'profile' ? collectProfile() : profile;
    await persistActiveProfile();
    const resumeFiles = await JobResumeFiles.exportFiles(records);
    const payload = { schema: 4, statusCatalogVersion: 1, exportedAt: new Date().toISOString(), records, profile, profiles: resumeProfiles, activeProfile: activeResumeId, statuses, resumeFiles };
    const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `job-route-backup-${localDate()}.json`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    showToast('完整备份已导出');
  }

  async function importBackup(file) {
    const parsed = JSON.parse(await file.text());
    if (!parsed || ![1, 2, 3, 4].includes(parsed.schema) || !Array.isArray(parsed.records) || typeof parsed.profile !== 'object') throw new Error('备份格式不兼容');
    if (parsed.schema === 4) await JobResumeFiles.importFiles(parsed);
    if (Array.isArray(parsed.statuses) && parsed.statuses.length) statuses = [...new Set(parsed.statuses.map(String))];
    if (parsed.statusCatalogVersion !== 1) includeAssessmentStatus();
    records = parsed.records.map(normalizeRecord);
    resumeProfiles = Array.isArray(parsed.profiles) && parsed.profiles.length ? parsed.profiles.map(item => ({ ...item, profile: normalizeProfile(item.profile) })) : [{ id: crypto.randomUUID(), title: '通用简历', profile: normalizeProfile(parsed.profile) }];
    activeResumeId = resumeProfiles.some(item => item.id === parsed.activeProfile) ? parsed.activeProfile : resumeProfiles[0].id;
    profile = activeResume().profile;
    await setStorage({ [KEYS.records]: records, [KEYS.profile]: profile, [KEYS.profiles]: resumeProfiles, [KEYS.activeProfile]: activeResumeId, [KEYS.statuses]: statuses });
    renderStatusControls();
    renderRecords();
    renderProfile();
    showToast(`已恢复 ${records.length} 条投递记录`);
  }

  function parseOcrText(text) {
    const jobName = text.match(/(?:公司|单位|企业|岗位名称)\s*[:：]?\s*([^\n]{2,30})/i)?.[1]?.trim() || '';
    const position = text.match(/(?:岗位|职位|应聘)\s*[:：]?\s*([^\n]{2,40})/i)?.[1]?.trim() || '';
    const date = text.match(/(20\d{2})[年.\/-](\d{1,2})[月.\/-](\d{1,2})/) || [];
    const stage = statuses.find(item => text.includes(item)) || (/AI面试/i.test(text) ? 'AI面试' : (/面试/.test(text) ? '一面' : (/笔试|测评/.test(text) ? '笔试' : '已投递')));
    return { jobName, position, date: date[1] ? `${date[1]}-${date[2].padStart(2, '0')}-${date[3].padStart(2, '0')}` : localDate(), stage };
  }

  async function addBlankRecord(seed = {}) {
    const record = normalizeRecord({
      id: crypto.randomUUID(),
      jobName: seed.jobName || '',
      url: seed.url || '',
      position: seed.position || '',
      stage: seed.stage || statuses[0] || '已投递',
      applicationDate: seed.applicationDate || localDate(),
      deadlineAt: seed.deadlineAt || '',
      notes: seed.notes || '',
      updatedAt: Date.now()
    });
    records.push(record);
    await setStorage({ [KEYS.records]: records });
    $('#searchInput').value = '';
    $('#stageFilter').value = '';
    renderRecords();
    const companyInput = [...$('#recordsBody').querySelectorAll('[data-field="jobName"]')].find(input => input.dataset.recordId === record.id);
    companyInput?.scrollIntoView({ block: 'center', inline: 'nearest' });
    companyInput?.focus({ preventScroll: true });
    showToast('已新增一行，可直接填写公司和岗位');
  }

  function renderStatusControls() {
    const activeFilter = $('#stageFilter').value;
    const activeUpcomingFilter = $('#upcomingStageFilter').value || '__action__';
    $('#stageFilter').innerHTML = `<option value="">全部阶段</option>${statuses.map(status => `<option ${status === activeFilter ? 'selected' : ''}>${escapeHtml(status)}</option>`).join('')}`;
    $('#upcomingStageFilter').innerHTML = `<option value="__action__">需要处理</option>${statuses.map(status => `<option value="${escapeHtml(status)}">${escapeHtml(status)} · ${records.filter(record => record.stage === status).length}</option>`).join('')}`;
    $('#upcomingStageFilter').value = statuses.includes(activeUpcomingFilter) ? activeUpcomingFilter : '__action__';
    $('#recordStage').innerHTML = statuses.map(status => `<option>${escapeHtml(status)}</option>`).join('');
    renderStatusEditor();
  }

  function renderStatusEditor() {
    $('#statusEditorList').innerHTML = statuses.map((status, index) => {
      const count = records.filter(record => record.stage === status).length;
      return `<div class="status-editor-item" data-status-name="${escapeHtml(status)}"><button type="button" class="status-drag-handle" data-status-drag aria-label="拖动 ${escapeHtml(status)} 调整顺序" title="上下拖动；也可按方向键调整">⠿</button><span class="status-editor-name">${escapeHtml(status)} <small>${count} 个岗位</small></span><div class="status-order-actions"><button type="button" data-status-move="-1" aria-label="上移 ${escapeHtml(status)}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" data-status-move="1" aria-label="下移 ${escapeHtml(status)}" ${index === statuses.length - 1 ? 'disabled' : ''}>↓</button><button type="button" data-delete-status="${escapeHtml(status)}" ${statuses.length <= 1 ? 'disabled' : ''}>删除</button></div></div>`;
    }).join('');
  }

  function setupStatusSorting() {
    const list = $('#statusEditorList');
    let drag = null, saving = false;
    async function commitOrder(next, focusName) {
      if (saving || next.every((name, index) => name === statuses[index])) return;
      const previous = [...statuses], scroll = list.scrollTop;
      saving = true;
      statuses = next;
      try {
        await setStorage({ [KEYS.statuses]: statuses });
        renderStatusControls();
        renderRecords();
        $('#statusSortHint').textContent = '顺序已自动保存，所有状态选项已同步。';
      } catch {
        statuses = previous;
        renderStatusControls();
        showToast('顺序保存失败，请重试');
      } finally {
        saving = false;
        list.scrollTop = scroll;
        [...list.children].find(row => row.dataset.statusName === focusName)?.querySelector('[data-status-drag]').focus({ preventScroll: true });
      }
    }
    function move(name, delta) {
      const from = statuses.indexOf(name), to = from + delta;
      if (from < 0 || to < 0 || to >= statuses.length || saving || drag) return;
      const next = [...statuses];
      next.splice(to, 0, next.splice(from, 1)[0]);
      commitOrder(next, name);
    }
    list.addEventListener('click', event => {
      const button = event.target.closest('[data-status-move]');
      if (button) move(button.closest('[data-status-name]').dataset.statusName, Number(button.dataset.statusMove));
    });
    list.addEventListener('keydown', event => {
      if (event.key === 'Escape' && drag) { event.preventDefault(); event.stopPropagation(); finish(true); return; }
      if (!event.target.closest('[data-status-drag]') || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      move(event.target.closest('[data-status-name]').dataset.statusName, event.key === 'ArrowUp' ? -1 : 1);
    });
    list.addEventListener('pointerdown', event => {
      const handle = event.target.closest('[data-status-drag]');
      if (!handle || event.button !== 0 || saving) return;
      event.preventDefault();
      handle.focus();
      drag = { row: handle.closest('[data-status-name]'), id: event.pointerId, startY: event.clientY, moved: false };
      list.setPointerCapture(event.pointerId);
    });
    list.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.id) return;
      if (!drag.moved && Math.abs(event.clientY - drag.startY) < 5) return;
      drag.moved = true;
      drag.row.classList.add('status-is-dragging');
      const bounds = list.getBoundingClientRect();
      if (event.clientY < bounds.top + 28) list.scrollTop -= 18;
      if (event.clientY > bounds.bottom - 28) list.scrollTop += 18;
      const next = [...list.children].find(row => row !== drag.row && event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2);
      list.insertBefore(drag.row, next || null);
    });
    function finish(cancelled) {
      if (!drag) return;
      const current = drag;
      drag = null;
      if (list.hasPointerCapture(current.id)) list.releasePointerCapture(current.id);
      current.row.classList.remove('status-is-dragging');
      if (cancelled) renderStatusEditor();
      else if (current.moved) commitOrder([...list.children].map(row => row.dataset.statusName), current.row.dataset.statusName);
    }
    list.addEventListener('pointerup', () => finish(false));
    list.addEventListener('pointercancel', () => finish(true));
    list.addEventListener('lostpointercapture', () => finish(true));
    $('#statusDialog').addEventListener('close', () => finish(true));
  }

  async function addStatus() {
    const input = $('#newStatusInput');
    const name = input.value.trim();
    if (!name) return showToast('请输入状态名称');
    if (statuses.includes(name)) return showToast('这个状态已经存在');
    statuses.push(name);
    await setStorage({ [KEYS.statuses]: statuses });
    input.value = '';
    renderStatusControls();
    renderRecords();
    showToast(`已添加状态「${name}」`);
  }

  async function deleteStatus(name) {
    if (statuses.length <= 1) return showToast('至少需要保留一个投递状态');
    const used = records.filter(record => record.stage === name).length;
    if (used && !confirm(`「${name}」正在被 ${used} 个岗位使用。删除后，这些岗位将改为「已投递」。继续吗？`)) return;
    statuses = statuses.filter(status => status !== name);
    const fallback = statuses.includes('已投递') ? '已投递' : statuses[0];
    records.forEach(record => { if (record.stage === name) JobDetails.transition(record, fallback, { note: '原状态已移除，调整为当前状态。' }); });
    await setStorage({ [KEYS.statuses]: statuses, [KEYS.records]: records });
    renderStatusControls();
    renderRecords();
    showToast(`状态「${name}」已删除`);
  }

  async function runOcr() {
    if (!selectedOcrFile || !globalThis.Tesseract) return showToast('本地识别组件未加载');
    const button = $('#runOcrBtn');
    button.disabled = true;
    $('#ocrProgress').classList.remove('hidden');
    try {
      const root = globalThis.chrome?.runtime?.getURL ? chrome.runtime.getURL('ocr/') : new URL('./ocr/', location.href).href;
      const worker = await Tesseract.createWorker('chi_sim', 1, {
        workerPath: `${root}worker.min.js`,
        corePath: `${root}core`,
        langPath: `${root}lang`,
        workerBlobURL: false,
        logger(message) {
          const progress = Math.round((Number(message.progress) || 0) * 100);
          $('#ocrProgressBar').style.width = `${progress}%`;
          $('#ocrStatus').textContent = `${message.status || '正在识别'} · ${progress}%`;
        }
      });
      const result = await worker.recognize(selectedOcrFile);
      await worker.terminate();
      $('#ocrRawText').value = result.data.text || '';
      $('#ocrRawText').classList.remove('hidden');
      $('#ocrToRecordBtn').classList.remove('hidden');
      button.classList.add('hidden');
      $('#ocrStatus').textContent = '识别完成，请先核对文字';
    } catch (error) {
      console.error(error);
      showToast('识别失败，请换一张更清晰的截图');
      button.disabled = false;
    }
  }

  function bindEvents() {
    setupDeadlinePicker();
    setupStatusSorting();
    $$('.nav-item').forEach(button => button.addEventListener('click', () => switchView(button.dataset.view)));
    $$('[data-add-record]').forEach(button => button.addEventListener('click', () => addBlankRecord()));
    $('#searchInput').addEventListener('input', renderRecords);
    $('#stageFilter').addEventListener('change', renderRecords);
    $('#upcomingStageFilter').addEventListener('change', renderUpcoming);
    $('#manageStatusesBtn').addEventListener('click', () => {
      renderStatusEditor();
      $('#statusDialog').showModal();
      setTimeout(() => $('#newStatusInput').focus(), 30);
    });
    $$('[data-close-status]').forEach(button => button.addEventListener('click', () => $('#statusDialog').close()));
    $('#addStatusBtn').addEventListener('click', addStatus);
    $('#newStatusInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); addStatus(); }
    });
    $('#statusEditorList').addEventListener('click', event => {
      const button = event.target.closest('[data-delete-status]');
      if (button) deleteStatus(button.dataset.deleteStatus);
    });
    $('#resetStatusesBtn').addEventListener('click', async () => {
      if (!confirm('恢复默认状态后，自定义状态会被删除；相关岗位将改为“已投递”。继续吗？')) return;
      const defaults = new Set(DEFAULT_STATUSES);
      records.forEach(record => { if (!defaults.has(record.stage)) JobDetails.transition(record, '已投递', { note: '恢复默认状态后调整。' }); });
      statuses = [...DEFAULT_STATUSES];
      await setStorage({ [KEYS.statuses]: statuses, [KEYS.records]: records });
      renderStatusControls();
      renderRecords();
      showToast('已恢复默认投递状态');
    });
    $('#recordForm').addEventListener('submit', event => { event.preventDefault(); saveRecordFromDialog(); });
    $$('[data-close-record]').forEach(button => button.addEventListener('click', () => $('#recordDialog').close()));

    $('#recordsBody').addEventListener('input', event => {
      const input = event.target.closest('[data-field="jobName"]');
      if (!input) return;
      const record = records.find(item => item.id === input.dataset.recordId);
      if (!record) return;
      record.jobName = input.value.trim();
      record.updatedAt = Date.now();
      setStorage({ [KEYS.records]: records }).catch(() => showToast('公司名称保存失败，请重试'));
    });
    $('#recordsBody').addEventListener('change', async event => {
      const input = event.target.closest('[data-record-id][data-field]');
      if (!input) return;
      const record = records.find(item => item.id === input.dataset.recordId);
      if (!record) return;
      if (input.dataset.field === 'stage') JobDetails.transition(record, input.value.trim());
      else record[input.dataset.field] = input.value.trim();
      record.updatedAt = Date.now();
      await setStorage({ [KEYS.records]: records });
      if (input.dataset.field === 'jobName') {
        // Keep the clicked detail button mounted while a name edit loses focus.
        $('#recordsBody').querySelectorAll('[data-record-row]').forEach(row => {
          const item = records.find(r => r.id === row.dataset.recordRow);
          const key = item && companyKey(item);
          const count = key ? records.filter(r => companyKey(r) === key).length : 1;
          row.classList.toggle('same-company-row', count > 1);
          row.querySelector('.company-count-badge')?.remove();
          if (count > 1) {
            const badge = document.createElement('span');
            badge.className = 'company-count-badge';
            badge.textContent = `同司 · ${count} 岗`;
            badge.title = `同一公司共投递 ${count} 个岗位`;
            row.querySelector('.company-cell').append(badge);
          }
        });
        renderUpcoming();
      } else renderRecords();
      showToast('修改已自动保存');
    });

    $('#recordsBody').addEventListener('click', async event => {
      const deadlineTrigger = event.target.closest('[data-open-deadline]');
      if (deadlineTrigger) {
        openDeadlinePicker(deadlineTrigger.dataset.openDeadline, deadlineTrigger);
        return;
      }
      const deleteId = event.target.closest('[data-delete]')?.dataset.delete;
      if (deleteId && confirm('删除这条投递记录？')) {
        records = records.filter(item => item.id !== deleteId);
        await setStorage({ [KEYS.records]: records });
        renderRecords();
        showToast('投递记录已删除');
      }
    });

    $('#routeStrip').addEventListener('click', event => {
      const button = event.target.closest('[data-route-stage]');
      if (!button) return;
      $('#stageFilter').value = button.dataset.routeStage;
      renderRecords();
    });

    $('#profileEditor').addEventListener('click', event => {
      const add = event.target.closest('[data-add-experience]');
      const remove = event.target.closest('[data-remove-experience]');
      const reuse = event.target.closest('[data-reuse-section]');
      if (add) {
        profile = collectProfile();
        profile[add.dataset.addExperience].push({});
        renderProfile();
      }
      if (remove) {
        profile = collectProfile();
        const [section, index] = remove.dataset.removeExperience.split(':');
        profile[section].splice(Number(index), 1);
        if (!profile[section].length) profile[section].push({});
        renderProfile();
      }
      if (reuse) {
        const sources = resumeProfiles.filter(item => item.id !== activeResumeId);
        if (!sources.length) return showToast('请先新建另一个岗位简历版本');
        profile = collectProfile();
        activeResume().profile = profile;
        reuseSection = reuse.dataset.reuseSection;
        $('#reuseModuleTitle').textContent = `沿用「${moduleLabel(reuseSection)}」`;
        $('#reuseSourceSelect').innerHTML = sources.map(item => `<option value="${item.id}">${escapeHtml(item.title)}</option>`).join('');
        renderReusePreview();
        $('#reuseModuleDialog').showModal();
      }
    });
    $('#profileEditor').addEventListener('change', async event => {
      if (!event.target.matches('[data-exp-title]')) return;
      profile = collectProfile();
      await persistActiveProfile();
      showToast('本条经历标题已保存');
    });
    $('#reuseSourceSelect').addEventListener('change', renderReusePreview);
    $$('[data-close-reuse]').forEach(button => button.addEventListener('click', () => $('#reuseModuleDialog').close()));
    $('#reuseModuleForm').addEventListener('submit', async event => {
      event.preventDefault();
      const source = resumeProfiles.find(item => item.id === $('#reuseSourceSelect').value);
      if (!source || !reuseSection) return;
      profile = collectProfile();
      const sourceProfile = normalizeProfile(source.profile);
      if (reuseSection === 'basic') {
        profile.basic = clone(sourceProfile.basic);
        profile.basicTitle = sourceProfile.basicTitle;
      } else {
        profile[reuseSection] = clone(sourceProfile[reuseSection]);
        profile.moduleConfig[reuseSection] = clone(sourceProfile.moduleConfig[reuseSection]);
      }
      await persistActiveProfile();
      $('#reuseModuleDialog').close();
      renderProfile();
      showToast(`已沿用「${source.title}」中的${moduleLabel(reuseSection)}`);
    });
    $('#saveProfileBtn').addEventListener('click', async () => {
      profile = collectProfile();
      await persistActiveProfile();
      renderProfile();
      showToast('当前岗位简历已保存并同步到网页侧栏');
    });
    $('#resumeVersionTrigger').addEventListener('click', toggleResumeVersionMenu);
    $('#resumeVersionMenu').addEventListener('click', event => {
      const option = event.target.closest('[data-resume-version]');
      if (option) switchResumeVersion(option.dataset.resumeVersion);
    });
    $('#resumeVersionMenu').addEventListener('keydown', event => {
      const options = $$('[data-resume-version]');
      const index = options.indexOf(document.activeElement);
      if (event.key === 'ArrowDown') { event.preventDefault(); options[(index + 1) % options.length]?.focus(); }
      if (event.key === 'ArrowUp') { event.preventDefault(); options[(index - 1 + options.length) % options.length]?.focus(); }
      if (event.key === 'Escape') { event.preventDefault(); closeResumeVersionMenu(); $('#resumeVersionTrigger').focus(); }
    });
    document.addEventListener('click', event => {
      if (!event.target.closest('#resumeVersionPicker')) closeResumeVersionMenu();
    });
    $('#resumeVersionSelect').addEventListener('change', event => switchResumeVersion(event.target.value));
    $('#resumeTitleInput').addEventListener('change', async event => {
      const active = activeResume();
      active.title = event.target.value.trim() || '未命名岗位简历';
      profile = collectProfile();
      await persistActiveProfile();
      renderProfile();
    });
    $('#resumeTitleInput').addEventListener('input', event => {
      $('#resumeVersionTriggerLabel').textContent = event.target.value.trim() || '未命名岗位简历';
    });
    $('#resumeTitleInput').addEventListener('keydown', event => {
      if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); }
    });
    $('#newResumeVersionBtn').addEventListener('click', () => {
      $('#newResumeTitleInput').value = '';
      $('#resumeVersionDialog').showModal();
      setTimeout(() => $('#newResumeTitleInput').focus(), 30);
    });
    $$('[data-close-resume-version]').forEach(button => button.addEventListener('click', () => $('#resumeVersionDialog').close()));
    $('#resumeVersionForm').addEventListener('submit', async event => {
      event.preventDefault();
      profile = collectProfile();
      const title = $('#newResumeTitleInput').value.trim();
      if (!title) return;
      const copy = normalizeProfile(clone(profile));
      copy.pdfReviewRequired = false;
      const item = { id: crypto.randomUUID(), title, profile: copy };
      resumeProfiles.push(item);
      activeResumeId = item.id;
      profile = item.profile;
      $('#resumeTitleInput').value = item.title;
      await persistActiveProfile();
      $('#resumeVersionDialog').close();
      renderProfile();
      showToast(`已创建「${item.title}」，可独立修改`);
    });
    $('#deleteResumeVersionBtn').addEventListener('click', async () => {
      if (resumeProfiles.length <= 1) return showToast('至少保留一个简历版本');
      if (!confirm(`确认删除「${activeResume().title}」？此操作不可撤销。`)) return;
      resumeProfiles = resumeProfiles.filter(item => item.id !== activeResumeId);
      activeResumeId = resumeProfiles[0].id;
      profile = activeResume().profile;
      $('#resumeTitleInput').value = activeResume().title;
      await persistActiveProfile();
      renderProfile();
      showToast('岗位简历版本已删除');
    });
    $('#resumePdfFile').addEventListener('change', async event => {
      const file = event.target.files[0];
      try { if (file) await parseResumePdf(file); }
      catch (error) { showToast(error.message || '无法解析这个 PDF'); }
      event.target.value = '';
    });
    $('#confirmPdfReviewBtn').addEventListener('click', async () => {
      profile = collectProfile();
      profile.pdfReviewRequired = false;
      await persistActiveProfile();
      $('#pdfReviewNotice').classList.add('hidden');
      showToast('已标记为人工检查完成');
    });

    $('#exportBtn').addEventListener('click', async () => {
      try { await exportBackup(); } catch (error) { showToast(error.message || '导出失败，请重试'); }
    });
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', async event => {
      try { if (event.target.files[0]) await importBackup(event.target.files[0]); }
      catch (error) { showToast(error.message || '无法导入这个文件'); }
      event.target.value = '';
    });
    $('#clearBtn').addEventListener('click', async () => {
      if (!confirm('确认清空简历资料和全部投递记录？此操作不可撤销。')) return;
      await clearStorage();
      records = [];
      profile = normalizeProfile(EMPTY_PROFILE);
      resumeProfiles = [{ id: crypto.randomUUID(), title: '通用简历', profile }];
      activeResumeId = resumeProfiles[0].id;
      statuses = [...DEFAULT_STATUSES];
      renderStatusControls();
      renderRecords();
      renderProfile();
      showToast('本机数据已清空');
    });

    $('#openOcrBtn').addEventListener('click', () => $('#ocrDialog').showModal());
    $('#ocrFile').addEventListener('change', event => {
      selectedOcrFile = event.target.files[0] || null;
      if (!selectedOcrFile) return;
      $('#ocrPreview').src = URL.createObjectURL(selectedOcrFile);
      $('#ocrPreview').classList.remove('hidden');
      $('#dropPrompt').classList.add('hidden');
      $('#runOcrBtn').disabled = false;
    });
    $('#runOcrBtn').addEventListener('click', runOcr);
    $('#ocrToRecordBtn').addEventListener('click', () => {
      const parsed = parseOcrText($('#ocrRawText').value);
      $('#ocrDialog').close();
      addBlankRecord({
        jobName: parsed.jobName,
        position: parsed.position,
        applicationDate: parsed.date,
        stage: parsed.stage,
        notes: $('#ocrRawText').value.trim()
      });
    });
  }

  async function init() {
    await loadState();
    renderStatusControls();
    renderRecords();
    renderProfile();
    bindEvents();
    const details = JobDetails.mount({
      records: () => records,
      profiles: () => resumeProfiles,
      activeProfileId: () => activeResumeId,
      statuses: () => statuses,
      save: () => setStorage({ [KEYS.records]: records }),
      render: renderRecords
    });
    if (phaseOnePreview) {
      const banner = document.createElement('div');
      banner.className = 'jd-preview-banner';
      banner.innerHTML = '<span>第一批功能预览 · 使用独立示例数据，可自由编辑体验</span><a href="dashboard.html#records">返回我的看板</a>';
      $('#recordsView').prepend(banner);
    }
    const hash = location.hash.replace('#', '');
    switchView(['records', 'profile', 'safety'].includes(hash) ? hash : 'records');
    if (phaseOnePreview && currentView === 'records' && records.length) details.open(records[0].id);
  }

  init();
})();
