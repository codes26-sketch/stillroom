(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const ui = {
    lock: $('lock-screen'), vault: $('vault'), form: $('unlock-form'), pass: $('password-input'),
    error: $('lock-error'), unlock: $('unlock-button'), grid: $('results-grid'), empty: $('empty-state'),
    noResults: $('no-results'), search: $('search-input'), clearSearch: $('clear-search'),
    count: $('question-count'), resultCount: $('result-count'), ownerList: $('owner-list'),
    entryForm: $('entry-form'), question: $('question-field'), answer: $('answer-field'), entryId: $('entry-id'),
    editorTitle: $('editor-title'), cancelEdit: $('cancel-edit'), editBadge: $('edit-badge'),
    importFile: $('import-file'), importMessage: $('import-message'), toast: $('toast')
  };
  let entries = [];
  let ownerToken = '';
  let toastTimer;

  async function api(path, options = {}) {
    const headers = new Headers(options.headers || {});
    headers.set('content-type', 'application/json');
    headers.set('cache-control', 'no-store');
    if (ownerToken) headers.set('authorization', `Bearer ${ownerToken}`);
    const response = await fetch(path, { ...options, headers, cache: 'no-store' });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `Request failed (${response.status}).`);
    return body;
  }
  function toast(message) {
    ui.toast.textContent = message; ui.toast.classList.add('show'); clearTimeout(toastTimer);
    toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2500);
  }
  function escapeHtml(text) { return String(text).replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }
  function normalize(value) { return value.toLocaleLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').trim(); }
  const stopWords = new Set(['the','and','for','with','what','when','where','which','does','this','that','from','have','your','into','about','how','why','are','was','can','you','use','not','but','has','its','is','a','an','of','to','in','on','do','or']);
  function tokens(text) { return [...new Set(normalize(text).split(/\s+/).filter((word) => word.length > 1 && !stopWords.has(word)))]; }
  function scoreEntry(entry, query) {
    const terms = tokens(query); if (!terms.length) return 1;
    const q = normalize(entry.question), a = normalize(entry.answer); let score = 0;
    for (const term of terms) {
      if (q.includes(term)) score += 5;
      else if (a.includes(term)) score += 1.25;
      else {
        const near = (text) => text.split(/\s+/).some((word) => word.startsWith(term) || (term.length > 4 && word.length > 4 && (word.includes(term) || term.includes(word))));
        if (near(q)) score += 2; else if (near(a)) score += .75;
      }
    }
    return score / Math.sqrt(terms.length);
  }
  function highlighted(text, query) {
    const terms = tokens(query).sort((a,b) => b.length-a.length);
    if (!terms.length) return escapeHtml(text);
    const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'ig');
    return escapeHtml(text).replace(pattern, '<mark class="match-mark">$1</mark>');
  }
  const codeTokens = /(\/\/[^\n]*|#[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`|\b[A-Za-z_$][\w$]*\b|\b\d+(?:\.\d+)?\b)/g;
  const reservedWords = new Set('const let var function return if else for while do switch case break continue class extends new this import from export default async await try catch throw true false null undefined def print pass in not and or lambda public private static void int string bool package using namespace SELECT FROM WHERE INSERT UPDATE DELETE CREATE TABLE JOIN ON AS ORDER BY LIMIT'.split(' '));
  function renderCodeLine(line, query) {
    const terms=tokens(query).sort((a,b)=>b.length-a.length);
    const mark=(raw)=>{
      let html=escapeHtml(raw);
      if(terms.length){const regex=new RegExp(`(${terms.map((x)=>x.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|')})`,'ig');html=html.replace(regex,'<mark class="search-mark">$1</mark>');}
      return html;
    };
    let html='',cursor=0;
    for(const match of line.matchAll(codeTokens)){
      const part=match[0],start=match.index;
      html+=mark(line.slice(cursor,start));
      let type='';
      if(part.startsWith('//')||part.startsWith('#'))type='syntax-comment';
      else if(/^['"`]/.test(part))type='syntax-string';
      else if(/^\d/.test(part))type='syntax-number';
      else if(reservedWords.has(part)||reservedWords.has(part.toUpperCase()))type='syntax-keyword';
      else if(/^[A-Za-z_$]/.test(part)&&/^\s*\(/.test(line.slice(start+part.length)))type='syntax-function';
      html+=type?`<span class="${type}">${mark(part)}</span>`:mark(part);
      cursor=start+part.length;
    }
    return html+mark(line.slice(cursor));
  }
  function codeBlock(answer, query) {
    const lines=String(answer).replace(/\r\n?/g,'\n').split('\n');
    return `<pre class="answer-code" aria-label="Code answer"><code>${lines.map((line,index)=>`<span class="code-line"><span class="line-number" aria-hidden="true">${index+1}</span><span class="line-content">${renderCodeLine(line,query)}</span></span>`).join('')}</code></pre>`;
  }
  function renderLibrary() {
    const query = ui.search.value.trim();
    const matches = entries.map((entry) => ({ entry, score: scoreEntry(entry, query) })).filter((x) => !query || x.score > 0).sort((a,b) => b.score-a.score || b.entry.updatedAt-a.entry.updatedAt);
    ui.grid.replaceChildren(); ui.count.textContent = String(entries.length);
    ui.empty.classList.toggle('hidden', entries.length > 0);
    ui.noResults.classList.toggle('hidden', entries.length === 0 || matches.length > 0);
    ui.grid.classList.toggle('hidden', matches.length === 0);
    ui.clearSearch.classList.toggle('hidden', !query);
    ui.resultCount.textContent = query ? `${matches.length} ${matches.length === 1 ? 'result' : 'results'} found` : `${entries.length} ${entries.length === 1 ? 'question' : 'questions'} available`;
    $('collection-title').childNodes[0].textContent = query ? 'Matching answers ' : 'All questions ';
    matches.forEach(({ entry }, index) => {
      const article = document.createElement('article'); article.className = 'qa-card'; article.style.animationDelay = `${Math.min(index * 35, 240)}ms`;
      article.innerHTML = `<div class="card-meta"><span class="card-number">QUESTION / ${String(index+1).padStart(2,'0')}</span><span>${escapeHtml(new Date(entry.updatedAt || Date.now()).toLocaleDateString(undefined,{year:'numeric',month:'short',day:'numeric'}))}</span></div><h3>${highlighted(entry.question,query)}</h3>${codeBlock(entry.answer,query)}<div class="card-bottom"><span>ANSWER</span><div class="copy-actions"><button class="copy-answer" type="button" data-copy-question="${escapeHtml(entry.id)}">COPY QUESTION</button><button class="copy-answer" type="button" data-copy-answer="${escapeHtml(entry.id)}">COPY ANSWER</button><button class="copy-answer copy-both" type="button" data-copy-both="${escapeHtml(entry.id)}">COPY BOTH</button></div></div>`;
      ui.grid.append(article);
    });
  }
  function renderOwner() {
    $('owner-total').textContent = `${entries.length} ${entries.length === 1 ? 'answer' : 'answers'}`;
    $('owner-list-count').textContent = String(entries.length);
    const bytes = new Blob([JSON.stringify(entries)]).size;
    $('storage-size').textContent = bytes < 1024 ? `${bytes} B` : `${(bytes/1024).toFixed(1)} KB`;
    $('meter-fill').style.width = `${Math.min(100, entries.length ? 12 + entries.length * 4 : 0)}%`;
    ui.ownerList.replaceChildren();
    $('empty-state').classList.toggle('hidden', entries.length > 0);
    $('add-first').classList.toggle('hidden', entries.length > 0);
    entries.slice().sort((a,b) => b.updatedAt-a.updatedAt).forEach((entry,i) => {
      const row=document.createElement('div'); row.className='owner-row';
      row.innerHTML=`<span class="owner-row-index">${String(entries.length-i).padStart(2,'0')}</span><div class="owner-row-text"><strong>${escapeHtml(entry.question)}</strong><small>UPDATED ${escapeHtml(new Date(entry.updatedAt).toLocaleDateString())}</small></div><div class="row-actions"><button type="button" data-edit="${escapeHtml(entry.id)}" aria-label="Edit question">✎</button><button type="button" data-delete="${escapeHtml(entry.id)}" aria-label="Delete question">×</button></div>`;
      ui.ownerList.append(row);
    });
  }
  function render() { renderLibrary(); renderOwner(); }
  async function loadQuestions() {
    try {
      const data = await api('/api/questions');
      entries = Array.isArray(data.questions) ? data.questions : [];
      $('load-error')?.remove();
    } catch (error) {
      entries = [];
      if (['localhost','127.0.0.1'].includes(location.hostname)) {
        entries = [{ id:'preview-example', question:'How do I print a message in JavaScript?', answer:'function greet(name) {\n  return `Hello, ${name}!`;\n}\n\nconsole.log(greet("world"));', updatedAt:Date.now() }];
        ui.resultCount.textContent = 'Preview example — Netlify API is not running locally';
      } else {
        ui.resultCount.textContent = 'The shared question library could not be reached. Refresh to try again.';
        const note=document.createElement('p'); note.id='load-error'; note.className='form-message'; note.textContent=error.message; $('library-view').prepend(note);
      }
    }
    render();
  }
  function showView(view) {
    const owner = view === 'owner';
    if (owner && !ownerToken) {
      ui.vault.classList.add('hidden'); ui.lock.classList.remove('hidden'); ui.error.textContent=''; ui.pass.value='';
    } else {
      ui.lock.classList.add('hidden'); ui.vault.classList.remove('hidden');
      $('library-view').classList.toggle('hidden',owner); $('owner-view').classList.toggle('hidden',!owner);
      $('lock-now').classList.toggle('hidden',!ownerToken);
      document.querySelectorAll('.nav-link').forEach((button)=>button.classList.toggle('active',button.dataset.view===view));
      if (owner) $('question-field').focus({preventScroll:true});
    }
    location.hash = owner ? '#owner' : '#library'; window.scrollTo({top:0,behavior:'smooth'});
  }
  async function ownerLogin(event) {
    event.preventDefault(); ui.error.textContent=''; ui.unlock.disabled=true;
    ui.unlock.querySelector('span:first-child').textContent='Checking password…';
    try {
      const data=await api('/api/owner/login',{method:'POST',body:JSON.stringify({password:ui.pass.value})});
      ownerToken=data.token; ui.pass.value=''; showView('owner'); render(); toast('Owner desk unlocked.');
    } catch(error) { ui.error.textContent=error.message; }
    finally { ui.unlock.disabled=false; ui.unlock.querySelector('span:first-child').textContent='Open owner desk'; }
  }
  async function saveRemote(nextEntries) {
    const data=await api('/api/questions',{method:'PUT',body:JSON.stringify({questions:nextEntries})});
    entries=data.questions; render();
  }
  async function persist(nextEntries, successMessage) {
    const previous=entries; entries=nextEntries; render();
    try { await saveRemote(nextEntries); toast(successMessage); }
    catch(error) { entries=previous; render(); if(error.message.includes('expired')){ownerToken='';showView('owner');} toast(error.message); }
  }
  function resetEditor() {
    ui.entryForm.reset(); ui.entryId.value=''; ui.editorTitle.textContent='New question'; ui.cancelEdit.classList.add('hidden'); ui.editBadge.classList.add('hidden'); $('save-entry').innerHTML='Publish answer <span>↗</span>';
  }
  async function saveEntry(event) {
    event.preventDefault(); if (!ownerToken) return;
    const question=ui.question.value, answer=ui.answer.value;
    if (!question.trim() || !answer.trim()) return;
    const now=Date.now(), id=ui.entryId.value;
    const next=entries.slice();
    if(id){const at=next.findIndex((item)=>item.id===id);if(at>=0)next[at]={...next[at],question,answer,updatedAt:now};}
    else next.unshift({id:crypto.randomUUID(),question,answer,updatedAt:now});
    await persist(next,id?'Question and answer updated.':'Question and answer published.');
    resetEditor();
  }
  function parseCSV(text) {
    const rows=[];let row=[],value='',quoted=false;
    for(let i=0;i<text.length;i++){const c=text[i];if(c==='"'&&quoted&&text[i+1]==='"'){value+='"';i++;}else if(c==='"')quoted=!quoted;else if(c===','&&!quoted){row.push(value);value='';}else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(value);if(row.some((cell)=>cell.trim()))rows.push(row);row=[];value='';}else value+=c;}
    row.push(value);if(row.some((cell)=>cell.trim()))rows.push(row);if(!rows.length)return[];
    const headers=rows[0].map((x)=>x.trim().toLowerCase()),qi=headers.findIndex((x)=>['question','q','prompt'].includes(x)),ai=headers.findIndex((x)=>['answer','a','response'].includes(x)),has=qi>=0&&ai>=0;
    return rows.slice(has?1:0).map((r)=>({question:r[has?qi:0]||'',answer:r[has?ai:1]||''}));
  }
  function parseText(text) {
    const blocks=text.split(/^---\s*$/m).map((part)=>part.replace(/^\r?\n|\r?\n$/g,'')).filter((part)=>part.trim());
    const result=[];
    for(const block of blocks){const match=block.match(/^Question:[ \t]*(.*?)\r?\nAnswer:[ \t]*\r?\n([\s\S]*)$/i);if(match)result.push({question:match[1],answer:match[2]});}
    if(!result.length)throw new Error('Text files need Question: and Answer: labels. Use --- on its own line between entries.');
    return result;
  }
  function normalizeImported(items) {
    if(!Array.isArray(items))throw new Error('Expected a list of question and answer pairs.');
    const now=Date.now();return items.map((item)=>({question:String(item.question??item.q??item.prompt??''),answer:String(item.answer??item.a??item.response??'')})).filter((x)=>x.question.trim()&&x.answer.trim()).map((x)=>({...x,id:crypto.randomUUID(),updatedAt:now}));
  }
  async function importFile(file) {
    if(!file)return;
    try{
      if(file.size>4*1024*1024)throw new Error('Choose a file smaller than 4 MB.');
      const text=await file.text();let raw;
      if(file.name.toLowerCase().endsWith('.json')){const data=JSON.parse(text);raw=Array.isArray(data)?data:(data.questions||data.entries);}
      else if(file.name.toLowerCase().endsWith('.csv'))raw=parseCSV(text);
      else raw=parseText(text);
      const imported=normalizeImported(raw);if(!imported.length)throw new Error('No complete question and answer pairs were found.');
      ui.importMessage.textContent=`Publishing ${imported.length} ${imported.length===1?'question':'questions'}…`;
      await persist([...imported,...entries],`${imported.length} questions published.`);
      ui.importMessage.textContent=`Published ${imported.length} ${imported.length===1?'question':'questions'}.`;ui.importMessage.style.color='#cbe79a';
    }catch(error){ui.importMessage.textContent=error.message;ui.importMessage.style.color='#ef9c83';}
    ui.importFile.value='';
  }
  function downloadJSON() {
    const blob=new Blob([JSON.stringify({questions:entries},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),link=document.createElement('a');
    link.href=url;link.download='stillroom-questions.json';link.click();URL.revokeObjectURL(url);toast('Question list downloaded.');
  }

  ui.form.addEventListener('submit',ownerLogin);
  $('password-change-form').addEventListener('submit',async(event)=>{
    event.preventDefault();
    const input=$('new-owner-password'),message=$('password-change-message');
    message.textContent='Saving password…';message.style.color='';
    try{
      await api('/api/owner/password',{method:'POST',body:JSON.stringify({password:input.value})});
      input.value='';message.textContent='Password changed. Use the new password next time you sign in.';message.style.color='#cbe79a';
    }catch(error){message.textContent=error.message;message.style.color='#ef9c83';}
  });
  $('toggle-password').addEventListener('click',()=>{const show=ui.pass.type==='password';ui.pass.type=show?'text':'password';$('toggle-password').setAttribute('aria-label',show?'Hide password':'Show password');});
  $('back-to-library').addEventListener('click',()=>showView('library'));
  $('lock-now').addEventListener('click',()=>{ownerToken='';resetEditor();showView('library');toast('Signed out of owner desk.');});
  document.querySelectorAll('.nav-link').forEach((button)=>button.addEventListener('click',()=>showView(button.dataset.view)));
  document.querySelectorAll('[data-go-owner]').forEach((button)=>button.addEventListener('click',()=>showView('owner')));
  document.querySelectorAll('[data-go-library]').forEach((button)=>button.addEventListener('click',()=>showView('library')));
  $('add-first').addEventListener('click',()=>showView('owner'));
  ui.search.addEventListener('input',renderLibrary);
  ui.clearSearch.addEventListener('click',()=>{ui.search.value='';renderLibrary();ui.search.focus();});
  ui.entryForm.addEventListener('submit',saveEntry);ui.cancelEdit.addEventListener('click',resetEditor);
  ui.ownerList.addEventListener('click',async(event)=>{
    const edit=event.target.closest('[data-edit]'),del=event.target.closest('[data-delete]');
    if(edit){const item=entries.find((x)=>x.id===edit.dataset.edit);if(!item)return;ui.entryId.value=item.id;ui.question.value=item.question;ui.answer.value=item.answer;ui.editorTitle.textContent='Edit question';ui.cancelEdit.classList.remove('hidden');ui.editBadge.classList.remove('hidden');$('save-entry').innerHTML='Update answer <span>↗</span>';ui.question.focus();window.scrollTo({top:0,behavior:'smooth'});}
    if(del){const item=entries.find((x)=>x.id===del.dataset.delete);if(!item||!confirm('Delete this question and answer?'))return;await persist(entries.filter((x)=>x.id!==item.id),'Question deleted.');}
  });
  ui.grid.addEventListener('click',async(event)=>{
    const button=event.target.closest('[data-copy-question],[data-copy-answer],[data-copy-both]');if(!button)return;
    const id=button.dataset.copyQuestion||button.dataset.copyAnswer||button.dataset.copyBoth,item=entries.find((x)=>x.id===id);if(!item)return;
    let text=button.hasAttribute('data-copy-question')?item.question:button.hasAttribute('data-copy-answer')?item.answer:`${item.question}\n\n${item.answer}`;
    try{await navigator.clipboard.writeText(text);toast(button.hasAttribute('data-copy-question')?'Question copied exactly.':button.hasAttribute('data-copy-answer')?'Answer copied exactly.':'Question and answer copied exactly.');}catch{toast('Copy is unavailable. Select and copy the text instead.');}
  });
  ui.importFile.addEventListener('change',(event)=>importFile(event.target.files[0]));
  $('export-backup').addEventListener('click',downloadJSON);
  $('restore-backup').addEventListener('change',(event)=>importFile(event.target.files[0]));
  const zone=$('drop-zone');['dragenter','dragover'].forEach((name)=>zone.addEventListener(name,(event)=>{event.preventDefault();zone.classList.add('dragover');}));
  ['dragleave','drop'].forEach((name)=>zone.addEventListener(name,(event)=>{event.preventDefault();zone.classList.remove('dragover');}));
  zone.addEventListener('drop',(event)=>importFile(event.dataTransfer.files[0]));
  window.addEventListener('hashchange',()=>{if(location.hash==='#owner')showView('owner');else if(location.hash==='#library')showView('library');});

  $('library-view').classList.remove('hidden');$('owner-view').classList.add('hidden');ui.vault.classList.remove('hidden');ui.lock.classList.add('hidden');
  document.querySelectorAll('.nav-link').forEach((button)=>button.classList.toggle('active',button.dataset.view==='library'));
  if(location.hash==='#owner')showView('owner');
  loadQuestions();
})();
