(function () {
  'use strict';

  var toastEl = document.getElementById('toast');
  var toastTimer, toastMsgTimer;
  function toast(msg) {
    if (!toastEl) return;
    // Clear first so screen readers announce a repeated identical message.
    toastEl.textContent = '';
    clearTimeout(toastMsgTimer);
    clearTimeout(toastTimer);
    toastMsgTimer = setTimeout(function () {
      toastEl.textContent = msg;
      toastEl.classList.add('show');
      toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, 2000);
    }, 30);
  }

  function copy(text, label) {
    var ok = 'Copied ' + (label || 'to clipboard');
    var fail = 'Copy failed, select the text manually';
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(
        function () { toast(ok); },
        function () { toast(fallback(text) ? ok : fail); });
    } else {
      toast(fallback(text) ? ok : fail);
    }
  }
  function fallback(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    var previous = document.activeElement;
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    if (previous && previous.focus) previous.focus({ preventScroll: true });
    return ok;
  }

  // Theme toggle. With no stored choice the page follows the system setting.
  var root = document.documentElement;
  var themeBtn = document.querySelector('.theme-btn');
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function isDark() {
    var t = root.getAttribute('data-theme');
    return t ? t === 'dark' : !!(darkQuery && darkQuery.matches);
  }
  function syncThemeBtn() {
    if (themeBtn) themeBtn.setAttribute('aria-pressed', String(isDark()));
  }
  if (themeBtn) {
    themeBtn.addEventListener('click', function () {
      var next = isDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      try { localStorage.setItem('theme', next); } catch (e) { /* not stored, still applied */ }
      syncThemeBtn();
    });
    if (darkQuery && darkQuery.addEventListener) darkQuery.addEventListener('change', syncThemeBtn);
    syncThemeBtn();
  }

  // Mobile menu
  var menuBtn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  if (menuBtn && nav) {
    var setOpen = function (open) {
      nav.classList.toggle('open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
    };
    menuBtn.addEventListener('click', function () { setOpen(!nav.classList.contains('open')); });
    nav.addEventListener('click', function (e) { if (e.target.closest('a')) setOpen(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) { setOpen(false); menuBtn.focus(); }
    });
    document.addEventListener('click', function (e) {
      if (nav.classList.contains('open') && !e.target.closest('.site-header')) setOpen(false);
    });
  }

  // Code card tabs (WAI-ARIA tabs pattern) + copy
  document.querySelectorAll('[data-tabs]').forEach(function (card) {
    var tabs = Array.prototype.slice.call(card.querySelectorAll('[role="tab"]'));
    function select(tab) {
      tabs.forEach(function (t) {
        var selected = t === tab;
        t.setAttribute('aria-selected', String(selected));
        t.tabIndex = selected ? 0 : -1;
        document.getElementById(t.getAttribute('aria-controls')).hidden = !selected;
      });
    }
    // Without JS both snippets show; with JS they become tab panels.
    card.querySelectorAll('[data-tabpanel]').forEach(function (panel) {
      panel.setAttribute('role', 'tabpanel');
      panel.tabIndex = 0;
    });
    select(tabs[0]);
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () { select(tab); });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) { e.preventDefault(); select(next); next.focus(); }
      });
    });
    var copyBtn = card.querySelector('[data-copy-panel]');
    if (copyBtn) {
      copyBtn.addEventListener('click', function () {
        var panel = card.querySelector('[role="tabpanel"]:not([hidden])');
        if (panel) copy(panel.textContent, 'snippet');
      });
    }
  });

  // Module catalog
  var list = document.getElementById('module-list');
  if (!list) return;
  var modules = Array.prototype.slice.call(list.querySelectorAll('.module'));
  var search = document.getElementById('module-search');
  var empty = document.getElementById('module-empty');
  var status = document.getElementById('module-status');
  var chips = document.querySelectorAll('.chip[data-filter]');
  var more = document.getElementById('module-more');
  var current = 'all';
  var PREVIEW = 12;
  var expanded = false;

  // Search text comes from the card's content (not its buttons and links)
  // plus optional data-tags, so a description is edited in one place only.
  var haystacks = modules.map(function (m) {
    var parts = Array.prototype.map.call(m.querySelectorAll('.cat, h3, p, .artifact span'), function (el) { return el.textContent; });
    parts.push(m.getAttribute('data-tags') || '');
    return parts.join(' ').toLowerCase().replace(/\s+/g, ' ');
  });

  // Copy buttons take the artifact id from the visible text next to them.
  modules.forEach(function (m) {
    var span = m.querySelector('.artifact span');
    var btn = m.querySelector('.artifact button');
    if (!span || !btn) return;
    var id = span.textContent.trim();
    btn.setAttribute('aria-label', 'Copy ' + id);
    btn.addEventListener('click', function () { copy(id, id); });
  });

  document.querySelectorAll('[data-module-count]').forEach(function (el) {
    el.textContent = String(modules.length);
  });

  chips.forEach(function (chip) {
    var f = chip.getAttribute('data-filter');
    var n = f === 'all' ? modules.length : modules.filter(function (m) { return m.dataset.cat === f; }).length;
    var span = document.createElement('span');
    span.className = 'n';
    span.textContent = n;
    chip.append(' ', span);
    chip.addEventListener('click', function () {
      current = f;
      chips.forEach(function (c) { c.setAttribute('aria-pressed', String(c === chip)); });
      apply(true);
    });
  });

  if (more) {
    var moreBtn = more.querySelector('button');
    moreBtn.textContent = 'Show all ' + modules.length + ' modules';
    moreBtn.addEventListener('click', function () {
      expanded = true;
      apply(true);
      // The button disappears; move focus to the first newly revealed card.
      var heading = modules[PREVIEW] && modules[PREVIEW].querySelector('h3');
      if (heading) { heading.tabIndex = -1; heading.focus(); }
    });
  }

  var announceTimer;
  function apply(announce) {
    clearTimeout(announceTimer);
    var terms = (search.value || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    var collapse = !expanded && current === 'all' && terms.length === 0;
    var shown = 0;
    modules.forEach(function (m, i) {
      var ok = (current === 'all' || m.dataset.cat === current) &&
        terms.every(function (t) { return haystacks[i].indexOf(t) !== -1; });
      if (ok) shown++;
      m.hidden = !ok || (collapse && shown > PREVIEW);
    });
    var truncated = collapse && shown > PREVIEW;
    if (more) more.hidden = !truncated;
    empty.classList.toggle('show', shown === 0);
    if (announce && status) {
      var msg = shown === 0 ? 'No modules match'
        : truncated ? 'Showing ' + PREVIEW + ' of ' + shown + ' modules'
        : shown + (shown === 1 ? ' module' : ' modules') + ' shown';
      announceTimer = setTimeout(function () { status.textContent = msg; }, 400);
    }
  }

  apply(false);
  search.addEventListener('input', function () { apply(true); });
  search.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && search.value) { search.value = ''; apply(true); }
  });
})();
