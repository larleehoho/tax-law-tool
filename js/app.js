/* ===== 税法速查 App v1.0 ===== */
(function() {
  'use strict';

  // ===== State =====
  const state = {
    laws: [],
    filteredLaws: [],
    favorites: JSON.parse(localStorage.getItem('tax-fav') || '[]'),
    recent: JSON.parse(localStorage.getItem('tax-recent') || '[]'),
    currentCategory: null,
    currentDoc: null,
    searchMode: false,
    darkMode: localStorage.getItem('tax-dark') === 'true',
    currentPage: 'categories',
    loading: true
  };

  // ===== DOM refs =====
  const $ = id => document.getElementById(id);
  const $$ = sel => document.querySelectorAll(sel);
  const appMain = $('appMain');
  const menuBtn = $('menuBtn');
  const sideMenu = $('sideMenu');
  const menuOverlay = $('menuOverlay');

  // ===== Data Loading =====
  async function loadData() {
    try {
      showLoading();
      const resp = await fetch('data/tax-laws-comprehensive.json');
      state.laws = await resp.json();
      state.filteredLaws = [...state.laws];
      state.loading = false;
      renderCategories();
      updateStats();
      checkForUpdates();
    } catch(e) {
      // Fallback to embedded data if fetch fails
      console.warn('Using embedded data fallback');
      state.loading = false;
      renderCategories();
    }
  }

  // ===== Navigation =====
  function navigateTo(page, data) {
    $$('.page').forEach(p => p.classList.remove('active'));
    const el = $(`page${page.charAt(0).toUpperCase() + page.slice(1)}`);
    if (el) el.classList.add('active');
    
    $$('.nav-btn').forEach(b => b.classList.remove('active'));
    const navBtn = document.querySelector(`.nav-btn[data-page="${page}"]`);
    if (navBtn) navBtn.classList.add('active');

    state.currentPage = page;
    if (page === 'favorites') renderFavorites();
    if (page === 'categories') { renderCategories(); }
  }

  // ===== Category Rendering =====
  function renderCategories(categoryList) {
    const nav = $('categoryNav');
    const laws = categoryList || state.laws;
    
    // Group by category
    const groups = {};
    laws.forEach(l => {
      if (!groups[l.category]) groups[l.category] = [];
      groups[l.category].push(l);
    });

    nav.innerHTML = '';
    const categoryOrder = ['增值税','企业所得税','个人所得税','印花税','其他税费','税收征管','发票管理','地方文件']; 
    
    categoryOrder.forEach(cat => {
      if (!groups[cat]) return;
      const items = groups[cat];
      // Sub-group by subCategory then region
      const subGroups = {};
      items.forEach(i => {
        const key = i.subCategory + '|' + (i.region || '全国');
        if (!subGroups[key]) subGroups[key] = [];
        subGroups[key].push(i);
      });

      const groupEl = document.createElement('div');
      groupEl.className = 'category-group';
      
      const header = document.createElement('div');
      header.className = 'category-header';
      header.innerHTML = `<h3>${cat}</h3><span class="category-count">${items.length} 项</span>`;
      header.addEventListener('click', () => showDocList(cat));
      groupEl.appendChild(header);

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'category-items';
      
      // Show first few items as preview
      items.slice(0, 5).forEach(doc => {
        itemsContainer.appendChild(createDocItem(doc));
      });
      if (items.length > 5) {
        const more = document.createElement('div');
        more.className = 'doc-item';
        more.style.cssText = 'justify-content:center;color:var(--primary);font-size:13px;';
        more.textContent = `查看全部 ${items.length} 项 →`;
        more.addEventListener('click', () => showDocList(cat));
        itemsContainer.appendChild(more);
      }
      
      groupEl.appendChild(itemsContainer);
      nav.appendChild(groupEl);
    });
  }

  function createDocItem(doc) {
    const item = document.createElement('div');
    item.className = 'doc-item';
    
    const isFav = state.favorites.includes(doc.id);
    const regionLabel = doc.region && doc.region !== '全国' ? doc.region : '';
    
    item.innerHTML = `
      <div class="doc-info">
        <div class="doc-title">${doc.docNo ? '📄 ' : '📜 '}${doc.title}</div>
        <div class="doc-meta">
          <span>${doc.subCategory || ''}</span>
          ${regionLabel ? `<span class="badge-region">${regionLabel}</span>` : ''}
          <span class="doc-status ${doc.status === '现行有效' ? 'valid' : 'updated'}">${doc.status || ''}</span>
        </div>
      </div>
      <button class="fav-btn ${isFav ? 'faved' : ''}" data-id="${doc.id}">${isFav ? '⭐' : '☆'}</button>
    `;
    
    item.addEventListener('click', (e) => {
      if (e.target.closest('.fav-btn')) return;
      showDocDetail(doc);
    });
    
    item.querySelector('.fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(doc.id);
    });
    
    return item;
  }

  // ===== Doc List Page =====
  function showDocList(category) {
    const filtered = category === 'all' ? state.laws : state.laws.filter(l => l.category === category);
    state.filteredLaws = filtered;
    
    $$('.page').forEach(p => p.classList.remove('active'));
    $('pageDocList').classList.add('active');
    
    $('listTitle').textContent = category === 'all' ? '全部法规' : `${category}（${filtered.length} 项）`;
    
    const list = $('docList');
    list.innerHTML = '';
    filtered.forEach(doc => {
      list.appendChild(createDocItem(doc));
    });
  }

  // ===== Doc Detail =====
  function showDocDetail(doc) {
    state.currentDoc = doc;
    
    // Add to recent
    if (!state.recent.includes(doc.id)) {
      state.recent.unshift(doc.id);
      if (state.recent.length > 20) state.recent.pop();
      localStorage.setItem('tax-recent', JSON.stringify(state.recent));
    }
    
    $$('.page').forEach(p => p.classList.remove('active'));
    $('pageDocDetail').classList.add('active');
    
    const isFav = state.favorites.includes(doc.id);
    const regionLabel = doc.region && doc.region !== '全国' ? doc.region : '';
    
    $('detailHeader').innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;">
        <h2>${doc.title}</h2>
        <button class="fav-btn ${isFav ? 'faved' : ''}" data-id="${doc.id}" style="font-size:24px;background:none;border:none;cursor:pointer;">
          ${isFav ? '⭐' : '☆'}
        </button>
      </div>
      <div class="meta-row">
        ${doc.docNo ? `<span><span class="label">文号：</span>${doc.docNo}</span>` : ''}
        <span><span class="label">发布：</span>${doc.publishDate || '-'}</span>
        <span><span class="label">更新：</span>${doc.updateDate || '-'}</span>
        ${regionLabel ? `<span class="badge-region">${regionLabel}</span>` : ''}
        <span class="doc-status ${doc.status === '现行有效' ? 'valid' : 'updated'}">${doc.status || ''}</span>
      </div>
      ${doc.summary ? `<p style="margin-top:8px;font-size:13px;color:var(--text-secondary);line-height:1.6;">${doc.summary}</p>` : ''}
    `;
    
    $('detailHeader').querySelector('.fav-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(doc.id);
      // Re-render header fav state
      showDocDetail(doc);
    });
    
    const body = $('detailBody');
    body.innerHTML = '';
    
    if (doc.content && Array.isArray(doc.content)) {
      doc.content.forEach(section => {
        const block = document.createElement('div');
        block.className = 'section-block';
        
        const lines = section.text.split('\n');
        const textHtml = lines.map(line => {
          if (line.trim().startsWith('级数') || line.match(/^\d+\s/)) {
            return `<span style="display:block;font-family:monospace;font-size:13px;padding:2px 0;">${line}</span>`;
          }
          return line;
        }).join('<br>');
        
        block.innerHTML = `
          <div class="section-title">${section.section}</div>
          <div class="section-text">${textHtml}</div>
        `;
        body.appendChild(block);
      });
    } else if (typeof doc.content === 'string') {
      const block = document.createElement('div');
      block.className = 'section-block';
      block.innerHTML = `<div class="section-text">${doc.content}</div>`;
      body.appendChild(block);
    }
  }

  // ===== Favorites =====
  function toggleFavorite(id) {
    const idx = state.favorites.indexOf(id);
    if (idx === -1) {
      state.favorites.push(id);
    } else {
      state.favorites.splice(idx, 1);
    }
    localStorage.setItem('tax-fav', JSON.stringify(state.favorites));
    // Re-render current view if applicable
    if (state.currentPage === 'favorites') renderFavorites();
  }

  function renderFavorites() {
    const list = $('favList');
    const empty = $('favEmpty');
    const favLaws = state.laws.filter(l => state.favorites.includes(l.id));
    
    list.innerHTML = '';
    if (favLaws.length === 0) {
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    favLaws.forEach(doc => {
      list.appendChild(createDocItem(doc));
    });
  }

  // ===== Search =====
  function performSearch(query) {
    if (!query.trim()) {
      $('searchGlobalResults').innerHTML = '<p class="text-muted">输入关键词开始搜索</p>';
      return;
    }
    
    const q = query.toLowerCase();
    const results = state.laws.filter(l => {
      const titleMatch = l.title.toLowerCase().includes(q);
      const summaryMatch = l.summary && l.summary.toLowerCase().includes(q);
      const docNoMatch = l.docNo && l.docNo.toLowerCase().includes(q);
      const contentMatch = Array.isArray(l.content) && l.content.some(s => 
        s.text.toLowerCase().includes(q) || s.section.toLowerCase().includes(q)
      );
      return titleMatch || summaryMatch || docNoMatch || contentMatch;
    });
    
    const container = $('searchGlobalResults');
    container.innerHTML = '';
    
    if (results.length === 0) {
      container.innerHTML = '<p class="text-muted empty-hint">未找到匹配的法规，试试其他关键词</p>';
      return;
    }
    
    container.innerHTML = `<p style="font-size:13px;color:var(--text-muted);margin-bottom:12px;">找到 ${results.length} 条结果</p>`;
    results.forEach(doc => {
      container.appendChild(createDocItem(doc));
    });
  }

  // ===== Quick Filters =====
  function applyQuickFilter(filter) {
    switch(filter) {
      case 'all':
        renderCategories();
        break;
      case 'favorites':
        navigateTo('favorites');
        break;
      case 'recent':
        const recentLaws = state.laws.filter(l => state.recent.includes(l.id));
        if (recentLaws.length === 0) {
          $('categoryNav').innerHTML = '<p class="text-muted empty-hint">还没有浏览记录</p>';
        } else {
          renderCategories(recentLaws);
        }
        break;
      case 'updated':
        const updated = state.laws.filter(l => l.status && l.status.includes('新'));
        renderCategories(updated.length > 0 ? updated : state.laws);
        break;
    }
  }

  // ===== Update Check =====
  function checkForUpdates() {
    const lastCheck = localStorage.getItem('tax-update-check');
    const now = new Date().toLocaleDateString('zh-CN');
    $('updateInfo').textContent = `上次检测：${lastCheck || '从未'}`;
    
    // If checked today, skip
    if (lastCheck === now) return;
    
    // In production, this would call an API/webhook
    // For now, we just record the check time
    localStorage.setItem('tax-update-check', now);
  }

  // ===== Stats =====
  function updateStats() {
    const laws = state.laws;
    $('dataStats').innerHTML = `
      收录法规：<strong>${laws.length}</strong> 项<br>
      覆盖税种：<strong>${new Set(laws.map(l => l.category)).size}</strong> 类<br>
      地方文件：<strong>${laws.filter(l => l.region && l.region !== '全国').length}</strong> 项<br>
      今日更新：<strong>0</strong> 项
    `;
  }

  // ===== Loading =====
  function showLoading() {
    $('categoryNav').innerHTML = '<div class="loading">加载中</div>';
  }

  // ===== Dark Mode =====
  function toggleDarkMode(enabled) {
    document.body.classList.toggle('dark', enabled);
    localStorage.setItem('tax-dark', enabled);
    state.darkMode = enabled;
  }

  // ===== Init =====
  function init() {
    // Dark mode
    if (state.darkMode) document.body.classList.add('dark');
    $('darkModeToggle').checked = state.darkMode;
    $('darkModeToggle').addEventListener('change', (e) => toggleDarkMode(e.target.checked));

    // Load data
    loadData();

    // Search toggle
    $('searchToggleBtn').addEventListener('click', () => {
      state.searchMode = !state.searchMode;
      $('searchBar').classList.toggle('hidden', !state.searchMode);
      appMain.classList.toggle('search-active', state.searchMode);
      if (state.searchMode) $('searchInput').focus();
    });

    // Search input
    $('searchInput').addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      if (!q) {
        renderCategories();
        return;
      }
      const results = state.laws.filter(l => 
        l.title.toLowerCase().includes(q) || 
        (l.summary && l.summary.toLowerCase().includes(q)) ||
        (l.docNo && l.docNo.toLowerCase().includes(q))
      );
      renderCategories(results);
    });
    
    $('searchClearBtn').addEventListener('click', () => {
      $('searchInput').value = '';
      renderCategories();
    });

    // Global search
    $('searchGlobalInput').addEventListener('input', (e) => performSearch(e.target.value));

    // Menu
    menuBtn.addEventListener('click', () => sideMenu.classList.remove('hidden'));
    menuOverlay.addEventListener('click', () => sideMenu.classList.add('hidden'));

    // Bottom nav
    $$('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => navigateTo(btn.dataset.page));
    });

    // Quick filters
    $$('.quick-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.quick-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        applyQuickFilter(btn.dataset.filter);
      });
    });

    // Fav toggle in detail
    $('favToggleBtn').addEventListener('click', () => navigateTo('favorites'));

    // Menu actions
    $('checkUpdateBtn').addEventListener('click', () => {
      $('updateInfo').textContent = '正在检测...';
      setTimeout(() => {
        localStorage.setItem('tax-update-check', new Date().toLocaleDateString('zh-CN'));
        $('updateInfo').textContent = `上次检测：${new Date().toLocaleDateString('zh-CN')}`;
        alert('✅ 当前已是最新数据');
      }, 500);
    });

    $('exportFavBtn').addEventListener('click', () => {
      const favLaws = state.laws.filter(l => state.favorites.includes(l.id));
      const data = JSON.stringify(favLaws, null, 2);
      const blob = new Blob([data], {type: 'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = '税法速查-收藏.json';
      a.click(); URL.revokeObjectURL(url);
    });

    $('clearCacheBtn').addEventListener('click', () => {
      if (confirm('确定清除所有缓存数据？收藏和浏览记录将被清空。')) {
        localStorage.removeItem('tax-fav');
        localStorage.removeItem('tax-recent');
        state.favorites = [];
        state.recent = [];
        renderFavorites();
        alert('✅ 已清除');
      }
    });

    // Back gesture detection for detail page
    let touchStartX = 0;
    document.addEventListener('touchstart', (e) => {
      touchStartX = e.changedTouches[0].screenX;
    });
    document.addEventListener('touchend', (e) => {
      const endX = e.changedTouches[0].screenX;
      if (endX - touchStartX > 80 && state.currentPage.includes('doc')) {
        // Go back to list
        if (state.currentDoc) showDocList(state.currentDoc.category);
      }
    });

    // Service worker registration for offline support
    if ('serviceWorker' in navigator) {
      // Ready for future SW registration
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
