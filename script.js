pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
const { PDFDocument, degrees } = PDFLib;

/* ============== NAVIGATION ============== */
const views = ['home','tools','about'];
function goTo(viewName, opts){
  opts = opts || {};
  views.forEach(v=>{
    document.getElementById('view-'+v).classList.toggle('active', v===viewName);
  });
  document.querySelectorAll('.nav-link').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.nav===viewName);
  });
  if(viewName === 'tools'){
    const openMerge = opts.openTool === 'merge';
    const openSplit = opts.openTool === 'split';
    const openCompress = opts.openTool === 'compress';
    document.getElementById('tools-grid-wrap').style.display = (openMerge || openSplit || openCompress) ? 'none' : 'block';
    document.getElementById('merge-tool').style.display = openMerge ? 'block' : 'none';
    document.getElementById('split-tool').style.display = openSplit ? 'block' : 'none';
    document.getElementById('compress-tool').style.display = openCompress ? 'block' : 'none';
    actionBar.style.display = (openMerge && state.pages.length) ? 'flex' : 'none';
  } else {
    actionBar.style.display = 'none';
  }
  window.scrollTo({ top:0, behavior:'instant' in window ? 'instant' : 'auto' });
}
document.querySelectorAll('[data-nav]').forEach(el=>{
  el.addEventListener('click', ()=>{
    goTo(el.dataset.nav, { openTool: el.dataset.openTool });
  });
});
document.querySelectorAll('[data-open-tool]').forEach(el=>{
  if(el.dataset.nav) return; // already handled above
  el.addEventListener('click', ()=> goTo('tools', { openTool: el.dataset.openTool }));
});
document.getElementById('backToTools').addEventListener('click', ()=> goTo('tools', {}));
document.getElementById('splitBackToTools').addEventListener('click', ()=> goTo('tools', {}));

const state = { docs: [], pages: [], dragUid: null, dragDocId: null };
const palette = ['#0ea5e9','#f59e0b','#8b5cf6','#10b981','#ef4444','#6366f1'];
let docColorIdx = 0;
let uidCounter = 0;

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const workspace = document.getElementById('workspace');
const srcList = document.getElementById('srcList');
const srcCount = document.getElementById('srcCount');
const pageGrid = document.getElementById('pageGrid');
const actionBar = document.getElementById('actionBar');
const actionSummary = document.getElementById('actionSummary');
const mergeBtn = document.getElementById('mergeBtn');
const headerStats = document.getElementById('headerStats');
const pageCountLabel = document.getElementById('pageCountLabel');
const toast = document.getElementById('toast');
const addMoreBtn = document.getElementById('addMoreBtn');

function showToast(msg, isError){
  toast.textContent = msg;
  toast.classList.toggle('error', !!isError);
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(()=> toast.classList.remove('show'), 3200);
}
function fmtSize(bytes){
  if(bytes < 1024) return bytes + ' B';
  if(bytes < 1024*1024) return (bytes/1024).toFixed(0) + ' KB';
  return (bytes/(1024*1024)).toFixed(1) + ' MB';
}
function escapeHtml(s){
  return s.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

dropzone.addEventListener('click', ()=> fileInput.click());
addMoreBtn.addEventListener('click', ()=> fileInput.click());
['dragenter','dragover'].forEach(evt => dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.add('drag'); }));
['dragleave','drop'].forEach(evt => dropzone.addEventListener(evt, e=>{ e.preventDefault(); dropzone.classList.remove('drag'); }));
dropzone.addEventListener('drop', e=>{
  const files = [...e.dataTransfer.files].filter(f=> f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  if(files.length) handleFiles(files);
  else showToast("That doesn't look like a PDF — try another file.", true);
});
fileInput.addEventListener('change', e=>{ handleFiles([...e.target.files]); fileInput.value = ''; });

async function handleFiles(files){
  if(!files.length) return;
  dropzone.style.display = 'none';
  workspace.style.display = 'grid';
  actionBar.style.display = 'flex';

  for(const file of files){
    const docId = 'doc' + Date.now() + Math.random().toString(36).slice(2,7);
    const color = palette[docColorIdx % palette.length]; docColorIdx++;
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const docEntry = { id: docId, name: file.name, size: file.size, bytes, color, numPages: 0 };
    state.docs.push(docEntry);
    renderSourceList();

    let pdfjsDoc;
    try{
      pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
    }catch(err){
      showToast(`Couldn't read "${file.name}" — it may be damaged or password protected.`, true);
      state.docs = state.docs.filter(d=> d.id !== docId);
      renderSourceList();
      continue;
    }
    docEntry.numPages = pdfjsDoc.numPages;
    docEntry.pdfjsDoc = pdfjsDoc;
    renderSourceList();

    for(let i=1; i<=pdfjsDoc.numPages; i++){
      const uid = 'p' + (uidCounter++);
      state.pages.push({ uid, docId, pageIndex: i-1, dataUrl:null, included:true, rotation:0, loading:true });
    }
    renderGrid();

    for(let i=1; i<=pdfjsDoc.numPages; i++){
      const pageObj = state.pages.find(p=> p.docId===docId && p.pageIndex === i-1);
      renderThumbnail(pdfjsDoc, i, pageObj);
    }
  }
  updateSummary();
}

async function renderThumbnail(pdfjsDoc, pageNum, pageObj){
  try{
    const page = await pdfjsDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = 320;
    const scale = targetWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    pageObj.dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    pageObj.loading = false;
    updateCardThumb(pageObj);
  }catch(err){
    pageObj.loading = false;
    pageObj.error = true;
    updateCardThumb(pageObj);
  }
}

/* ---------- sources list (draggable to reorder files) ---------- */
function renderSourceList(){
  srcCount.textContent = `(${state.docs.length})`;
  srcList.innerHTML = state.docs.map((d, idx) => `
    <div class="src-card" draggable="true" data-doc-id="${d.id}">
      <span class="src-handle" title="Drag to reorder file">
        <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>
      </span>
      <span class="order-num">${idx+1}</span>
      <div class="dot" style="background:${d.color}"></div>
      <div class="meta">
        <div class="fname" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
        <div class="fsub">${d.numPages || '…'} pages · ${fmtSize(d.size)}</div>
      </div>
    </div>
  `).join('');
  headerStats.innerHTML = state.docs.length ? `<span><b>${state.docs.length}</b> file${state.docs.length===1?'':'s'}</span>` : '';
  attachSourceListeners();
}

function attachSourceListeners(){
  srcList.querySelectorAll('.src-card').forEach(card=>{
    const docId = card.dataset.docId;
    card.addEventListener('dragstart', (e)=>{
      state.dragDocId = docId;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', ()=>{
      card.classList.remove('dragging');
      srcList.querySelectorAll('.src-card').forEach(c=> c.classList.remove('drop-before'));
    });
    card.addEventListener('dragover', (e)=>{
      e.preventDefault();
      if(docId === state.dragDocId) return;
      srcList.querySelectorAll('.src-card').forEach(c=> c.classList.remove('drop-before'));
      card.classList.add('drop-before');
    });
    card.addEventListener('dragleave', ()=> card.classList.remove('drop-before'));
    card.addEventListener('drop', (e)=>{
      e.preventDefault();
      card.classList.remove('drop-before');
      const fromId = state.dragDocId;
      const toId = docId;
      if(!fromId || fromId === toId) return;
      const fromIdx = state.docs.findIndex(d=> d.id===fromId);
      const toIdx = state.docs.findIndex(d=> d.id===toId);
      if(fromIdx===-1 || toIdx===-1) return;
      const [moved] = state.docs.splice(fromIdx, 1);
      state.docs.splice(toIdx, 0, moved);
      state.dragDocId = null;
      regroupPagesByDocOrder();
      renderSourceList();
      renderGrid();
      showToast('File order updated — pages regrouped to match.');
    });
  });
}

function regroupPagesByDocOrder(){
  const newPages = [];
  state.docs.forEach(d=>{
    state.pages.filter(p=> p.docId === d.id).forEach(p=> newPages.push(p));
  });
  state.pages = newPages;
}

/* ---------- page grid ---------- */
function renderGrid(){
  pageGrid.innerHTML = state.pages.map((p, idx) => cardHtml(p, idx)).join('');
  attachCardListeners();
  updateSummary();
}

function cardHtml(p, idx){
  const doc = state.docs.find(d=> d.id === p.docId);
  const inner = p.loading
    ? `<div class="spinner"></div>`
    : (p.error
        ? `<span style="color:#dc4545; font-size:11px; padding:8px; text-align:center;">Couldn't render</span>`
        : `<img src="${p.dataUrl}" style="transform:rotate(${p.rotation}deg);" draggable="false">`);
  return `
    <div class="page-card ${p.included ? '' : 'excluded'}" draggable="true" data-uid="${p.uid}">
      <span class="src-tag" style="background:${doc ? doc.color : '#888'}"></span>
      <div class="card-top">
        <span class="order-badge">${String(idx+1).padStart(2,'0')}</span>
        <span class="drag-handle" draggable="false" title="Drag to reorder">
          <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="6" r="1.6"/><circle cx="16" cy="6" r="1.6"/><circle cx="8" cy="12" r="1.6"/><circle cx="16" cy="12" r="1.6"/><circle cx="8" cy="18" r="1.6"/><circle cx="16" cy="18" r="1.6"/></svg>
        </span>
      </div>
      <label class="select-wrap">
        <input type="checkbox" data-action="toggle" draggable="false" ${p.included ? 'checked' : ''}>
        include in merge
      </label>
      <div class="thumb-wrap">${inner}</div>
      <div class="page-footer">
        <span class="page-num">Page ${idx+1}</span>
        <div class="page-controls">
          <button class="icon-btn" data-action="rotate" draggable="false" title="Rotate 90°">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3-6.7M21 3v5h-5"/></svg>
          </button>
          <button class="icon-btn danger" data-action="remove" draggable="false" title="Remove page">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
          </button>
        </div>
      </div>
    </div>
  `;
}

function updateCardThumb(pageObj){
  const wrap = pageGrid.querySelector(`[data-uid="${pageObj.uid}"] .thumb-wrap`);
  if(!wrap) return;
  if(pageObj.error){
    wrap.innerHTML = `<span style="color:#dc4545; font-size:11px; padding:8px; text-align:center;">Couldn't render</span>`;
  }else{
    wrap.innerHTML = `<img src="${pageObj.dataUrl}" style="transform:rotate(${pageObj.rotation}deg);" draggable="false">`;
  }
}

function attachCardListeners(){
  pageGrid.querySelectorAll('.page-card').forEach(card=>{
    const uid = card.dataset.uid;
    const checkbox = card.querySelector('[data-action="toggle"]');
    checkbox.addEventListener('click', (e)=> e.stopPropagation());
    checkbox.addEventListener('change', ()=>{
      const p = state.pages.find(p=> p.uid===uid);
      p.included = checkbox.checked;
      card.classList.toggle('excluded', !p.included);
      updateCardThumb(p);
      updateSummary();
    });
    card.querySelector('[data-action="remove"]').addEventListener('click', (e)=>{
      e.stopPropagation();
      state.pages = state.pages.filter(p=> p.uid!==uid);
      renderGrid();
    });
    card.querySelector('[data-action="rotate"]').addEventListener('click', (e)=>{
      e.stopPropagation();
      const p = state.pages.find(p=> p.uid===uid);
      p.rotation = (p.rotation + 90) % 360;
      updateCardThumb(p);
    });
    card.addEventListener('dragstart', (e)=>{
      state.dragUid = uid;
      card.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    card.addEventListener('dragend', ()=>{
      card.classList.remove('dragging');
      pageGrid.querySelectorAll('.page-card').forEach(c=> c.classList.remove('drop-before'));
    });
    card.addEventListener('dragover', (e)=>{
      e.preventDefault();
      if(uid === state.dragUid) return;
      pageGrid.querySelectorAll('.page-card').forEach(c=> c.classList.remove('drop-before'));
      card.classList.add('drop-before');
    });
    card.addEventListener('dragleave', ()=> card.classList.remove('drop-before'));
    card.addEventListener('drop', (e)=>{
      e.preventDefault();
      card.classList.remove('drop-before');
      const fromUid = state.dragUid;
      const toUid = uid;
      if(!fromUid || fromUid === toUid) return;
      const fromIdx = state.pages.findIndex(p=> p.uid===fromUid);
      const toIdx = state.pages.findIndex(p=> p.uid===toUid);
      if(fromIdx === -1 || toIdx === -1) return;
      const [moved] = state.pages.splice(fromIdx, 1);
      state.pages.splice(toIdx, 0, moved);
      state.dragUid = null;
      renderGrid();
    });
  });
}

function updateSummary(){
  const included = state.pages.filter(p=> p.included);
  actionSummary.innerHTML = `<b>${included.length}</b> of ${state.pages.length} pages selected`;
  pageCountLabel.textContent = `${state.pages.length} page${state.pages.length===1?'':'s'} across ${state.docs.length} file${state.docs.length===1?'':'s'} — drag a page handle to reorder`;
  mergeBtn.disabled = included.length === 0;
}

document.getElementById('selectAllBtn').addEventListener('click', ()=>{ state.pages.forEach(p=> p.included = true); renderGrid(); });
document.getElementById('selectNoneBtn').addEventListener('click', ()=>{ state.pages.forEach(p=> p.included = false); renderGrid(); });
document.getElementById('resetBtn').addEventListener('click', ()=>{
  if(!confirm('Start over? This clears every loaded file and page.')) return;
  state.docs = [];
  state.pages = [];
  workspace.style.display = 'none';
  actionBar.style.display = 'none';
  dropzone.style.display = 'block';
  headerStats.innerHTML = '';
});

mergeBtn.addEventListener('click', async ()=>{
  const included = state.pages.filter(p=> p.included);
  if(!included.length) return;
  mergeBtn.disabled = true;
  const originalHtml = mergeBtn.innerHTML;
  mergeBtn.innerHTML = 'Merging…';
  try{
    const outDoc = await PDFDocument.create();
    const libDocCache = {};
    for(const p of included){
      if(!libDocCache[p.docId]){
        const doc = state.docs.find(d=> d.id === p.docId);
        libDocCache[p.docId] = await PDFDocument.load(doc.bytes);
      }
      const srcLibDoc = libDocCache[p.docId];
      const [copied] = await outDoc.copyPages(srcLibDoc, [p.pageIndex]);
      if(p.rotation){
        const base = copied.getRotation().angle || 0;
        copied.setRotation(degrees(base + p.rotation));
      }
      outDoc.addPage(copied);
    }
    const outBytes = await outDoc.save();
    const blob = new Blob([outBytes], { type:'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'merged.pdf';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=> URL.revokeObjectURL(url), 4000);
    showToast(`Merged ${included.length} pages into merged.pdf`);
  }catch(err){
    console.error(err);
    showToast('Something went wrong while merging. Please try again.', true);
  }finally{
    mergeBtn.disabled = false;
    mergeBtn.innerHTML = originalHtml;
  }
});

/* ============== SPLIT TOOL STATE & LOGIC ============== */
const splitState = {
  doc: null,
  pages: [],
  mode: 'range',
  ranges: ''
};

const splitDropzone = document.getElementById('splitDropzone');
const splitFileInput = document.getElementById('splitFileInput');
const splitWorkspace = document.getElementById('splitWorkspace');
const splitPageGrid = document.getElementById('splitPageGrid');
const splitDocLabel = document.getElementById('splitDocLabel');
const splitRangeInput = document.getElementById('splitRangeInput');
const splitRangeError = document.getElementById('splitRangeError');
const splitExecuteBtn = document.getElementById('splitExecuteBtn');
const splitResetBtn = document.getElementById('splitResetBtn');

document.querySelectorAll('input[name="splitMode"]').forEach(input => {
  input.addEventListener('change', (e) => {
    splitState.mode = e.target.value;
    const rangeGroup = document.getElementById('splitRangeGroup');
    if (splitState.mode === 'all') {
      rangeGroup.style.display = 'none';
      splitRangeError.style.display = 'none';
      splitExecuteBtn.disabled = false;
    } else {
      rangeGroup.style.display = 'block';
      validateSplitRange();
    }
  });
});

splitDropzone.addEventListener('click', () => splitFileInput.click());
['dragenter','dragover'].forEach(evt => splitDropzone.addEventListener(evt, e=>{ e.preventDefault(); splitDropzone.classList.add('drag'); }));
['dragleave','drop'].forEach(evt => splitDropzone.addEventListener(evt, e=>{ e.preventDefault(); splitDropzone.classList.remove('drag'); }));
splitDropzone.addEventListener('drop', e=>{
  const files = [...e.dataTransfer.files].filter(f=> f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  if(files.length) handleSplitFile(files[0]);
  else showToast("That doesn't look like a PDF — try another file.", true);
});
splitFileInput.addEventListener('change', e=>{
  if (e.target.files.length) handleSplitFile(e.target.files[0]);
  splitFileInput.value = '';
});

async function handleSplitFile(file) {
  splitDropzone.style.display = 'none';
  splitWorkspace.style.display = 'grid';
  
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  splitState.doc = { name: file.name, size: file.size, bytes, numPages: 0 };
  
  splitDocLabel.innerHTML = `<strong>${escapeHtml(file.name)}</strong> · ${fmtSize(file.size)}`;

  let pdfjsDoc;
  try{
    pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(), verbosity: 0 }).promise;
  }catch(err){
    showToast(`Couldn't read "${file.name}" — it may be damaged or password protected.`, true);
    resetSplitTool();
    return;
  }
  splitState.doc.numPages = pdfjsDoc.numPages;
  splitState.doc.pdfjsDoc = pdfjsDoc;
  splitDocLabel.innerHTML = `<strong>${escapeHtml(file.name)}</strong> · ${pdfjsDoc.numPages} pages · ${fmtSize(file.size)}`;

  splitState.pages = [];
  for(let i=1; i<=pdfjsDoc.numPages; i++){
    const uid = 'sp' + i;
    splitState.pages.push({ uid, pageIndex: i-1, dataUrl: null, loading: true });
  }
  renderSplitGrid();

  for(let i=1; i<=pdfjsDoc.numPages; i++){
    const pageObj = splitState.pages.find(p=> p.pageIndex === i-1);
    renderSplitThumbnail(pdfjsDoc, i, pageObj);
  }
  validateSplitRange();
}

function renderSplitGrid() {
  splitPageGrid.innerHTML = splitState.pages.map((p, idx) => `
    <div class="page-card" data-uid="${p.uid}">
      <div class="card-top">
        <span class="order-badge">${String(idx+1).padStart(2,'0')}</span>
      </div>
      <div class="thumb-wrap" style="aspect-ratio:3/4; margin-top:10px;">
        ${p.loading ? '<div class="spinner"></div>' : `<img src="${p.dataUrl}" draggable="false">`}
      </div>
      <div class="page-footer" style="justify-content:center;">
        <span class="page-num">Page ${idx+1}</span>
      </div>
    </div>
  `).join('');
}

async function renderSplitThumbnail(pdfjsDoc, pageNum, pageObj) {
  try{
    const page = await pdfjsDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = 320;
    const scale = targetWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    pageObj.dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    pageObj.loading = false;
    updateSplitCardThumb(pageObj);
  }catch(err){
    pageObj.loading = false;
    pageObj.error = true;
    updateSplitCardThumb(pageObj);
  }
}

function updateSplitCardThumb(pageObj) {
  const wrap = splitPageGrid.querySelector(`[data-uid="${pageObj.uid}"] .thumb-wrap`);
  if(!wrap) return;
  if(pageObj.error){
    wrap.innerHTML = `<span style="color:#dc4545; font-size:11px; padding:8px; text-align:center;">Couldn't render</span>`;
  }else{
    wrap.innerHTML = `<img src="${pageObj.dataUrl}" draggable="false">`;
  }
}

splitRangeInput.addEventListener('input', (e) => {
  splitState.ranges = e.target.value;
  validateSplitRange();
});

function validateSplitRange() {
  if (splitState.mode === 'all') {
    splitRangeError.style.display = 'none';
    splitExecuteBtn.disabled = !splitState.doc;
    return;
  }
  
  const val = splitRangeInput.value.trim();
  if (!val) {
    splitRangeError.textContent = 'Please enter page ranges.';
    splitRangeError.style.display = 'block';
    splitExecuteBtn.disabled = true;
    return;
  }

  try {
    const groups = parseRanges(val, splitState.doc ? splitState.doc.numPages : 999999);
    if (groups.length === 0) {
      throw new Error('No valid page numbers found.');
    }
    splitRangeError.style.display = 'none';
    splitExecuteBtn.disabled = !splitState.doc;
  } catch (err) {
    splitRangeError.textContent = err.message;
    splitRangeError.style.display = 'block';
    splitExecuteBtn.disabled = true;
  }
}

function parseRanges(rangeStr, maxPages) {
  const parts = rangeStr.split(',');
  const groups = [];
  
  for (let part of parts) {
    part = part.trim();
    if (!part) continue;

    const normalized = part.toLowerCase();
    if (normalized === 'odd') {
      const oddPages = [];
      for (let i = 0; i < maxPages; i++) {
        if ((i + 1) % 2 === 1) oddPages.push(i);
      }
      if (oddPages.length) {
        groups.push(oddPages);
      }
      continue;
    }
    if (normalized === 'even') {
      const evenPages = [];
      for (let i = 0; i < maxPages; i++) {
        if ((i + 1) % 2 === 0) evenPages.push(i);
      }
      if (evenPages.length) {
        groups.push(evenPages);
      }
      continue;
    }
    
    const matchRange = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (matchRange) {
      const start = parseInt(matchRange[1], 10);
      const end = parseInt(matchRange[2], 10);
      if (isNaN(start) || isNaN(end) || start <= 0 || end <= 0) {
        throw new Error(`Invalid range: ${part}`);
      }
      if (start > end) {
        throw new Error(`Start page cannot be greater than end page: ${part}`);
      }
      if (start > maxPages || end > maxPages) {
        throw new Error(`Page range ${part} exceeds total pages (${maxPages})`);
      }
      const group = [];
      for (let i = start; i <= end; i++) {
        group.push(i - 1);
      }
      groups.push(group);
    } else {
      const page = parseInt(part, 10);
      if (isNaN(page) || page <= 0 || !/^\d+$/.test(part)) {
        throw new Error(`Invalid page number: ${part}`);
      }
      if (page > maxPages) {
        throw new Error(`Page ${page} exceeds total pages (${maxPages})`);
      }
      groups.push([page - 1]);
    }
  }
  return groups;
}

splitResetBtn.addEventListener('click', () => {
  resetSplitTool();
});

function resetSplitTool() {
  splitState.doc = null;
  splitState.pages = [];
  splitState.ranges = '';
  splitRangeInput.value = '';
  splitRangeError.style.display = 'none';
  splitExecuteBtn.disabled = true;
  splitWorkspace.style.display = 'none';
  splitDropzone.style.display = 'block';
  splitPageGrid.innerHTML = '';
}

splitExecuteBtn.addEventListener('click', async () => {
  if (!splitState.doc) return;
  splitExecuteBtn.disabled = true;
  const originalHtml = splitExecuteBtn.innerHTML;
  splitExecuteBtn.innerHTML = 'Splitting…';

  try {
    const srcBytes = splitState.doc.bytes;
    const srcLibDoc = await PDFDocument.load(srcBytes);
    const totalPages = splitState.doc.numPages;

    let groups = [];
    if (splitState.mode === 'all') {
      for (let i = 0; i < totalPages; i++) {
        groups.push([i]);
      }
    } else {
      groups = parseRanges(splitRangeInput.value.trim(), totalPages);
    }

    if (groups.length === 0) {
      throw new Error('No pages selected to split.');
    }

    const docBaseName = splitState.doc.name.replace(/\.pdf$/i, '');
    
    if (groups.length === 1) {
      const outDoc = await PDFDocument.create();
      const pageIndices = groups[0];
      const copiedPages = await outDoc.copyPages(srcLibDoc, pageIndices);
      copiedPages.forEach(p => outDoc.addPage(p));
      
      const outBytes = await outDoc.save();
      const blob = new Blob([outBytes], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      
      const rangeStr = splitState.mode === 'all' ? '1' : splitRangeInput.value.trim().replace(/\s+/g, '');
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docBaseName}_split_${rangeStr}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast(`Successfully split PDF`);
    } else {
      const zip = new JSZip();
      
      for (let idx = 0; idx < groups.length; idx++) {
        const outDoc = await PDFDocument.create();
        const pageIndices = groups[idx];
        const copiedPages = await outDoc.copyPages(srcLibDoc, pageIndices);
        copiedPages.forEach(p => outDoc.addPage(p));
        const outBytes = await outDoc.save();
        
        let rangeLabel = '';
        if (pageIndices.length === 1) {
          rangeLabel = `page_${pageIndices[0] + 1}`;
        } else {
          rangeLabel = `pages_${pageIndices[0] + 1}-${pageIndices[pageIndices.length - 1] + 1}`;
        }
        
        zip.file(`${docBaseName}_split_${rangeLabel}.pdf`, outBytes);
      }
      
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${docBaseName}_splits.zip`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
      showToast(`Split into ${groups.length} files. Downloaded ZIP.`);
    }
  } catch (err) {
    console.error(err);
    showToast(err.message || 'Something went wrong while splitting.', true);
  } finally {
    splitExecuteBtn.disabled = false;
    splitExecuteBtn.innerHTML = originalHtml;
  }
});

document.getElementById('compressBackToTools').addEventListener('click', ()=> goTo('tools', {}));

const compressDropzone = document.getElementById('compressDropzone');
const compressFileInput = document.getElementById('compressFileInput');
const compressWorkspace = document.getElementById('compressWorkspace');
const compressPreviewGrid = document.getElementById('compressPreviewGrid');
const compressDocLabel = document.getElementById('compressDocLabel');
const compressExecuteBtn = document.getElementById('compressExecuteBtn');
const compressResetBtn = document.getElementById('compressResetBtn');
const compressQuality = document.getElementById('compressQuality');
const compressMaxWidth = document.getElementById('compressMaxWidth');

let compressState = { doc: null, pages: [] };

compressDropzone.addEventListener('click', () => compressFileInput.click());
['dragenter','dragover'].forEach(evt => compressDropzone.addEventListener(evt, e=>{ e.preventDefault(); compressDropzone.classList.add('drag'); }));
['dragleave','drop'].forEach(evt => compressDropzone.addEventListener(evt, e=>{ e.preventDefault(); compressDropzone.classList.remove('drag'); }));
compressDropzone.addEventListener('drop', e=>{
  const files = [...e.dataTransfer.files].filter(f=> f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
  if(files.length) handleCompressFile(files[0]);
  else showToast("That doesn't look like a PDF — try another file.", true);
});
compressFileInput.addEventListener('change', e=>{ if(e.target.files.length) handleCompressFile(e.target.files[0]); compressFileInput.value=''; });

compressResetBtn.addEventListener('click', resetCompressTool);

async function handleCompressFile(file){
  compressDropzone.style.display = 'none';
  compressWorkspace.style.display = 'grid';
  compressExecuteBtn.disabled = true;
  compressDocLabel.textContent = `${file.name} · ${fmtSize(file.size)}`;
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let pdfjsDoc;
  try{ pdfjsDoc = await pdfjsLib.getDocument({ data: bytes.slice(), verbosity: 0 }).promise; }
  catch(err){ showToast(`Couldn't read "${file.name}" — it may be damaged or password protected.`, true); resetCompressTool(); return; }
  compressState.doc = { name: file.name, size: file.size, bytes, numPages: pdfjsDoc.numPages, pdfjsDoc };
  compressState.pages = [];
  compressPreviewGrid.innerHTML = '';
  for(let i=1;i<=pdfjsDoc.numPages;i++){
    compressState.pages.push({ uid: 'cp'+i, pageIndex: i-1, dataUrl:null, loading:true });
  }
  renderCompressGrid();
  for(let i=1;i<=pdfjsDoc.numPages;i++){
    const p = compressState.pages.find(x=> x.pageIndex === i-1);
    await renderCompressThumbnail(pdfjsDoc, i, p);
  }
  compressExecuteBtn.disabled = false;
}

function renderCompressGrid(){
  compressPreviewGrid.innerHTML = compressState.pages.map((p, idx)=>`
    <div class="page-card" data-uid="${p.uid}">
      <div class="card-top"><span class="order-badge">${String(idx+1).padStart(2,'0')}</span></div>
      <div class="thumb-wrap" style="aspect-ratio:3/4; margin-top:10px;">${p.loading?'<div class="spinner"></div>':`<img src="${p.dataUrl}" draggable="false">`}</div>
      <div class="page-footer" style="justify-content:center;"><span class="page-num">Page ${idx+1}</span></div>
    </div>
  `).join('');
}

async function renderCompressThumbnail(pdfjsDoc, pageNum, pageObj){
  try{
    const page = await pdfjsDoc.getPage(pageNum);
    const viewport = page.getViewport({ scale: 1 });
    const targetWidth = Math.min(viewport.width, parseInt(compressMaxWidth.value || 1200,10));
    const scale = targetWidth / viewport.width;
    const scaledViewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = scaledViewport.width;
    canvas.height = scaledViewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
    pageObj.dataUrl = canvas.toDataURL('image/jpeg', parseFloat(compressQuality.value));
    pageObj.loading = false;
    updateCompressCardThumb(pageObj);
  }catch(err){ pageObj.loading=false; pageObj.error=true; updateCompressCardThumb(pageObj); }
}

function updateCompressCardThumb(pageObj){
  const wrap = compressPreviewGrid.querySelector(`[data-uid="${pageObj.uid}"] .thumb-wrap`);
  if(!wrap) return;
  if(pageObj.error) wrap.innerHTML = `<span style="color:#dc4545; font-size:11px; padding:8px; text-align:center;">Couldn't render</span>`;
  else wrap.innerHTML = `<img src="${pageObj.dataUrl}" draggable="false">`;
}

function resetCompressTool(){
  compressState = { doc:null, pages:[] };
  compressPreviewGrid.innerHTML = '';
  compressWorkspace.style.display = 'none';
  compressDropzone.style.display = 'block';
  compressDocLabel.textContent = '';
  compressExecuteBtn.disabled = true;
}

async function renderPageToJpegBytes(pageIndex, quality, maxWidth){
  const pdfjsDoc = compressState.doc.pdfjsDoc;
  const page = await pdfjsDoc.getPage(pageIndex+1);
  const viewport = page.getViewport({ scale: 1 });
  const targetWidth = Math.min(viewport.width, maxWidth);
  const scale = targetWidth / viewport.width;
  const scaledViewport = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = scaledViewport.width;
  canvas.height = scaledViewport.height;
  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;
  const dataUrl = canvas.toDataURL('image/jpeg', quality);
  const res = await fetch(dataUrl);
  const arr = new Uint8Array(await res.arrayBuffer());
  return arr;
}

compressExecuteBtn.addEventListener('click', async ()=>{
  if(!compressState.doc) return;
  compressExecuteBtn.disabled = true;
  const originalHtml = compressExecuteBtn.innerHTML;
  const startQuality = parseFloat(compressQuality.value);
  const startWidth = parseInt(compressMaxWidth.value || 1200,10);
  const targetMB = parseFloat(document.getElementById('compressTargetMB').value) || 0;
  compressExecuteBtn.innerHTML = 'Compressing…';
  try{
    let attempt = 0;
    const maxAttempts = 8;
    let quality = startQuality;
    let maxWidth = startWidth;
    let best = { bytes: null, blob: null, settings: null };
    const minQuality = 0.2;
    const minWidth = 400;
    const qualityStep = 0.07;
    const widthStep = 200;

    while(attempt < maxAttempts){
      attempt++;
      compressExecuteBtn.innerHTML = `Compressing… (${attempt}/${maxAttempts})`;
      const outDoc = await PDFDocument.create();
      for(let i=0;i<compressState.doc.numPages;i++){
        try{
          const jpgBytes = await renderPageToJpegBytes(i, quality, maxWidth);
          const img = await outDoc.embedJpg(jpgBytes);
          const page = outDoc.addPage([img.width, img.height]);
          page.drawImage(img, { x:0, y:0, width: img.width, height: img.height });
        }catch(err){ console.warn('Page render failed', err); }
      }

      const outBytes = await outDoc.save();
      const outSizeMB = outBytes.byteLength / (1024*1024);
      best = { bytes: outBytes, blob: new Blob([outBytes], { type:'application/pdf' }), settings:{ quality, maxWidth, attempt } };

      if(!targetMB || outSizeMB <= targetMB){
        const url = URL.createObjectURL(best.blob);
        const a = document.createElement('a'); a.href = url; a.download = compressState.doc.name.replace(/\.pdf$/i,'') + '_compressed.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
        showToast(`Compression complete — ${outSizeMB.toFixed(2)} MB`);
        break;
      }

      if(quality - qualityStep >= minQuality){
        quality = Math.max(minQuality, quality - qualityStep);
      }else if(maxWidth - widthStep >= minWidth){
        maxWidth = Math.max(minWidth, maxWidth - widthStep);
        quality = startQuality;
      }else{
        showToast(`Unable to reach ${targetMB} MB; best achieved ${outSizeMB.toFixed(2)} MB`, true);
        const url = URL.createObjectURL(best.blob);
        const a = document.createElement('a'); a.href = url; a.download = compressState.doc.name.replace(/\.pdf$/i,'') + '_compressed.pdf'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(url),4000);
        break;
      }
    }
  }catch(err){ console.error(err); showToast('Something went wrong while compressing.', true); }
  finally{ compressExecuteBtn.disabled = false; compressExecuteBtn.innerHTML = originalHtml; }
});
