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

  // BOM version switch: the long-term support line is the default; the
  // choice is remembered like the theme.
  var bomButtons = document.querySelectorAll('.bom-switch [data-line]');
  function setLine(line, store) {
    document.querySelectorAll('[data-bom]').forEach(function (el) {
      el.textContent = el.getAttribute(line === 'current' ? 'data-current' : 'data-lts');
    });
    bomButtons.forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-line') === line)); });
    if (store) { try { localStorage.setItem('bom-line', line); } catch (e) { /* not stored */ } }
  }
  if (bomButtons.length) {
    bomButtons.forEach(function (b) {
      b.addEventListener('click', function () { setLine(b.getAttribute('data-line'), true); });
    });
    var savedLine = null;
    try { savedLine = localStorage.getItem('bom-line'); } catch (e) { /* ignore */ }
    if (savedLine === 'current') setLine('current', false);
  }

  // Mobile menu
  var menuBtn = document.querySelector('.menu-btn');
  var nav = document.getElementById('nav');
  var closeSearch = function () {};
  function closeMenu() {
    if (menuBtn && nav) { nav.classList.remove('open'); menuBtn.setAttribute('aria-expanded', 'false'); }
  }
  if (menuBtn && nav) {
    var setOpen = function (open) {
      if (open) closeSearch();
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

  // Site search. The Pagefind index (/pagefind/) is built after Jekyll by
  // scripts/pagefind.sh; its script is loaded on first use. Module pages
  // carry a version filter ("lts" or "current"); a search shows one line at
  // a time, so a page never appears twice, and pages without the filter
  // (developer docs, homepage) appear in both.
  var searchRoot = document.querySelector('[data-search]');
  if (searchRoot) closeSearch = initSearch(searchRoot) || closeSearch;

  function initSearch(root) {
    var SEARCH_COMPACT = window.matchMedia('(max-width: 1099px)'); // as in site.css
    var PAGE = 8;
    var toggle = root.querySelector('.search-toggle');
    var form = root.querySelector('form');
    var input = root.querySelector('input');
    var panel = root.querySelector('.search-results');
    var list = panel.querySelector('.search-list');
    var summary = panel.querySelector('.search-summary');
    var more = panel.querySelector('.search-more');
    var live = root.querySelector('.search-live');
    var scopeBtns = Array.prototype.slice.call(panel.querySelectorAll('[data-scope]'));
    var scope = scopeBtns.length && location.pathname.indexOf('/current/') === 0 ? 'current' : 'lts';
    var filters = { lts: { version: { none: ['current'] } }, current: { version: { none: ['lts'] } } };
    var pagefind = null;
    var seq = 0, results = [], shown = 0, inputTimer, liveTimer;

    function load() {
      if (!pagefind) {
        pagefind = import('/pagefind/pagefind.js').then(function (pf) {
          return pf.options({ excerptLength: 22 }).then(function () { return pf; });
        });
        pagefind.catch(function () { pagefind = null; });
      }
      return pagefind;
    }

    function isOpen() { return root.classList.contains('open'); }
    function setOpen(open) {
      root.classList.toggle('open', open);
      toggle.setAttribute('aria-expanded', String(open));
      if (open) closeMenu();
    }
    function hideResults() { panel.hidden = true; }
    // Closes the results (and on small screens the panel). Focus returns to
    // the field, or to the toggle when the field disappears.
    function close(focus) {
      hideResults();
      if (SEARCH_COMPACT.matches && isOpen()) {
        setOpen(false);
        if (focus) toggle.focus();
      } else if (focus) {
        input.focus();
      }
    }

    function announce(msg) {
      clearTimeout(liveTimer);
      live.textContent = '';
      liveTimer = setTimeout(function () { live.textContent = msg; }, 500);
    }
    function label(sc) { return summary.getAttribute('data-' + sc); }

    function run() {
      var q = input.value.trim();
      var my = ++seq;
      if (!q) { hideResults(); list.textContent = ''; return; }
      load().then(function (pf) {
        var other = scope === 'lts' ? 'current' : 'lts';
        return Promise.all([
          pf.search(q, scopeBtns.length ? { filters: filters[scope] } : {}),
          scopeBtns.length ? pf.search(q, { filters: filters[other] }) : null
        ]).then(function (r) {
          if (my !== seq) return;
          results = r[0] ? r[0].results : [];
          scopeBtns.forEach(function (b) {
            var n = b.getAttribute('data-scope') === scope ? results.length : (r[1] ? r[1].results.length : 0);
            b.querySelector('.n').textContent = '(' + n + ')';
            b.setAttribute('aria-label', b.firstChild.textContent.trim() + ', ' + n + (n === 1 ? ' result' : ' results'));
          });
          shown = 0;
          list.textContent = '';
          var where = scopeBtns.length ? ' in the ' + label(scope) : '';
          if (!results.length) {
            var elsewhere = r[1] && r[1].results.length;
            summary.textContent = 'No results for “' + q + '”' + where + '.' +
              (elsewhere ? ' The ' + label(scope === 'lts' ? 'current' : 'lts') + ' have ' + elsewhere + '.' : '');
          } else {
            summary.textContent = results.length + (results.length === 1 ? ' result' : ' results') + where;
          }
          panel.hidden = false;
          announce(summary.textContent);
          return showMore(my, false);
        });
      }).catch(function () {
        if (my !== seq) return;
        list.textContent = '';
        summary.textContent = 'Search is not available here. It needs the Pagefind index, which the site build creates.';
        more.hidden = true;
        panel.hidden = false;
        announce(summary.textContent);
      });
    }

    function showMore(my, focusFirst) {
      var batch = results.slice(shown, shown + PAGE);
      shown += batch.length;
      more.hidden = true;
      return Promise.all(batch.map(function (r) { return r.data(); })).then(function (data) {
        if (my !== seq) return;
        var first = null;
        data.forEach(function (d) {
          var li = render(d);
          first = first || li.querySelector('a');
          list.appendChild(li);
        });
        more.hidden = shown >= results.length;
        if (focusFirst && first) first.focus();
      });
    }

    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    }
    function excerpt(html) {
      // Pagefind escapes the page text and only adds <mark> around hits.
      var p = el('p', 'sr-excerpt');
      p.innerHTML = html;
      return p;
    }
    // A result: the page link (section label and title), then the sections
    // of the page with hits (headings with an id), best first. Hits before
    // the first such heading belong to the page itself. The excerpts are
    // outside the links so a link's name is just its title.
    function render(d) {
      var li = el('li');
      var page = el('a', 'sr-page');
      page.href = d.url;
      if (d.meta.section) page.appendChild(el('span', 'sr-where', d.meta.section));
      page.appendChild(el('span', 'sr-title', d.meta.title || d.url));
      li.appendChild(page);
      var subs = (d.sub_results || []).slice().sort(function (a, b) {
        return b.locations.length - a.locations.length;
      }).slice(0, 3);
      var top = subs.filter(function (s) { return !s.anchor; })[0];
      if (top || !subs.length) li.appendChild(excerpt(top ? top.excerpt : d.excerpt));
      subs.forEach(function (s) {
        if (!s.anchor) return;
        var div = el('div', 'sr-sub');
        var a = el('a');
        a.href = s.url;
        a.textContent = s.title;
        div.appendChild(a);
        div.appendChild(excerpt(s.excerpt));
        li.appendChild(div);
      });
      return li;
    }

    function links() { return Array.prototype.slice.call(list.querySelectorAll('a')); }

    input.addEventListener('focus', function () {
      load().catch(function () { /* reported when searching */ });
      if (input.value.trim() && list.childNodes.length) panel.hidden = false;
    });
    input.addEventListener('input', function () {
      clearTimeout(inputTimer);
      inputTimer = setTimeout(run, 120);
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var first = links()[0];
      if (first && !panel.hidden) location.href = first.href;
    });
    root.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        if (!panel.hidden || (SEARCH_COMPACT.matches && isOpen())) {
          e.preventDefault();
          e.stopPropagation();
          close(true);
        }
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var all = links();
      var i = all.indexOf(document.activeElement);
      if (e.target === input) {
        if (e.key !== 'ArrowDown' || !all.length || panel.hidden) return;
        e.preventDefault();
        all[0].focus();
      } else if (i !== -1) {
        e.preventDefault();
        if (e.key === 'ArrowDown') { if (all[i + 1]) all[i + 1].focus(); }
        else if (i > 0) all[i - 1].focus();
        else input.focus();
      }
    });
    scopeBtns.forEach(function (b) {
      b.addEventListener('click', function () {
        scope = b.getAttribute('data-scope');
        scopeBtns.forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
        run();
      });
      b.setAttribute('aria-pressed', String(b.getAttribute('data-scope') === scope));
    });
    more.addEventListener('click', function () { showMore(seq, true); });
    // A result on the current page only changes the hash; close the search.
    list.addEventListener('click', function (e) {
      if (e.target.closest('a')) { hideResults(); if (isOpen()) setOpen(false); }
    });
    toggle.addEventListener('click', function () {
      if (isOpen()) { close(false); return; }
      setOpen(true);
      input.focus();
    });
    // Close when the visitor clicks or tabs away from the search.
    document.addEventListener('click', function (e) {
      if (!root.contains(e.target)) { hideResults(); if (isOpen()) setOpen(false); }
    });
    root.addEventListener('focusout', function (e) {
      if (e.relatedTarget && !root.contains(e.relatedTarget)) { hideResults(); if (isOpen()) setOpen(false); }
    });
    // "/" focuses the search field, unless the visitor is typing elsewhere.
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
      var t = e.target;
      if (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      e.preventDefault();
      if (SEARCH_COMPACT.matches) setOpen(true);
      input.focus();
    });
    SEARCH_COMPACT.addEventListener('change', function () { if (!SEARCH_COMPACT.matches && isOpen()) setOpen(false); });

    return function () { hideResults(); if (isOpen()) setOpen(false); };
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

  // Copy buttons take the artifact id from the visible text next to them
  // (module cards on the homepage and the header of a module page).
  document.querySelectorAll('.artifact').forEach(function (a) {
    var span = a.querySelector('span');
    var btn = a.querySelector('button');
    if (!span || !btn) return;
    var id = span.textContent.trim();
    btn.setAttribute('aria-label', 'Copy ' + id);
    btn.addEventListener('click', function () { copy(id, id); });
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
