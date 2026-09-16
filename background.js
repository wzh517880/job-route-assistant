const KEYS = {
  records: 'jobRoute.records.v1',
  profile: 'jobRoute.profile.v1',
  profiles: 'jobRoute.profiles.v2',
  activeProfile: 'jobRoute.activeProfile.v2',
  statuses: 'jobRoute.statuses.v1'
};

const DEFAULT_STATUSES = ['已投递', '简历筛选', '待测评', 'AI面试', '笔试', '一面', '二面', '三面', 'hr面', 'offer', '已挂'];
const EMPTY_PROFILE = {
  basic: { '姓名': '', '手机': '', '邮箱': '', '微信': '', '性别': '', '出生日期': '', '现居地': '', '求职意向': '', '身份证号': '', '自我评价': '' },
  education: [{}], experience: [{}], projects: [{}], campus: [{}], social: [{}], honors: [{}],
  custom: {}, basicTitle: '基本与联系信息', moduleConfig: {}, pdfReviewRequired: false
};

function localDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function demoRecord() {
  return {
    id: crypto.randomUUID(),
    jobName: '星航科技（示例）',
    position: '产品经理实习生',
    applicationDate: localDate(),
    stage: '已投递',
    url: 'https://example.com/careers',
    deadlineAt: '',
    notes: '这是一条示例记录，可直接修改或删除。',
    updatedAt: Date.now()
  };
}

async function ensureAppState() {
  const saved = await chrome.storage.local.get(Object.values(KEYS));
  const next = {};
  let profiles = Array.isArray(saved[KEYS.profiles]) ? saved[KEYS.profiles] : [];
  if (!profiles.length) {
    const profile = saved[KEYS.profile] || clone(EMPTY_PROFILE);
    const id = crypto.randomUUID();
    profiles = [{ id, title: '通用简历', profile }];
    next[KEYS.profiles] = profiles;
    next[KEYS.activeProfile] = id;
    next[KEYS.profile] = profile;
  }
  const activeId = profiles.some(item => item.id === saved[KEYS.activeProfile]) ? saved[KEYS.activeProfile] : profiles[0].id;
  if (activeId !== saved[KEYS.activeProfile]) next[KEYS.activeProfile] = activeId;
  if (!saved[KEYS.profile]) next[KEYS.profile] = profiles.find(item => item.id === activeId)?.profile || clone(EMPTY_PROFILE);
  if (!Array.isArray(saved[KEYS.records])) next[KEYS.records] = [demoRecord()];
  else if (saved[KEYS.records].length && saved[KEYS.records].every(item => !String(item?.jobName || item?.company || '').trim() && !String(item?.position || '').trim() && !String(item?.url || item?.applicationUrl || '').trim())) next[KEYS.records] = [demoRecord()];
  if (!Array.isArray(saved[KEYS.statuses]) || !saved[KEYS.statuses].length) next[KEYS.statuses] = DEFAULT_STATUSES;
  if (Object.keys(next).length) await chrome.storage.local.set(next);
  return chrome.storage.local.get(Object.values(KEYS));
}

async function openDashboard(hash = '') {
  const base = chrome.runtime.getURL('dashboard.html');
  const url = `${base}${hash}`;
  const tabs = await chrome.tabs.query({});
  const existing = tabs.find(tab => tab.url?.startsWith(base));
  if (existing?.id) {
    await chrome.tabs.update(existing.id, { active: true, url });
    if (existing.windowId) await chrome.windows.update(existing.windowId, { focused: true });
  } else {
    await chrome.tabs.create({ url });
  }
}

chrome.runtime.onInstalled.addListener(() => ensureAppState());

chrome.action.onClicked.addListener(() => openDashboard('#records'));

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (message?.type === 'OPEN_DASHBOARD') {
    openDashboard(message.hash || '#records').then(() => respond({ ok: true })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'GET_APP_STATE') {
    ensureAppState().then(saved => respond({
      ok: true,
      profiles: saved[KEYS.profiles] || [],
      activeProfile: saved[KEYS.activeProfile] || '',
      statuses: saved[KEYS.statuses] || DEFAULT_STATUSES
    })).catch(error => respond({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'SET_ACTIVE_PROFILE') {
    (async () => {
      const saved = await ensureAppState();
      const profiles = saved[KEYS.profiles] || [];
      const active = profiles.find(item => item.id === message.profileId);
      if (!active) return respond({ ok: false, error: '简历版本不存在' });
      await chrome.storage.local.set({ [KEYS.activeProfile]: active.id, [KEYS.profile]: active.profile });
      respond({ ok: true, profile: active.profile });
    })().catch(error => respond({ ok: false, error: error.message }));
    return true;
  }

  if (message?.type === 'SAVE_RECORD') {
    (async () => {
      const saved = await chrome.storage.local.get(KEYS.records);
      const records = Array.isArray(saved[KEYS.records]) ? saved[KEYS.records] : [];
      const incoming = message.record || {};
      const canonicalUrl = String(incoming.url || '').split('#')[0];
      const duplicateIndex = records.findIndex(item => {
        const sameUrl = canonicalUrl && String(item.url || '').split('#')[0] === canonicalUrl;
        const sameRole = (item.jobName || item.company) === (incoming.jobName || incoming.company) && item.position === incoming.position;
        return sameUrl || sameRole;
      });
      const record = {
        id: duplicateIndex >= 0 ? records[duplicateIndex].id : crypto.randomUUID(),
        jobName: String(incoming.jobName || incoming.company || '待确认岗位').trim(),
        position: String(incoming.position || '待确认岗位').trim(),
        applicationDate: String(incoming.applicationDate || localDate()),
        stage: String(incoming.stage || '已投递'),
        url: canonicalUrl,
        deadlineAt: String(incoming.deadlineAt || incoming.scheduleAt || ''),
        notes: String(incoming.notes || ''),
        updatedAt: Date.now()
      };
      if (duplicateIndex >= 0) records.splice(duplicateIndex, 1, { ...records[duplicateIndex], ...record });
      else records.push(record);
      await chrome.storage.local.set({ [KEYS.records]: records });
      respond({ ok: true, record, updated: duplicateIndex >= 0 });
    })().catch(error => respond({ ok: false, error: error.message }));
    return true;
  }
});
