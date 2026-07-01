(function(){
  'use strict';
  const $ = id => document.getElementById(id);
  const PageSize = 20; // items per page for document list view

  let laws = [];
  let favorites = JSON.parse(localStorage.getItem('tfav') || '[]');
  let darkMode = localStorage.getItem('tdark') === '1';
  let currentPage = 'home';
  let currentDoc = null;
  // For paginated categories
  let currentFilter = '';
  let currentPageIdx = 1;
  let filteredDocs = [];

  // ===== Toast =====
  function toast(msg) {
    const el = $('toast'); el.textContent = msg; el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2000);
  }

  // ===== Navigation =====
  function showPage(name) {
    ['home','detail','search','fav','settings'].forEach(p => {
      const el = $(`page${p.charAt(0).toUpperCase()+p.slice(1)}`);
      if (el) el.classList.toggle('hidden', p !== name);
    });
    document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === name));
    currentPage = name;
    // Scroll to top
    $('appBody').scrollTop = 0;
  }

  // ===== Render Home with Pagination =====
  function renderHome() {
    const container = $('categoryList');
    container.innerHTML = '';

    // Gather all laws into a flat list based on filter
    let docs = [];
    if (currentFilter === 'fav') {
      docs = laws.filter(l => favorites.includes(l.id));
    } else if (currentFilter === 'recent') {
      const recent = JSON.parse(localStorage.getItem('trecent') || '[]');
      docs = laws.filter(l => recent.includes(l.id));
    } else {
      docs = [...laws];
    }
    filteredDocs = docs;

    const totalPages = Math.ceil(docs.length / PageSize) || 1;
    if (currentPageIdx > totalPages) currentPageIdx = totalPages;
    const start = (currentPageIdx - 1) * PageSize;
    const pageItems = docs.slice(start, start + PageSize);

    // Group pageItems by category
    const groups = {};
    pageItems.forEach(l => {
      if (!groups[l.category]) groups[l.category] = [];
      groups[l.category].push(l);
    });

    const order = ['增值税','企业所得税','个人所得税','印花税','其他税费','税收征管','发票管理','地方文件'];
    order.forEach(cat => {
      if (!groups[cat]) return;
      const items = groups[cat];
      const g = document.createElement('div');
      g.className = 'cat-group';
      const h = document.createElement('div');
      h.className = 'cat-header';
      h.innerHTML = `<span>${cat}</span><span class="cat-count">${items.length}项</span>`;
      g.appendChild(h);
      const body = document.createElement('div');
      body.className = 'cat-items';
      items.forEach(doc => {
        body.appendChild(createDocRow(doc));
      });
      g.appendChild(body);
      container.appendChild(g);
    });

    if (docs.length === 0) {
      container.innerHTML = '<div class="empty-hint">暂无内容</div>';
    }

    // Pagination controls
    renderPagination(totalPages);
  }

  function renderPagination(totalPages) {
    const p = $('pagination');
    if (totalPages <= 1) { p.innerHTML = ''; return; }
    p.innerHTML = `
      <button class="page-btn" id="prevBtn" ${currentPageIdx <= 1 ? 'disabled' : ''}>← 上一页</button>
      <span class="page-info">${currentPageIdx}/${totalPages}</span>
      <button class="page-btn" id="nextBtn" ${currentPageIdx >= totalPages ? 'disabled' : ''}>下一页 →</button>
    `;
    $('prevBtn')?.addEventListener('click', () => {
      if (currentPageIdx > 1) { currentPageIdx--; renderHome(); resetListScroll(); }
    });
    $('nextBtn')?.addEventListener('click', () => {
      if (currentPageIdx < totalPages) { currentPageIdx++; renderHome(); resetListScroll(); }
    });
  }

  function resetListScroll() {
    $('appBody').scrollTop = 0;
  }

  // ===== Create Doc Row =====
  function createDocRow(doc) {
    const r = document.createElement('div');
    r.className = 'doc-row';
    const isFav = favorites.includes(doc.id);
    const isLocal = doc.region && doc.region !== '全国';
    r.innerHTML = `
      <div class="doc-row-info">
        <div class="doc-row-title">${doc.title}</div>
        <div class="doc-row-meta">
          <span>${doc.subCategory || ''}</span>
          ${isLocal ? `<span class="badge-local">${doc.region}</span>` : ''}
          <span>${doc.status || ''}</span>
        </div>
      </div>
      <button class="doc-fav-btn" data-id="${doc.id}">${isFav ? '⭐' : '☆'}</button>
    `;
    r.addEventListener('click', e => {
      if (e.target.closest('.doc-fav-btn')) return;
      showDetail(doc);
    });
    r.querySelector('.doc-fav-btn').addEventListener('click', e => {
      e.stopPropagation();
      toggleFav(doc.id);
    });
    return r;
  }

  // ===== Detail =====
  function showDetail(doc) {
    currentDoc = doc;
    // Record recent
    let recent = JSON.parse(localStorage.getItem('trecent') || '[]');
    recent = [doc.id, ...recent.filter(id => id !== doc.id)].slice(0, 30);
    localStorage.setItem('trecent', JSON.stringify(recent));

    showPage('detail');
    const isFav = favorites.includes(doc.id);
    const isLocal = doc.region && doc.region !== '全国';
    const container = $('detailContent');
    container.innerHTML = `
      <div class="detail-header">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;">
          <h2>${doc.title}</h2>
          <button class="doc-fav-btn" data-id="${doc.id}" style="font-size:22px;">${isFav ? '⭐' : '☆'}</button>
        </div>
        <div class="detail-meta">
          ${doc.docNo ? `<span><span class="label">文号：</span>${doc.docNo}</span>` : ''}
          <span><span class="label">发布：</span>${doc.publishDate || '-'}</span>
          ${doc.updateDate !== doc.publishDate ? `<span><span class="label">更新：</span>${doc.updateDate || '-'}</span>` : ''}
          ${isLocal ? `<span class="badge-local">${doc.region}</span>` : ''}
          <span>${doc.status || ''}</span>
        </div>
        ${doc.summary ? `<div class="detail-summary">${doc.summary}</div>` : ''}
      </div>
      <div class="detail-body"></div>
    `;
    const body = container.querySelector('.detail-body');
    
    if (Array.isArray(doc.content)) {
      doc.content.forEach(s => {
        const b = document.createElement('div');
        b.className = 'section-block';
        const lines = s.text.split('\n').map(l => l.trim()).filter(l => l);
        const html = lines.map(l => {
          if (l.match(/^(级数|级)\s/)) return `<div style="font-family:monospace;font-size:13px;padding:1px 0;">${l}</div>`;
          return l;
        }).join('<br>');
        b.innerHTML = `<div class="section-title">${s.section}</div><div class="section-text">${html}</div>`;
        body.appendChild(b);
      });
    } else if (typeof doc.content === 'string' && doc.content) {
      const b = document.createElement('div');
      b.className = 'section-block';
      b.innerHTML = `<div class="section-text">${doc.content}</div>`;
      body.appendChild(b);
    }

    // Fav button in detail
    container.querySelector('.doc-fav-btn')?.addEventListener('click', function() {
      toggleFav(doc.id);
      this.textContent = favorites.includes(doc.id) ? '⭐' : '☆';
    });
  }

  // ===== Favorites =====
  function toggleFav(id) {
    const idx = favorites.indexOf(id);
    if (idx === -1) { favorites.push(id); toast('已收藏'); }
    else { favorites.splice(idx, 1); toast('已取消收藏'); }
    localStorage.setItem('tfav', JSON.stringify(favorites));
    $('favCount').textContent = favorites.length;
    // Re-render current view
    if (currentPage === 'home') renderHome();
    if (currentPage === 'fav') renderFavPage();
  }

  function renderFavPage() {
    const container = $('favContent');
    const fDocs = laws.filter(l => favorites.includes(l.id));
    if (fDocs.length === 0) {
      container.innerHTML = '<div class="empty-hint">⭐ 还没有收藏的法规</div>';
      $('favPagination').innerHTML = '';
      return;
    }
    // Paginate
    const ps = 20;
    const tp = Math.ceil(fDocs.length / ps) || 1;
    let pi = parseInt(sessionStorage.getItem('favPage') || '1');
    if (pi > tp) pi = tp;
    const start = (pi-1)*ps;
    const items = fDocs.slice(start, start+ps);
    container.innerHTML = '';
    items.forEach(d => container.appendChild(createDocRow(d)));

    const p = $('favPagination');
    if (tp <= 1) { p.innerHTML = ''; return; }
    p.innerHTML = `
      <button class="page-btn" id="fpPrev" ${pi<=1?'disabled':''}>← 上一页</button>
      <span class="page-info">${pi}/${tp}</span>
      <button class="page-btn" id="fpNext" ${pi>=tp?'disabled':''}>下一页 →</button>
    `;
    $('fpPrev')?.addEventListener('click', () => { let p = Math.max(1, parseInt(sessionStorage.getItem('favPage')||'1')-1); sessionStorage.setItem('favPage',p); renderFavPage(); });
    $('fpNext')?.addEventListener('click', () => { let p = Math.min(tp, parseInt(sessionStorage.getItem('favPage')||'1')+1); sessionStorage.setItem('favPage',p); renderFavPage(); });
  }

  // ===== Search =====
  function performSearch(q) {
    const container = $('searchResults');
    if (!q.trim()) { container.innerHTML = '<div class="empty-hint">输入关键词搜索</div>'; $('searchPagination').innerHTML = ''; return; }
    const kw = q.toLowerCase();
    const results = laws.filter(l => 
      l.title.toLowerCase().includes(kw) ||
      (l.docNo && l.docNo.toLowerCase().includes(kw)) ||
      (l.summary && l.summary.toLowerCase().includes(kw)) ||
      (Array.isArray(l.content) && l.content.some(s => s.text.toLowerCase().includes(kw) || s.section.toLowerCase().includes(kw)))
    );
    
    // Paginate search results
    const ps = 20;
    const tp = Math.ceil(results.length / ps) || 1;
    let pi = parseInt(sessionStorage.getItem('searchPage') || '1');
    if (pi > tp) pi = tp;
    const start = (pi-1)*ps;
    const items = results.slice(start, start+ps);
    
    container.innerHTML = `<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">找到 ${results.length} 条结果</div>`;
    if (results.length === 0) { container.innerHTML += '<div class="empty-hint">未找到匹配</div>'; $('searchPagination').innerHTML = ''; return; }
    items.forEach(d => container.appendChild(createDocRow(d)));

    const p = $('searchPagination');
    if (tp <= 1) { p.innerHTML = ''; return; }
    p.innerHTML = `
      <button class="page-btn" id="spPrev" ${pi<=1?'disabled':''}>← 上一页</button>
      <span class="page-info">${pi}/${tp}</span>
      <button class="page-btn" id="spNext" ${pi>=tp?'disabled':''}>下一页 →</button>
    `;
    $('spPrev')?.addEventListener('click', () => { let p = Math.max(1, parseInt(sessionStorage.getItem('searchPage')||'1')-1); sessionStorage.setItem('searchPage',p); performSearch($('globalSearchInput').value); });
    $('spNext')?.addEventListener('click', () => { let p = Math.min(tp, parseInt(sessionStorage.getItem('searchPage')||'1')+1); sessionStorage.setItem('searchPage',p); performSearch($('globalSearchInput').value); });
  }

  // ===== Init =====
  async function init() {
    // Dark mode
    if (darkMode) document.body.classList.add('dark');
    $('darkSwitch')?.classList.toggle('on', darkMode);

    // Load data
    try {
      const resp = await fetch('data/embed.json');
      laws = await resp.json();
    } catch(e) {
      // Fallback: try comprehensive
      try {
        const resp = await fetch('data/tax-laws-comprehensive.json');
        laws = await resp.json();
      } catch(e2) {
        $('categoryList').innerHTML = '<div class="empty-hint">数据加载失败，请刷新重试</div>';
        return;
      }
    }

    // Update stats
    const cats = new Set(laws.map(l => l.category));
    const localFiles = laws.filter(l => l.region && l.region !== '全国').length;
    $('statsCard').innerHTML = `
      <div class="stat-row"><span>📄 法规总数</span><span class="val">${laws.length} 项</span></div>
      <div class="stat-row"><span>📂 覆盖类别</span><span class="val">${cats.size} 类</span></div>
      <div class="stat-row"><span>📍 地方文件</span><span class="val">${localFiles} 项</span></div>
    `;
    $('favCount').textContent = favorites.length;

    // Render home
    renderHome();

    // === Events ===
    // Bottom nav
    document.querySelectorAll('.nav-item').forEach(btn => {
      btn.addEventListener('click', () => {
        const page = btn.dataset.page;
        if (page === 'home') { currentPageIdx = 1; renderHome(); showPage('home'); }
        else if (page === 'fav') { sessionStorage.setItem('favPage','1'); renderFavPage(); showPage('fav'); }
        else if (page === 'search') { sessionStorage.setItem('searchPage','1'); $('searchResults').innerHTML = '<div class="empty-hint">输入关键词搜索</div>'; $('searchPagination').innerHTML = ''; showPage('search'); $('globalSearchInput').focus(); }
        else if (page === 'settings') { showPage('settings'); }
      });
    });

    // Search toggle
    $('searchToggleBtn').addEventListener('click', () => {
      $('searchBar').classList.toggle('hidden');
      if (!$('searchBar').classList.contains('hidden')) $('searchInput').focus();
    });
    $('searchInput').addEventListener('input', e => {
      const v = e.target.value.trim().toLowerCase();
      if (!v) { renderHome(); return; }
      const results = laws.filter(l => l.title.toLowerCase().includes(v) || (l.docNo && l.docNo.toLowerCase().includes(v)));
      // Show filtered in home
      const groups = {};
      results.forEach(l => { if(!groups[l.category]) groups[l.category]=[]; groups[l.category].push(l); });
      const container = $('categoryList');
      container.innerHTML = `<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">搜索 "${v}" 找到 ${results.length} 条</div>`;
      const order = ['增值税','企业所得税','个人所得税','印花税','其他税费','税收征管','发票管理','地方文件'];
      order.forEach(cat => {
        if (!groups[cat]) return;
        const g = document.createElement('div'); g.className = 'cat-group';
        g.innerHTML = `<div class="cat-header">${cat}<span class="cat-count">${groups[cat].length}项</span></div>`;
        const b = document.createElement('div'); b.className = 'cat-items';
        groups[cat].forEach(d => b.appendChild(createDocRow(d)));
        g.appendChild(b); container.appendChild(g);
      });
      if (results.length === 0) container.innerHTML = '<div class="empty-hint">未找到匹配</div>';
      $('pagination').innerHTML = '';
    });
    $('searchClearBtn').addEventListener('click', () => {
      $('searchInput').value = ''; $('searchBar').classList.add('hidden'); renderHome();
    });

    // Global search
    $('globalSearchInput').addEventListener('input', e => performSearch(e.target.value));

    // Quick filters
    document.querySelectorAll('.qf-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter || '';
        currentPageIdx = 1;
        renderHome();
      });
    });

    // Detail back
    $('detailBackBtn').addEventListener('click', () => { showPage('home'); renderHome(); });

    // Fav button in header
    $('favGoBtn').addEventListener('click', () => {
      sessionStorage.setItem('favPage','1');
      renderFavPage();
      showPage('fav');
    });

    // Dark mode
    $('darkSwitch')?.addEventListener('click', function() {
      darkMode = !darkMode;
      document.body.classList.toggle('dark', darkMode);
      this.classList.toggle('on', darkMode);
      localStorage.setItem('tdark', darkMode ? '1' : '0');
    });

    // Update check
    $('checkUpdateBtn')?.addEventListener('click', () => {
      const now = new Date().toLocaleDateString('zh-CN');
      localStorage.setItem('tupdate', now);
      $('updateInfo').textContent = `上次检测：${now}`;
      toast('✅ 已是最新数据');
    });
    const lastUpdate = localStorage.getItem('tupdate');
    if (lastUpdate) $('updateInfo').textContent = `上次检测：${lastUpdate}`;
  }

  document.addEventListener('DOMContentLoaded', init);
})();
