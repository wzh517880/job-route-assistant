/* 原文件存入本地 IndexedDB，JSON 备份包含文件内容。 */
(() => {
  'use strict';
  const TYPES = { pdf:'application/pdf', doc:'application/msword', docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document', png:'image/png', jpg:'image/jpeg', jpeg:'image/jpeg', webp:'image/webp', gif:'image/gif', bmp:'image/bmp', avif:'image/avif' };
  const LIMIT = 20 * 1024 * 1024;
  let database;
  function validate(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!TYPES[ext]) throw new Error('请选择 PDF、Word（doc / docx）或常见图片文件');
    if (!file.size) throw new Error('文件为空，请重新选择');
    if (file.size > LIMIT) throw new Error('单个文件不能超过 20 MB');
    return TYPES[ext];
  }
  function db() {
    if (!database) database = new Promise((resolve,reject) => {
      const demo = new URLSearchParams(location.search).get('preview') === 'phase1';
      const request = indexedDB.open(demo ? 'jobRoute.phase1Demo.files' : 'jobRoute.resumeFiles', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('files', {keyPath:'id'});
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => { database = null; reject(new Error('无法打开本地文件存储')); };
    });
    return database;
  }
  async function write(entries) {
    const database = await db();
    return new Promise((resolve,reject) => {
      const tx = database.transaction('files','readwrite');
      entries.forEach(entry => tx.objectStore('files').put(entry));
      tx.oncomplete = resolve;
      tx.onerror = () => reject(new Error('本地存储空间不足或保存失败，请导出备份后重试'));
      tx.onabort = () => reject(new Error('文件保存中断，请重试'));
    });
  }
  async function get(id) {
    const database = await db();
    return new Promise((resolve,reject) => {
      const request = database.transaction('files','readonly').objectStore('files').get(id);
      request.onsuccess = () => request.result ? resolve(request.result) : reject(new Error('找不到原文件，请重新上传或导入包含附件的备份'));
      request.onerror = () => reject(new Error('读取原文件失败'));
    });
  }
  async function save(file) {
    const mime = validate(file), id = crypto.randomUUID();
    await write([{id, name:file.name, mime, blob:file.slice(0,file.size,mime)}]);
    return {fileId:id, name:file.name, size:file.size, mime};
  }
  async function remove(id) {
    const database = await db();
    return new Promise((resolve,reject) => {
      const tx = database.transaction('files','readwrite');
      if (id) tx.objectStore('files').delete(id); else tx.objectStore('files').clear();
      tx.oncomplete = resolve;
      tx.onerror = () => reject(new Error('清理本地附件失败'));
    });
  }
  async function download(id) {
    const entry = await get(id), url = URL.createObjectURL(entry.blob);
    const link = document.createElement('a');
    link.href = url; link.download = entry.name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }
  function dataUrl(blob) {
    return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('文件读取失败')); reader.readAsDataURL(blob); });
  }
  function fileIds(records) { return [...new Set(records.flatMap(r => (r.resumeSnapshots || []).filter(s => s.fileId).map(s => s.fileId)))]; }
  async function exportFiles(records) {
    const entries = [];
    for (const id of fileIds(records)) { const entry = await get(id); entries.push({id,name:entry.name,mime:entry.mime,dataUrl:await dataUrl(entry.blob)}); }
    return entries;
  }
  async function importFiles(payload) {
    const incoming = new Map((payload.resumeFiles || []).map(entry => [entry.id,entry]));
    const mapping = new Map(), entries = [];
    for (const id of fileIds(payload.records)) {
      const entry = incoming.get(id);
      if (!entry || typeof entry.dataUrl !== 'string') throw new Error('备份缺少简历附件，无法完整恢复');
      const match = entry.dataUrl.match(/^data:[^,]*;base64,([A-Za-z0-9+/=\r\n]+)$/);
      if (!match || match[1].length > LIMIT * 1.4) throw new Error('备份附件格式或大小不正确');
      const bytes = Uint8Array.from(atob(match[1]), c => c.charCodeAt(0));
      const mime = validate({name:String(entry.name),size:bytes.length});
      const nextId = crypto.randomUUID();
      mapping.set(id,nextId);
      entries.push({id:nextId,name:entry.name,mime,blob:new Blob([bytes],{type:mime})});
    }
    if (entries.length) await write(entries);
    payload.records.forEach(r => (r.resumeSnapshots || []).forEach(s => { if (s.fileId) s.fileId = mapping.get(s.fileId); }));
  }
  window.JobResumeFiles = {validate,save,get,download,exportFiles,importFiles,remove};
})();
