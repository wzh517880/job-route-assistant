/* 岗位详情、进度时间线与独立简历快照。 */
(() => {
  'use strict';
  const copy = value => JSON.parse(JSON.stringify(value));
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const localTime = (date = new Date()) => new Date(date - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const stamp = value => String(value || '').replace('T', ' ');
  const fields = { city: '', salary: '', channel: '', priority: '待了解', jd: '', hrContact: '', meetingUrl: '', location: '', preparation: '' };
  function normalize(record) {
    return {
      details: { ...fields, ...(record.details || {}) },
      history: Array.isArray(record.history) ? copy(record.history) : [],
      resumeSnapshots: Array.isArray(record.resumeSnapshots) ? copy(record.resumeSnapshots) : []
    };
  }
  function ensureHistory(record) {
    if (!Array.isArray(record.history)) record.history = [];
    if (!record.history.length) record.history.push({ id: crypto.randomUUID(), stage: record.stage, at: localTime(), deadlineAt: record.deadlineAt || '', note: '从当前状态开始记录；此前流程未记录。' });
  }
  function transition(record, stage, options = {}) {
    ensureHistory(record);
    if (record.stage === stage) return false;
    record.history[record.history.length - 1].deadlineAt = record.deadlineAt || '';
    record.history.push({ id: crypto.randomUUID(), stage, at: options.at || localTime(), deadlineAt: options.deadlineAt || '', note: options.note || '' });
    record.stage = stage;
    record.deadlineAt = options.deadlineAt || '';
    record.updatedAt = Date.now();
    return true;
  }
  function demo() {
    const at = (delta, hour = 14) => { const date = new Date(); date.setDate(date.getDate() + delta); date.setHours(hour, 0, 0, 0); return localTime(date); };
    const profile = { basic: { 姓名: '林晓（示例）', 邮箱: 'linxiao@example.com', 求职意向: '产品运营 / 用户增长', 自我评价: '善于通过用户访谈与数据分析定位问题，具备内容策划和跨团队协作经验。' }, education: [{ 学校: '示例大学', 专业: '信息管理', 学历: '本科', 开始时间: '2023-09', 结束时间: '2027-06' }], experience: [{ title: '内容运营实习', 单位: '青禾工作室（示例）', 岗位: '运营实习生', 岗位职责: '参与用户访谈，整理反馈与需求清单；协助制定内容选题，并复盘阅读和转化数据。' }], projects: [{ 项目名称: '校园活动报名体验优化', 角色: '项目负责人', 项目描述: '梳理报名流程，组织可用性测试，推动表单与信息说明优化。' }] };
    return {
      profiles: [{id:'phase1-resume-operations', title:'产品运营版', profile}, {id:'phase1-resume-general', title:'通用简历', profile:copy(profile)}],
      records: [{ id: 'phase1-company', jobName: '星航科技（功能示例）', position: '产品运营实习生', stage: '一面', applicationDate: at(-7).slice(0,10), deadlineAt: at(2), url: 'https://example.com/careers', notes: '面试后整理问题，第二天补充复盘。', updatedAt: Date.now(),
        details: { ...fields, city: '上海 · 徐汇', salary: '200–250 元 / 天', channel: '公司官网', priority: '优先考虑', jd: '岗位职责\n1. 参与用户调研，整理需求与反馈。\n2. 协助策划产品内容与增长活动。\n3. 跟踪活动数据，提出迭代建议。\n\n岗位要求\n熟悉基础数据分析；表达清晰，具备主动沟通能力；每周可实习 4 天，持续 3 个月以上。', hrContact: '陈女士 · hr@example.com（示例）', meetingUrl: 'https://example.com/interview', location: '线上视频面试', preparation: '准备 1 分钟自我介绍\n梳理用户访谈项目与内容运营经历\n准备 2 个向面试官提问的问题' },
        history: [{id:'demo-h1', stage:'已投递', at:at(-7), deadlineAt:'', note:'通过官网投递产品运营版简历。'}, {id:'demo-h2', stage:'笔试', at:at(-4), deadlineAt:at(-3,18), note:'完成用户增长案例题，已提交答卷。'}, {id:'demo-h3', stage:'一面', at:at(-1), deadlineAt:at(2), note:'收到一面邀请，预计 45 分钟，重点准备项目经历。'}],
        resumeSnapshots: [{id:'demo-snapshot', sourceId:'phase1-resume-operations', title:'产品运营版', capturedAt:at(-7), usedAt:at(-7).slice(0,10), profile:copy(profile)}]
      }]
    };
  }
  function mount(api) {
    let recordId = '', tab = 'info', opener = null;
    const drawer = document.createElement('dialog');
    drawer.className = 'job-drawer';
    drawer.id = 'jobDetailsDrawer';
    drawer.setAttribute('aria-labelledby', 'jdTitle');
    drawer.innerHTML = `<header class="jd-header"><div class="jd-topline"><span class="jd-eyebrow">岗位档案</span><button class="jd-close" data-jd-close aria-label="关闭岗位详情">关闭 ×</button></div><div class="jd-titleline"><div><h2 id="jdTitle"></h2><p id="jdPosition"></p></div><span class="jd-stage" id="jdStage"></span></div><div class="jd-summary" id="jdSummary"></div><nav class="jd-tabs" role="tablist" aria-label="岗位档案内容"><button id="jd-tab-info" role="tab" data-jd-tab="info" aria-controls="jd-info">岗位资料</button><button id="jd-tab-timeline" role="tab" data-jd-tab="timeline" aria-controls="jd-timeline">进度时间线 <small id="jdHistoryCount"></small></button><button id="jd-tab-resume" role="tab" data-jd-tab="resume" aria-controls="jd-resume">简历留档 <small id="jdSnapshotCount"></small></button></nav></header><div class="jd-scroll"><section id="jd-info" class="jd-panel" role="tabpanel" aria-labelledby="jd-tab-info"></section><section id="jd-timeline" class="jd-panel" role="tabpanel" aria-labelledby="jd-tab-timeline"></section><section id="jd-resume" class="jd-panel" role="tabpanel" aria-labelledby="jd-tab-resume"></section></div><footer class="jd-footer"><span id="jdSaveState" role="status">资料修改后自动保存</span><button class="jd-secondary" data-jd-close>完成并关闭</button></footer>`;
    document.body.append(drawer);
    const $ = selector => drawer.querySelector(selector);
    const record = () => api.records().find(item => item.id === recordId);
    function input(label, key, value, wide = false, type = 'text') {
      return `<label class="${wide ? 'wide' : ''}">${label}<input data-jd-field="${key}" type="${type}" value="${esc(value)}"></label>`;
    }
    function area(label, key, value, rows = 4) {
      return `<label class="jd-label">${label}<textarea data-jd-field="${key}" rows="${rows}">${esc(value)}</textarea></label>`;
    }
    function options(values, selected) { return values.map(value => `<option value="${esc(value)}" ${value === selected ? 'selected' : ''}>${esc(value)}</option>`).join(''); }
    function header() {
      const r = record();
      $('#jdTitle').textContent = r.jobName || '未命名公司';
      $('#jdPosition').textContent = r.position || '待填写岗位';
      $('#jdStage').textContent = r.stage;
      $('#jdSummary').innerHTML = `<span>投递于 ${esc(r.applicationDate)}</span><span>${r.deadlineAt ? '当前 DDL · ' + esc(stamp(r.deadlineAt)) : '当前阶段未设置 DDL'}</span>`;
      $('#jdHistoryCount').textContent = r.history.length;
      $('#jdSnapshotCount').textContent = r.resumeSnapshots.length;
    }
    function selectTab(next) {
      tab = next;
      drawer.querySelectorAll('[data-jd-tab]').forEach(button => { const active = button.dataset.jdTab === tab; button.setAttribute('aria-selected', String(active)); button.tabIndex = active ? 0 : -1; });
      drawer.querySelectorAll('.jd-panel').forEach(panel => panel.hidden = panel.id !== `jd-${tab}`);
      $('.jd-scroll').scrollTop = 0;
    }
    async function persist() {
      record().updatedAt = Date.now();
      $('#jdSaveState').textContent = '正在保存…';
      try { await api.save(); header(); $('#jdSaveState').textContent = '已保存到当前浏览器'; }
      catch { $('#jdSaveState').textContent = '保存失败，请重试'; throw new Error('本地保存失败'); }
    }
    function renderInfo() {
      const r = record(), d = r.details;
      $('#jd-info').innerHTML = `<div class="jd-card"><h3>岗位概况</h3><div class="jd-grid">${input('公司 / 招聘项目','jobName',r.jobName)}${input('投递岗位','position',r.position)}${input('工作城市','city',d.city)}${input('薪资范围','salary',d.salary)}${input('投递渠道','channel',d.channel)}<label>意向等级<select data-jd-field="priority">${options(['待了解','优先考虑','正常推进','备选'],d.priority)}</select></label>${input('投递链接','url',r.url,true,'url')}${input('投递日期','applicationDate',r.applicationDate,false,'date')}</div></div><div class="jd-card"><h3>岗位描述 · JD</h3>${area('粘贴原始职责与要求，方便面试前回看','jd',d.jd,7)}</div><div class="jd-card"><h3>面试与联系</h3><div class="jd-grid">${input('HR 联系方式','hrContact',d.hrContact,true)}${input('面试链接','meetingUrl',d.meetingUrl,true,'url')}${input('面试地点 / 方式','location',d.location,true)}</div></div><div class="jd-card"><h3>准备与备注</h3>${area('准备事项','preparation',d.preparation)}<div style="margin-top:16px">${area('补充备注','notes',r.notes,3)}</div></div>`;
    }
    function renderTimeline() {
      const r = record();
      $('#jd-timeline').innerHTML = `<div class="jd-card"><h3>推进到下一阶段</h3><p class="jd-help">记录新的进展，并为新阶段设置 DDL。上一轮的日期和备注会保留。</p><div class="jd-grid"><label>新状态<select id="jdNextStage">${options(api.statuses(),r.stage)}</select></label><label>进展时间<input type="datetime-local" id="jdEventAt" value="${localTime()}" required></label><label class="wide">新阶段 DDL（可选）<input type="datetime-local" id="jdNextDeadline"></label><label class="wide">面试复盘<textarea id="jdEventNote" rows="2" placeholder="记录面试问题、自己的回答、待改进的地方和下一轮准备事项"></textarea></label></div><div style="text-align:right;margin-top:15px"><button class="jd-primary" data-jd-advance>记录新进展</button></div></div><div class="jd-card"><div class="jd-section-head"><h3 style="margin:0">已记录的求职过程</h3><span class="jd-help" style="margin:0">最近记录在前</span></div><ol class="jd-timeline">${[...r.history].reverse().map(event => `<li><div class="jd-event-head"><div><strong>${esc(event.stage)}</strong><time>${esc(stamp(event.at))}</time></div><button class="jd-text-btn" data-jd-edit-event="${esc(event.id)}">编辑记录</button></div>${event.deadlineAt ? `<span class="jd-event-deadline">该轮 DDL · ${esc(stamp(event.deadlineAt))}</span>` : ''}${event.note ? `<p class="jd-event-note">${esc(event.note)}</p>` : ''}<div class="jd-event-edit" data-jd-editor="${esc(event.id)}" hidden><p class="jd-help">修正这条历史记录的时间和面试复盘。当前投递状态保持不变。</p><div class="jd-grid"><label>记录时间<input data-history-at type="datetime-local" value="${esc(event.at)}"></label><label>该轮 DDL<input data-history-deadline type="datetime-local" value="${esc(event.deadlineAt)}"></label><label class="wide">面试复盘<textarea data-history-note rows="3">${esc(event.note)}</textarea></label></div><div class="jd-inline" style="margin-top:12px"><button class="jd-text-btn" data-jd-cancel-event>取消</button><button class="jd-secondary" data-jd-save-event="${esc(event.id)}">保存修正</button></div></div></li>`).join('')}</ol></div>`;
    }
    function snapshotBody(profile) {
      const labels = {basic:profile.basicTitle || '基本与联系信息',education:'教育经历',experience:'实习 / 工作经历',projects:'项目经历',campus:'校园经历',social:'社会实践',honors:'荣誉成果',custom:'补充信息'};
      return Object.entries(labels).map(([section,label]) => {
        const blocks = Array.isArray(profile[section]) ? profile[section] : [profile[section] || {}];
        const body = blocks.map(block => {
          const rows = Object.entries(block).filter(([key,value]) => !['title','_title'].includes(key) && value != null && String(value).trim());
          if (!rows.length) return '';
          return `${block._title || block.title ? `<h4>${esc(block._title || block.title)}</h4>` : ''}<dl>${rows.map(([key,value])=>`<div><dt>${esc(key)}</dt><dd>${esc(value)}</dd></div>`).join('')}</dl>`;
        }).join('');
        return body ? `<h4>${esc(profile.moduleConfig?.[section]?.title || label)}</h4>${body}` : '';
      }).join('') || '<p class="jd-help">这份简历尚未填写内容。</p>';
    }
    function renderResume() {
      const r = record();
      $('#jd-resume').innerHTML = `<div class="jd-card"><h3>保存本次投递使用的简历</h3><p class="jd-help">上传实际投递的简历原文件，保存在当前浏览器中，之后可下载查看。支持 PDF、Word 和图片；导出 JSON 备份时会一并包含原文件。</p><label class="jd-upload"><span class="jd-upload-icon" aria-hidden="true">↑</span><strong>上传简历文件</strong><span>PDF / Word（.doc、.docx）/ 图片 · 单个文件不超过 20 MB</span><input id="jdResumeFile" type="file" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp,.gif,.bmp,.avif" aria-label="上传简历文件"><small id="jdSelectedFile" role="status">点击选择文件</small></label><label class="jd-label" style="margin-top:18px">实际使用日期<input type="date" id="jdResumeUsedAt" value="${esc(r.applicationDate)}"></label><div style="text-align:right;margin-top:15px"><button class="jd-primary" data-jd-capture>保存简历文件</button></div></div><div id="jdSnapshots">${r.resumeSnapshots.length ? [...r.resumeSnapshots].reverse().map(s=>`<article class="jd-card jd-snapshot"><div class="jd-section-head"><h3>${esc(s.name || s.title)}</h3><span class="jd-stage">${s.fileId ? '原文件留档' : '历史快照'}</span></div><time>投递使用 · ${esc(s.usedAt)}<br>留档时间 · ${esc(stamp(s.capturedAt))}</time>${s.fileId ? `<p class="jd-help">${esc((s.name || '').split('.').pop().toUpperCase())} · ${Math.max(1,Math.round((s.size || 0)/1024))} KB</p><button class="jd-secondary" data-jd-download="${esc(s.fileId)}">下载原文件</button>` : `<details><summary>查看当时的完整简历</summary><div class="jd-snapshot-body">${snapshotBody(s.profile || {})}</div></details>`}</article>`).join('') : '<div class="jd-card jd-empty">还没有简历留档<br>上传实际投递的 PDF、Word 或图片，保存一份原文件。</div>'}</div>`;
    }
    async function open(id, target) {
      recordId = id; opener = target;
      const r = record(); if (!r) return;
      Object.assign(r, normalize(r));
      const missing = !r.history.length;
      ensureHistory(r);
      header(); renderInfo(); renderTimeline(); renderResume(); selectTab('info');
      $('#jdSaveState').textContent = '资料修改后自动保存';
      drawer.showModal();
      if (missing) await persist();
    }
    async function saveField(event) {
      const key = event.target.dataset.jdField;
      if (!key) return;
      const r = record();
      const holder = key in fields ? r.details : r;
      if (holder[key] === event.target.value) return;
      holder[key] = event.target.value;
      try { await persist(); } catch { /* 留在抽屉中，用户可以重试 */ }
    }
    drawer.addEventListener('input', saveField);
    drawer.addEventListener('change', saveField);
    drawer.addEventListener('change', event => {
      if (event.target.id !== 'jdResumeFile') return;
      const file = event.target.files[0];
      try {
        if (file) JobResumeFiles.validate(file);
        $('#jdSelectedFile').textContent = file ? `已选择：${file.name} · ${Math.max(1,Math.round(file.size/1024))} KB` : '点击选择文件';
      } catch (error) {
        event.target.value = '';
        $('#jdSelectedFile').textContent = error.message;
      }
    });
    drawer.addEventListener('click', async event => {
      const target = event.target.closest('button');
      if (!target) return;
      if (target.hasAttribute('data-jd-close')) { drawer.close(); return; }
      if (target.dataset.jdTab) { selectTab(target.dataset.jdTab); return; }
      const r = record();
      if (target.dataset.jdEditEvent) {
        const editor = target.closest('li').querySelector('.jd-event-edit'); editor.hidden = !editor.hidden; return;
      }
      if (target.hasAttribute('data-jd-cancel-event')) { target.closest('.jd-event-edit').hidden = true; return; }
      target.disabled = true;
      try {
        if (target.hasAttribute('data-jd-advance')) {
          const stage = $('#jdNextStage').value;
          if (stage === r.stage) { $('#jdSaveState').textContent = '请选择一个不同的新状态；补充当前轮次请点击编辑记录'; return; }
          if (!$('#jdEventAt').value) { $('#jdSaveState').textContent = '请选择进展时间'; return; }
          transition(r, stage, { at:$('#jdEventAt').value, deadlineAt:$('#jdNextDeadline').value, note:$('#jdEventNote').value.trim() });
          await persist(); renderTimeline();
        }
        if (target.dataset.jdSaveEvent) {
          const editor = target.closest('.jd-event-edit');
          const entry = r.history.find(item => item.id === target.dataset.jdSaveEvent);
          const at = editor.querySelector('[data-history-at]').value;
          if (!at) { $('#jdSaveState').textContent = '请选择记录时间'; return; }
          entry.at = at;
          entry.deadlineAt = editor.querySelector('[data-history-deadline]').value;
          entry.note = editor.querySelector('[data-history-note]').value.trim();
          if (entry.id === r.history[r.history.length-1].id) r.deadlineAt = entry.deadlineAt;
          await persist(); renderTimeline();
        }
        if (target.hasAttribute('data-jd-capture')) {
          const file = $('#jdResumeFile').files[0];
          if (!file) { $('#jdSaveState').textContent = '请先选择简历 PDF、Word 或图片'; return; }
          const usedAt = $('#jdResumeUsedAt').value;
          if (!usedAt) { $('#jdSaveState').textContent = '请选择实际使用日期'; return; }
          $('#jdSaveState').textContent = '正在保存简历原文件…';
          const stored = await JobResumeFiles.save(file);
          const snapshot = {id:crypto.randomUUID(),title:file.name,capturedAt:localTime(),usedAt,...stored};
          r.resumeSnapshots.push(snapshot);
          try { await api.save(); }
          catch (error) { r.resumeSnapshots = r.resumeSnapshots.filter(s => s.id !== snapshot.id); await JobResumeFiles.remove(stored.fileId); throw error; }
          if (recordId === r.id) { header(); renderResume(); $('#jdSaveState').textContent = '简历原文件已保存'; }
        }
        if (target.dataset.jdDownload) {
          await JobResumeFiles.download(target.dataset.jdDownload);
          $('#jdSaveState').textContent = '已开始下载原文件';
        }
      } catch (error) { $('#jdSaveState').textContent = error.message || '保存失败，请重试'; }
      finally { target.disabled = false; }
    });
    drawer.addEventListener('keydown', event => {
      if (!event.target.matches('[data-jd-tab]') || !['ArrowLeft','ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const tabs = ['info','timeline','resume'];
      selectTab(tabs[(tabs.indexOf(tab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3]);
      $(`[data-jd-tab="${tab}"]`).focus();
    });
    drawer.addEventListener('close', () => { api.render(); if (opener?.isConnected) opener.focus(); else document.querySelector(`[data-open-job="${CSS.escape(recordId)}"]`)?.focus(); });
    document.addEventListener('click', event => { const target = event.target.closest('[data-open-job]'); if (target) open(target.dataset.openJob,target); });
    return { open };
  }
  window.JobDetails = { normalize, transition, demo, mount };
})();
