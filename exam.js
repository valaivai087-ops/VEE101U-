(() => {
  'use strict';
  const data = JSON.parse(document.getElementById('app-data').textContent);
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const shuffle = a => { a=[...a]; for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a; };
  const normalize = s => String(s).normalize('NFKC').trim().toLowerCase().replace(/\s+/g,' ');
  const key = 'vee101u-exam-history-v1';
  const totalsKey='vee101u-exam-totals-v1';
  let totals={attempts:0,points:0,correct:0,questions:0};try{const t=JSON.parse(localStorage.getItem(totalsKey)||'null');if(t&&Object.keys(totals).every(k=>Number.isFinite(t[k])&&t[k]>=0))totals=t;}catch{}
  let history=[]; try { const saved=JSON.parse(localStorage.getItem(key)||'[]'); if(Array.isArray(saved)) history=saved.filter(x=>x&&typeof x.date==='string'&&Number.isFinite(x.score)).slice(0,20); }catch{}
  let active=false, exam=null, timer=null, storageWarning='';
  const tab=document.createElement('button');tab.type='button';tab.id='tabExam';tab.textContent='考卷／測驗';document.querySelector('.tabs').append(tab);
  const view=document.createElement('section');view.id='examView';view.hidden=true;document.querySelector('main').prepend(view);
  const unitsLabel = ids => ids.length===data.units.length?'全部單元':data.units.filter(u=>ids.includes(u.id)).map(u=>u.title).join('、');
  function explanation(q){const c=data.cards.find(c=>normalize(c.word)===normalize(q.word));const rows=[`<strong>${esc(q.word)}</strong>：${esc(c?.meaningZh||q.answer)}`];if(c){if(c.pos)rows.push('詞性：'+esc(c.pos));if(c.ipa)rows.push('發音：'+esc(c.ipa));const roots=[c.prefix,c.root,c.suffix].filter(Boolean);if(roots.length)rows.push('字首／字根／字尾：'+roots.map(esc).join('；'));for(const [field,label] of [['synonyms','同義字'],['antonyms','反義字'],['related','相關字'],['similar','相似字']])if(c[field]?.length)rows.push(label+'：'+c[field].map(x=>esc(typeof x==='string'?x:[x.en,x.zh].filter(Boolean).join(' '))).join('；'));if(c.pdfExamples?.length)rows.push(...c.pdfExamples.map(e=>`<div class="example">${esc(e.unitTitle)}<br>${esc(e.english)}<br>${esc(e.chinese)}</div>`));}if(q.example&&!c?.pdfExamples?.some(e=>e.english===q.example))rows.push('原句：'+esc(q.example));rows.push(q.options?'判讀方式：以題目單字在原題庫的中文釋義，對照四個選項。':'判讀方式：對照中文釋義或句中使用情境填入英文；大小寫與前後空白不影響計分。');return rows.join('<br>');}
  function pool(ids,type){
    const cards=data.cards.filter(c=>c.units.some(id=>ids.includes(id))&&c.meaningZh&&c.word&&c.ipa!==c.word&&/^[a-z][a-z '-]+$/i.test(c.word));
    if(type!=='context') return cards.map(c=>({word:c.word,answer:type==='meaning'?c.meaningZh:c.word,prompt:type==='meaning'?c.word:c.meaningZh,unit:data.units.filter(u=>ids.includes(u.id)&&c.units.includes(u.id)).map(u=>u.title).join('、'),example:c.pdfExamples?.[0]?.english||''}));
    const seen=new Set();return data.examples.filter(e=>ids.includes(e.unitId)&&e.word&&e.english&&/^[a-z][a-z '-]+$/i.test(e.word)).flatMap(e=>{
      const escaped=e.word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');const re=new RegExp('\\b'+escaped+'\\b','gi');
      if(!cards.some(c=>normalize(c.word)===normalize(e.word))||!/[.!?][”"']?$/.test(e.english.trim())||!re.test(e.english)||e.english.includes('____')||e.english.toLowerCase().includes((e.word+e.word).toLowerCase()))return [];
      const prompt=e.english.replace(re,'________');if(seen.has(prompt))return [];seen.add(prompt);
      return [{word:e.word,answer:e.word,prompt,unit:e.unitTitle,example:e.english}];
    });
  }
  function setup(){
    clearInterval(timer);exam=null;
    view.innerHTML=`<div class="exam-panel"><div class="exam-heading"><h2>單元考卷與考試測驗</h2><span class="unitmark">VEE101U · 65 個單元</span></div><p class="exam-muted">選擇單元，建立自己的考卷。例句題以維根斯坦的「意義在使用中」為設計方向，將單字放回使用情境。題庫沿用原 APP 資料，釋義與例句仍建議對照原書。</p><div class="exam-settings"><label>題型<select id="examType"><option value="meaning">英選中 · 四選一</option><option value="spelling">看中文寫英文</option><option value="context">例句填空</option></select></label><label>題數<select id="examCount"><option>10</option><option selected>20</option><option>30</option><option>50</option><option value="all">全部題目</option></select></label><label>作答時間<select id="examTime"><option value="0">不限時</option><option value="5">5 分鐘</option><option value="10" selected>10 分鐘</option><option value="20">20 分鐘</option><option value="30">30 分鐘</option></select></label></div><h3>考卷單元分類</h3><p class="exam-muted">保留原書單元名稱；括號為全書唯一單元編號，可區分重複的 Unit 名稱。</p><div class="exam-actions"><button type="button" id="examAll">全選</button><button type="button" id="examNone">清除選擇</button></div><div class="exam-units">${data.units.map(u=>`<label class="exam-unit"><input type="checkbox" name="examUnit" value="${u.id}" ${$('unit').value==='all'||Number($('unit').value)===u.id?'checked':''}><span>${esc(u.title)}<br><small class="exam-muted">${data.cards.filter(c=>c.units.includes(u.id)).length} 個單字</small></span></label>`).join('')}</div><p id="examPool" role="status"></p><div class="exam-actions"><button type="button" class="exam-primary" id="examStart">開始測驗</button><button type="button" id="examPaper">產生列印考卷</button></div><p id="examError" role="alert"></p></div><div class="exam-panel"><h3>累積學習成績</h3><div class="stats"><div class="stat"><b>${totals.points}</b>累積分數</div><div class="stat"><b>${totals.attempts}</b>測驗次數</div><div class="stat"><b>${totals.correct} / ${totals.questions}</b>累積答對題數</div><div class="stat"><b>${totals.questions?Math.round(totals.correct/totals.questions*100):0}%</b>總答對率</div></div><h3>最近測驗紀錄</h3><p class="exam-muted">僅儲存在此瀏覽器，最多保留 20 次紀錄。</p>${history.length?`<div style="overflow:auto"><table class="exam-history"><thead><tr><th>日期</th><th>範圍</th><th>成績</th></tr></thead><tbody>${history.map(h=>`<tr><td>${esc(new Date(h.date).toLocaleString('zh-TW'))}</td><td>${esc(h.label)}</td><td>${h.score} 分</td></tr>`).join('')}</tbody></table></div>`:'<p>尚無測驗紀錄。</p>'}</div>`;
    $('examAll').onclick=()=>{view.querySelectorAll('[name=examUnit]').forEach(x=>x.checked=true);count();};
    $('examNone').onclick=()=>{view.querySelectorAll('[name=examUnit]').forEach(x=>x.checked=false);count();};
    view.onchange=count;$('examStart').onclick=()=>start(false);$('examPaper').onclick=()=>start(true);count();
  }
  const selected = () => [...view.querySelectorAll('[name=examUnit]:checked')].map(x=>Number(x.value));
  function count(){const n=pool(selected(),$('examType').value).length;$('examPool').textContent=`已選 ${selected().length} 個單元 · 可用 ${n} 題（不足設定題數時，以可用題數出卷）`;}
  function start(paper){
    const ids=selected(),type=$('examType').value;let source=pool(ids,type);
    if(!ids.length||!source.length){$('examError').textContent='請至少選擇一個有可用題目的單元。';return;}
    source=shuffle(source).slice(0,$('examCount').value==='all'?source.length:Number($('examCount').value));
    const questions=source.map(q=>({...q,options:type==='meaning'?shuffle([q.answer,...shuffle([...new Set(data.cards.map(c=>c.meaningZh).filter(m=>m&&m!==q.answer))]).slice(0,3)]):null}));
    const minutes=Number($('examTime').value);exam={questions,ids,type,paper,answers:{},done:false,started:Date.now(),deadline:minutes&&!paper?Date.now()+minutes*60000:null};draw();
  }
  function draw(){
    view.onchange=null;
    view.innerHTML=`<div class="exam-panel"><div class="exam-heading"><h2>${exam.paper?'單元考卷':'考試測驗'}</h2><button type="button" id="examBack" class="exam-no-print">返回設定</button></div><p>${esc(unitsLabel(exam.ids))}</p><p>${exam.questions.length} 題 · 每題等值配分${exam.paper?' · 姓名：________________ 日期：________________':''}</p><div class="exam-status exam-no-print"><span id="examProgress"></span> <span id="examClock" role="timer"></span></div><div id="examSummary" role="status"></div><form id="examForm">${exam.questions.map((q,i)=>`<fieldset class="exam-question" id="examQ${i}"><legend>${i+1}. ${esc(q.prompt)}</legend><p class="unitmark">${esc(q.unit)}</p>${q.options?`<div class="exam-options">${q.options.map((a,j)=>`<label class="exam-option"><input type="radio" name="answer${i}" value="${esc(a)}"><span>${'ABCD'[j]}. ${esc(a)}</span></label>`).join('')}</div>`:`<label>英文答案<input class="exam-answer" name="answer${i}" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="第 ${i+1} 題英文答案"></label>`}<div class="exam-feedback" hidden></div></fieldset>`).join('')}<div class="exam-actions exam-no-print"><button class="exam-primary" type="submit" id="examSubmit">${exam.paper?'顯示參考答案':'交卷並評分'}</button><button type="button" id="examPrint">列印考卷</button></div></form><div id="examAfter" class="exam-actions exam-no-print"></div></div>`;
    $('examBack').onclick=()=>{if(!exam.done&&!exam.paper&&!confirm('測驗尚未交卷，確定放棄並返回設定？'))return;setup();};
    $('examPrint').onclick=()=>{view.classList.remove('exam-print-answers');window.print();};
    $('examForm').oninput=()=>{const f=new FormData($('examForm'));exam.questions.forEach((q,i)=>exam.answers[i]=f.get('answer'+i)||'');progress();};
    $('examForm').onsubmit=e=>{e.preventDefault();if(!exam.paper&&Object.values(exam.answers).filter(x=>x.trim()).length<exam.questions.length&&!confirm('尚有未作答的題目，仍要交卷嗎？'))return;finish();};
    progress();clearInterval(timer);if(exam.deadline){tick();timer=setInterval(tick,1000);}
    view.scrollIntoView({block:'start'});
  }
  function progress(){$('examProgress').textContent=`已作答 ${Object.values(exam.answers).filter(x=>x.trim()).length} / ${exam.questions.length} 題`;}
  function tick(){if(!exam||exam.done)return;const s=Math.max(0,Math.ceil((exam.deadline-Date.now())/1000));$('examClock').textContent=` · 剩餘 ${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;if(!s)finish();}
  function finish(){
    if(exam.done)return;exam.done=true;clearInterval(timer);let correct=0;const wrong=[];
    exam.questions.forEach((q,i)=>{const answer=exam.answers[i]||'';const ok=normalize(answer)===normalize(q.answer);if(ok)correct++;else wrong.push(q);const el=$('examQ'+i).querySelector('.exam-feedback');el.hidden=false;el.classList.toggle('exam-correct',ok);el.innerHTML=`${exam.paper?'參考答案':ok?'✓ 正確':'✗ '+(answer?'作答：'+esc(answer):'未作答')}<br>答案：<strong>${esc(q.answer)}</strong><br>${explanation(q)}`;});
    $('examForm').querySelectorAll('input').forEach(x=>x.disabled=true);$('examSubmit').hidden=true;
    const score=Math.round(correct/exam.questions.length*100);
    $('examSummary').innerHTML=exam.paper?'<p>已顯示參考答案，可另外列印答案卷。</p>':`<p class="exam-score">${score} 分</p><p>答對 ${correct} / ${exam.questions.length} 題 · 用時 ${Math.floor((Date.now()-exam.started)/60000)} 分 ${Math.floor((Date.now()-exam.started)/1000)%60} 秒</p>`;
    if(!exam.paper){totals.attempts++;totals.points+=score;totals.correct+=correct;totals.questions+=exam.questions.length;try{localStorage.setItem(totalsKey,JSON.stringify(totals));}catch{storageWarning='此瀏覽器無法儲存累積成績。';}$('examSummary').insertAdjacentHTML('beforeend',`<p>累積 ${totals.points} 分 · ${totals.attempts} 次測驗 · 總答對 ${totals.correct} / ${totals.questions} 題</p>`);history.unshift({date:new Date().toISOString(),label:unitsLabel(exam.ids),score});history=history.slice(0,20);try{localStorage.setItem(key,JSON.stringify(history));}catch{storageWarning='此瀏覽器無法儲存紀錄；本次成績仍可查看。';}if(storageWarning)$('examSummary').append(document.createTextNode(storageWarning));}
    if(!exam.paper&&wrong.length){const retry=document.createElement('button');retry.type='button';retry.textContent=`錯題重練（${wrong.length} 題）`;retry.onclick=()=>{exam={...exam,questions:shuffle(wrong),answers:{},done:false,started:Date.now(),deadline:null};draw();};$('examAfter').append(retry);}
    const print=document.createElement('button');print.type='button';print.textContent='列印答案與解析';print.onclick=()=>{view.classList.add('exam-print-answers');window.print();};$('examAfter').append(print);$('examSummary').scrollIntoView({block:'center'});
  }
  function enter(){active=true;document.querySelector('.controls').hidden=true;document.querySelector('header').querySelector('.top').insertAdjacentElement('afterend',navigation);navigation.hidden=false;view.hidden=false;['wordView','exampleView','lookupResults'].forEach(id=>$(id).hidden=true);setup();}
  const navigation=document.createElement('div');navigation.className='exam-actions exam-no-print';navigation.style.cssText='max-width:1144px;margin:0 auto;padding:0 18px 12px';navigation.hidden=true;navigation.innerHTML='<button type="button">← 返回單字與例句</button>';document.querySelector('header').append(navigation);
  navigation.firstElementChild.onclick=()=>{if(exam&&!exam.done&&!exam.paper&&!confirm('測驗尚未交卷，確定離開？'))return;active=false;clearInterval(timer);view.hidden=true;navigation.hidden=true;document.querySelector('.controls').hidden=false;$('tabWords').click();};
  window.addEventListener('beforeunload',e=>{if(active&&exam&&!exam.done&&!exam.paper){e.preventDefault();e.returnValue='';}});
  tab.onclick=enter;
  const directory=document.createElement('section');directory.hidden=true;document.querySelector('main').prepend(directory);
  const unitTab=document.createElement('button');unitTab.type='button';unitTab.textContent='單元分類';document.querySelector('.tabs').prepend(unitTab);
  unitTab.onclick=()=>{directory.hidden=false;view.hidden=true;['wordView','exampleView','lookupResults'].forEach(id=>$(id).hidden=true);directory.innerHTML=`<div class="exam-panel"><h2>全書單元分類</h2><p class="exam-muted">完整呈現 65 個單元。選擇單元即可閱讀全部單字、例句，或建立該單元測驗。</p><label>搜尋單元<input id="unitSearch" placeholder="輸入 Unit 名稱或全書編號"></label><div class="grid" id="unitDirectory">${data.units.map(u=>`<article class="excard" data-unit-name="${esc(u.title.toLowerCase())}"><h3>${esc(u.title)}</h3><p>${data.cards.filter(c=>c.units.includes(u.id)).length} 個單字 · ${data.examples.filter(e=>e.unitId===u.id).length} 個例句</p><div class="exam-actions"><button type="button" data-browse="${u.id}">單字</button><button type="button" data-examples="${u.id}">例句</button><button type="button" data-exam-unit="${u.id}">測驗</button></div></article>`).join('')}</div></div>`;$('unitSearch').oninput=e=>directory.querySelectorAll('[data-unit-name]').forEach(el=>el.hidden=!el.dataset.unitName.includes(e.target.value.trim().toLowerCase()));directory.onclick=e=>{const b=e.target.closest('button');if(!b)return;const id=b.dataset.browse||b.dataset.examples||b.dataset.examUnit;if(!id)return;$('unit').value=id;$('q').value='';$('wordLookup').value='';directory.hidden=true;if(b.dataset.examUnit)enter();else $(b.dataset.examples?'tabExamples':'tabWords').click();};};
  for(const id of ['tabWords','tabExamples'])$(id).addEventListener('click',()=>directory.hidden=true);
  tab.addEventListener('click',()=>directory.hidden=true);
  for(const id of ['q','wordLookup'])$(id).addEventListener('input',()=>directory.hidden=true);
  $('unit').addEventListener('change',()=>directory.hidden=true);
  $('q').setAttribute('aria-label','全文搜尋');$('wordLookup').setAttribute('aria-label','單字搜尋');$('unit').setAttribute('aria-label','單元篩選');
  unitTab.click();
})();
