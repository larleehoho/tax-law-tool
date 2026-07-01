(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const PS = 20; // page size
  let laws = [], favorites = JSON.parse(localStorage.getItem('tfav')||'[]');
  let darkMode = localStorage.getItem('tdark')==='1';
  let currentPage = 'home', currentDoc = null, currentFilter = '', currentPageIdx = 1;

  // ===== Toast =====
  function toast(m){ let e=$('toast'); e.textContent=m; e.classList.add('show'); setTimeout(()=>e.classList.remove('show'),2000); }

  // ===== Nav =====
  function showPage(n){
    ['Home','Detail','Search','Fav','Settings'].forEach(p=>{ let e=$(('page'+p)); if(e) e.classList.toggle('hidden',p.toLowerCase()!==n); });
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.page===n));
    currentPage=n; $('appBody').scrollTop=0;
  }

  // ===== Render Doc Row =====
  function mkRow(doc, highlight){
    let r=document.createElement('div'); r.className='doc-row';
    let f=favorites.includes(doc.id), loc=doc.region&&doc.region!=='全国';
    let t=doc.title;
    if(highlight){ let re=new RegExp(highlight.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'); t=t.replace(re,m=>`<mark style="background:#fde68a;color:#111;padding:0 2px;border-radius:2px;">${m}</mark>`); }
    r.innerHTML=`<div class="doc-row-info"><div class="doc-row-title">${t}</div><div class="doc-row-meta"><span>${doc.subCategory||''}</span>${loc?`<span class="badge-local">${doc.region}</span>`:''}<span>${doc.status||''}</span></div></div><button class="doc-fav-btn" data-id="${doc.id}">${f?'⭐':'☆'}</button>`;
    r.addEventListener('click',e=>{ if(e.target.closest('.doc-fav-btn'))return; showDetail(doc); });
    r.querySelector('.doc-fav-btn').addEventListener('click',e=>{ e.stopPropagation(); toggleFav(doc.id); r.querySelector('.doc-fav-btn').textContent=favorites.includes(doc.id)?'⭐':'☆'; });
    return r;
  }

  // ===== Detail =====
  function showDetail(doc, matchSection, matchKw){
    currentDoc=doc;
    let rec=JSON.parse(localStorage.getItem('trecent')||'[]');
    rec=[doc.id,...rec.filter(i=>i!==doc.id)].slice(0,30); localStorage.setItem('trecent',JSON.stringify(rec));
    showPage('detail');
    let f=favorites.includes(doc.id), loc=doc.region&&doc.region!=='全国';
    let c=$('detailContent');
    c.innerHTML=`
      <div class="detail-header">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <h2>${doc.title}</h2>
          <button class="doc-fav-btn" data-id="${doc.id}" style="font-size:22px;">${f?'⭐':'☆'}</button>
        </div>
        <div class="detail-meta">
          ${doc.docNo?`<span><span class="label">文号：</span>${doc.docNo}</span>`:''}
          <span><span class="label">发布：</span>${doc.publishDate||'-'}</span>
          ${doc.updateDate!==doc.publishDate?`<span><span class="label">更新：</span>${doc.updateDate||'-'}</span>`:''}
          ${loc?`<span class="badge-local">${doc.region}</span>`:''}
          <span>${doc.status||''}</span>
        </div>
        ${doc.summary?`<div class="detail-summary">${doc.summary}</div>`:''}
      </div>
      <div class="detail-body"></div>`;
    let body=c.querySelector('.detail-body');
    if(Array.isArray(doc.content)){
      let escaped=matchKw?matchKw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'):null;
      let re=escaped?new RegExp(escaped,'gi'):null;
      doc.content.forEach((s,i)=>{
        let b=document.createElement('div'); b.className='section-block';
        if(matchSection&&s.section===matchSection) b.style.border='2px solid #f59e0b';
        let txt=s.text;
        if(re&&re.test(txt)){
          txt=txt.replace(re,m=>`<mark style="background:#fde68a;color:#111;padding:0 2px;border-radius:2px;">${m}</mark>`);
        }
        let lines=txt.split('\n').map(l=>l.trim()).filter(l=>l);
        let html=lines.map(l=>{
          if(l.match(/^(级数|级)\s/)) return `<div style="font-family:monospace;font-size:13px;padding:1px 0;">${l}</div>`;
          return l;
        }).join('<br>');
        b.innerHTML=`<div class="section-title">${s.section}</div><div class="section-text">${html}</div>`;
        body.appendChild(b);
      });
    } else if(typeof doc.content==='string'&&doc.content){
      let b=document.createElement('div'); b.className='section-block';
      b.innerHTML=`<div class="section-text">${doc.content}</div>`; body.appendChild(b);
    }
    c.querySelector('.doc-fav-btn')?.addEventListener('click',function(){ toggleFav(doc.id); this.textContent=favorites.includes(doc.id)?'⭐':'☆'; });
  }

  // ===== Search (条款级) =====
  function buildSearchIndex(){
    // Build a flat index: {lawId, law, section, text}
    let idx=[];
    laws.forEach(l=>{
      if(Array.isArray(l.content)){
        l.content.forEach(s=>{ if(s.text) idx.push({lawId:l.id, law:l, section:s.section, text:s.text}); });
      } else if(typeof l.content==='string'&&l.content){
        idx.push({lawId:l.id, law:l, section:'全文', text:l.content});
      }
      // Also search summary, docNo
      if(l.summary) idx.push({lawId:l.id, law:l, section:'摘要', text:l.summary});
    });
    return idx;
  }

  let searchIndex = null;

  function performSearch(q){
    let c=$('searchResults');
    if(!q.trim()){ c.innerHTML='<div class="empty-hint">输入关键词搜索</div>'; $('searchPagination').innerHTML=''; return; }
    let kw=q.toLowerCase(), kw2=q;

    // Build index lazily
    if(!searchIndex) searchIndex=buildSearchIndex();

    // Search clauses
    let matches=[];
    searchIndex.forEach(item=>{
      if(item.text.toLowerCase().includes(kw)){
        matches.push(item);
      }
    });

    // Also search title/docNo
    laws.forEach(l=>{
      if(l.title.toLowerCase().includes(kw)||(l.docNo&&l.docNo.toLowerCase().includes(kw))){
        // Already included via clause? Check
        if(!matches.some(m=>m.lawId===l.id&&m.section==='(标题)') && !matches.some(m=>m.lawId===l.id&&m.text.length>50)){
          matches.unshift({lawId:l.id, law:l, section:'(标题)', text:`文号：${l.docNo||'-'}　发布：${l.publishDate||'-'}　${l.summary||''}`});
        }
      }
    });

    // Dedup by lawId+section
    let seen=new Set();
    let unique=[];
    matches.forEach(m=>{ let k=m.lawId+':'+m.section; if(!seen.has(k)){ seen.add(k); unique.push(m); } });

    let ps=20, tp=Math.ceil(unique.length/ps)||1;
    let pi=parseInt(sessionStorage.getItem('searchPage')||'1'); if(pi>tp)pi=tp;
    let start=(pi-1)*ps, items=unique.slice(start,start+ps);

    c.innerHTML=`<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">🔍 "${q}" 共 ${unique.length} 条匹配条款</div>`;
    if(unique.length===0){ c.innerHTML+='<div class="empty-hint">未找到匹配</div>'; $('searchPagination').innerHTML=''; return; }

    items.forEach(m=>{
      let row=document.createElement('div'); row.className='doc-row';
      row.style.alignItems='flex-start';
      // Get excerpt around match
      let idx=m.text.toLowerCase().indexOf(kw);
      let excerpt=m.text.slice(Math.max(0,idx-20), idx+kw.length+60);
      if(idx>20) excerpt='…'+excerpt;
      if(idx+kw.length+60<m.text.length) excerpt+='…';
      excerpt=excerpt.replace(new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'gi'),m=>`<mark style="background:#fde68a;color:#111;padding:0 2px;border-radius:2px;">${m}</mark>`);

      let loc=m.law.region&&m.law.region!=='全国';
      row.innerHTML=`
        <div class="doc-row-info">
          <div class="doc-row-title"><span style="font-weight:500;">${m.law.title}</span> <span style="font-size:12px;color:var(--text-muted);background:var(--border);padding:0 6px;border-radius:3px;">${m.section}</span></div>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.5;margin-top:4px;">${excerpt}</div>
          <div class="doc-row-meta" style="margin-top:4px;">
            <span>${m.law.category}</span>${loc?`<span class="badge-local">${m.law.region}</span>`:''}
          </div>
        </div>`;
      row.addEventListener('click',()=>showDetail(m.law,m.section,q));
      c.appendChild(row);
    });

    let p=$('searchPagination');
    if(tp<=1){ p.innerHTML=''; return; }
    p.innerHTML=`<button class="page-btn" id="spPrev" ${pi<=1?'disabled':''}>← 上一页</button><span class="page-info">${pi}/${tp}</span><button class="page-btn" id="spNext" ${pi>=tp?'disabled':''}>下一页 →</button>`;
    $('spPrev')?.addEventListener('click',()=>{ let p2=Math.max(1,parseInt(sessionStorage.getItem('searchPage')||'1')-1); sessionStorage.setItem('searchPage',p2); performSearch($('globalSearchInput').value); });
    $('spNext')?.addEventListener('click',()=>{ let p2=Math.min(tp,parseInt(sessionStorage.getItem('searchPage')||'1')+1); sessionStorage.setItem('searchPage',p2); performSearch($('globalSearchInput').value); });
  }

  // ===== Favorites =====
  function toggleFav(id){
    let i=favorites.indexOf(id);
    if(i===-1){ favorites.push(id); toast('已收藏'); } else { favorites.splice(i,1); toast('已取消收藏'); }
    localStorage.setItem('tfav',JSON.stringify(favorites));
    $('favCount').textContent=favorites.length;
    if(currentPage==='home') renderHome();
    if(currentPage==='fav') renderFavPage();
  }
  function renderFavPage(){
    let c=$('favContent'); let fDocs=laws.filter(l=>favorites.includes(l.id));
    if(fDocs.length===0){ c.innerHTML='<div class="empty-hint">⭐ 还没有收藏的法规</div>'; $('favPagination').innerHTML=''; return; }
    let tp=Math.ceil(fDocs.length/PS)||1; let pi=parseInt(sessionStorage.getItem('favPage')||'1'); if(pi>tp)pi=tp;
    let start=(pi-1)*PS; let items=fDocs.slice(start,start+PS);
    c.innerHTML=''; items.forEach(d=>c.appendChild(mkRow(d)));
    let p=$('favPagination');
    if(tp<=1){ p.innerHTML=''; return; }
    p.innerHTML=`<button class="page-btn" id="fpPrev" ${pi<=1?'disabled':''}>← 上一页</button><span class="page-info">${pi}/${tp}</span><button class="page-btn" id="fpNext" ${pi>=tp?'disabled':''}>下一页 →</button>`;
    $('fpPrev')?.addEventListener('click',()=>{ let p2=Math.max(1,parseInt(sessionStorage.getItem('favPage')||'1')-1); sessionStorage.setItem('favPage',p2); renderFavPage(); });
    $('fpNext')?.addEventListener('click',()=>{ let p2=Math.min(tp,parseInt(sessionStorage.getItem('favPage')||'1')+1); sessionStorage.setItem('favPage',p2); renderFavPage(); });
  }

  // ===== Home =====
  function renderHome(){
    let c=$('categoryList'); c.innerHTML='';
    let docs=[];
    if(currentFilter==='fav') docs=laws.filter(l=>favorites.includes(l.id));
    else if(currentFilter==='recent'){ let rec=JSON.parse(localStorage.getItem('trecent')||'[]'); docs=laws.filter(l=>rec.includes(l.id)); }
    else docs=[...laws];
    let tp=Math.ceil(docs.length/PS)||1; if(currentPageIdx>tp)currentPageIdx=tp;
    let start=(currentPageIdx-1)*PS, pageItems=docs.slice(start,start+PS);
    let groups={}; pageItems.forEach(l=>{ if(!groups[l.category])groups[l.category]=[]; groups[l.category].push(l); });
    ['增值税','企业所得税','个人所得税','印花税','其他税费','税收征管','发票管理','热点问答','地方文件'].forEach(cat=>{
      if(!groups[cat])return;
      let g=document.createElement('div'); g.className='cat-group';
      g.innerHTML=`<div class="cat-header"><span>${cat}</span><span class="cat-count">${groups[cat].length}项</span></div>`;
      let b=document.createElement('div'); b.className='cat-items';
      groups[cat].forEach(d=>b.appendChild(mkRow(d))); g.appendChild(b); c.appendChild(g);
    });
    if(docs.length===0) c.innerHTML='<div class="empty-hint">暂无内容</div>';
    let p=$('pagination');
    if(tp<=1){ p.innerHTML=''; return; }
    p.innerHTML=`<button class="page-btn" id="prevBtn" ${currentPageIdx<=1?'disabled':''}>← 上一页</button><span class="page-info">${currentPageIdx}/${tp}</span><button class="page-btn" id="nextBtn" ${currentPageIdx>=tp?'disabled':''}>下一页 →</button>`;
    $('prevBtn')?.addEventListener('click',()=>{ if(currentPageIdx>1){currentPageIdx--;renderHome();$('appBody').scrollTop=0;} });
    $('nextBtn')?.addEventListener('click',()=>{ if(currentPageIdx<tp){currentPageIdx++;renderHome();$('appBody').scrollTop=0;} });
  }

  // ===== Init =====
  async function init(){
    if(darkMode) document.body.classList.add('dark');
    $('darkSwitch')?.classList.toggle('on',darkMode);
    try{ laws=await(await fetch('data/embed.json')).json(); }catch(e){
      try{ laws=await(await fetch('data/tax-laws-comprehensive.json')).json(); }catch(e2){ $('categoryList').innerHTML='<div class="empty-hint">数据加载失败，请刷新重试</div>'; return; }
    }
    let cats=new Set(laws.map(l=>l.category));
    let local=laws.filter(l=>l.region&&l.region!=='全国').length;
    $('statsCard').innerHTML=`<div class="stat-row"><span>📄 法规总数</span><span class="val">${laws.length} 项</span></div><div class="stat-row"><span>📂 覆盖类别</span><span class="val">${cats.size} 类</span></div><div class="stat-row"><span>📍 地方文件</span><span class="val">${local} 项</span></div>`;
    $('favCount').textContent=favorites.length;
    renderHome();

    document.querySelectorAll('.nav-item').forEach(b=>{
      b.addEventListener('click',()=>{
        let p=b.dataset.page;
        if(p==='home'){ currentPageIdx=1; renderHome(); showPage('home'); }
        else if(p==='fav'){ sessionStorage.setItem('favPage','1'); renderFavPage(); showPage('fav'); }
        else if(p==='search'){ sessionStorage.setItem('searchPage','1');
          // Reset search index on new search page visit
          searchIndex=null;
          $('searchResults').innerHTML='<div class="empty-hint">支持搜索关键词，显示匹配的条款（如"税率"、"不动产"、"加计扣除"）</div>'; $('searchPagination').innerHTML=''; showPage('search'); $('globalSearchInput').focus(); }
        else if(p==='settings') showPage('settings');
      });
    });

    // Header search toggle (quick filter on home)
    $('searchToggleBtn').addEventListener('click',()=>{ $('searchBar').classList.toggle('hidden'); if(!$('searchBar').classList.contains('hidden')) $('searchInput').focus(); });
    $('searchInput').addEventListener('input',e=>{
      let v=e.target.value.trim().toLowerCase();
      if(!v){ renderHome(); return; }
      let results=laws.filter(l=>l.title.toLowerCase().includes(v)||(l.docNo&&l.docNo.toLowerCase().includes(v)));
      let groups={}; results.forEach(l=>{if(!groups[l.category])groups[l.category]=[];groups[l.category].push(l);});
      let c=$('categoryList');
      c.innerHTML=`<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">搜索 "${v}" 找到 ${results.length} 条法规</div>`;
      ['增值税','企业所得税','个人所得税','印花税','其他税费','税收征管','发票管理','热点问答','地方文件'].forEach(cat=>{
        if(!groups[cat])return;
        let g=document.createElement('div'); g.className='cat-group';
        g.innerHTML=`<div class="cat-header">${cat}<span class="cat-count">${groups[cat].length}项</span></div>`;
        let b=document.createElement('div'); b.className='cat-items';
        groups[cat].forEach(d=>b.appendChild(mkRow(d,v))); g.appendChild(b); c.appendChild(g);
      });
      if(results.length===0) c.innerHTML='<div class="empty-hint">未找到匹配</div>';
      $('pagination').innerHTML='';
    });
    $('searchClearBtn').addEventListener('click',()=>{ $('searchInput').value=''; $('searchBar').classList.add('hidden'); renderHome(); });

    // Global search (条款级)
    let searchTimer;
    $('globalSearchInput').addEventListener('input',e=>{
      clearTimeout(searchTimer);
      searchTimer=setTimeout(()=>performSearch(e.target.value),200);
    });

    // Quick filters
    document.querySelectorAll('.qf-btn').forEach(b=>{
      b.addEventListener('click',()=>{
        document.querySelectorAll('.qf-btn').forEach(x=>x.classList.remove('active')); b.classList.add('active');
        currentFilter=b.dataset.filter||''; currentPageIdx=1; renderHome();
      });
    });

    $('detailBackBtn').addEventListener('click',()=>{ showPage('home'); renderHome(); });
    $('favGoBtn').addEventListener('click',()=>{ sessionStorage.setItem('favPage','1'); renderFavPage(); showPage('fav'); });
    $('darkSwitch')?.addEventListener('click',function(){ darkMode=!darkMode; document.body.classList.toggle('dark',darkMode); this.classList.toggle('on',darkMode); localStorage.setItem('tdark',darkMode?'1':'0'); });
    $('checkUpdateBtn')?.addEventListener('click',()=>{ let now=new Date().toLocaleDateString('zh-CN'); localStorage.setItem('tupdate',now); $('updateInfo').textContent=`上次检测：${now}`; toast('✅ 已是最新数据'); });
    let lastUpdate=localStorage.getItem('tupdate'); if(lastUpdate)$('updateInfo').textContent=`上次检测：${lastUpdate}`;
  }
  document.addEventListener('DOMContentLoaded',init);
})();
