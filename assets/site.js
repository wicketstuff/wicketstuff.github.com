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

  // Site search. _plugins/search.rb writes /search.json at build time, a
  // record per page and per ## section; MiniSearch (assets/minisearch-*.js)
  // and the index load on first use. The same setup as the user guide search
  // on wicket.apache.org. Module records carry their release line ("lts" or
  // "current"); a search shows one line at a time, so a page never appears
  // twice, and the developer docs and the homepage appear in both.
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
    var engine = null;
    var results = [], shown = 0, inputTimer, liveTimer;

    // Splits class names at their capitals: ModalContentWindow also yields
    // modal, content, window.
    function tokenize(text) {
      var out = [];
      text.split(/[^A-Za-z0-9_]+/).forEach(function (w) {
        if (!w) return;
        out.push(w);
        var parts = w.split(/(?=[A-Z][a-z])|(?<=[a-z0-9])(?=[A-Z])/);
        if (parts.length > 1) out.push.apply(out, parts);
      });
      return out;
    }
    // Words that carry no meaning in a question like "how do I use a grid".
    var STOP = {};
    ('a an and are as at be by can do does for from get how i if in into is it its my of on or ' +
     'should so that the their then there this to use using want was what when where which why ' +
     'will with without you your').split(' ').forEach(function (w) { STOP[w] = true; });
    function processTerm(term) {
      var t = term.toLowerCase();
      return STOP[t] ? null : t;
    }

    function load() {
      if (!engine) {
        engine = new Promise(function (resolve, reject) {
          if (window.MiniSearch) return resolve();
          var script = document.createElement('script');
          script.src = root.getAttribute('data-script');
          script.onload = resolve;
          script.onerror = reject;
          document.head.appendChild(script);
        }).then(function () {
          return fetch(root.getAttribute('data-index'));
        }).then(function (response) {
          if (!response.ok) throw new Error(response.status);
          return response.json();
        }).then(function (records) {
          var search = new window.MiniSearch({
            fields: ['title', 'apis', 'keywords', 'page', 'text', 'body'],
            storeFields: ['url', 'title', 'page', 'label', 'line', 'text', 'body'],
            tokenize: tokenize,
            processTerm: processTerm,
            searchOptions: {
              processTerm: processTerm,
              boost: { title: 4, apis: 3, keywords: 2, page: 1.5, text: 1, body: 0.5 },
              // Prefix matching for the word being typed, once it has three letters.
              prefix: function (term, i, terms) { return i === terms.length - 1 && term.length > 2; },
              fuzzy: function (term) { return term.length > 4 ? 0.2 : false; },
              tokenize: function (q) { return q.split(/[^A-Za-z0-9_]+/).filter(Boolean); }
            }
          });
          search.addAll(records);
          return search;
        });
        engine.catch(function () { engine = null; });
      }
      return engine;
    }

    // Whether a section matches on more than the title of its page, which
    // every record of a page carries.
    function ownHit(r) {
      return Object.keys(r.match).some(function (t) {
        return r.match[t].some(function (field) { return field !== 'page'; });
      });
    }
    // The pages that match, best first: each with its own record (hits in
    // the intro) and up to three of its sections.
    function find(search, query, line) {
      var options = { filter: function (r) { return !line || !r.line || r.line === line; } };
      var hits = search.search(query, Object.assign({ combineWith: 'AND' }, options));
      if (!hits.length) hits = search.search(query, options);
      var pages = [], byUrl = {};
      hits.forEach(function (r) {
        var url = r.url.split('#')[0];
        var p = byUrl[url];
        if (!p) { p = byUrl[url] = { url: url, page: r.page, label: r.label, top: null, sections: [] }; pages.push(p); }
        if (r.url === url) p.top = r;
        else if (p.sections.length < 3 && ownHit(r)) p.sections.push(r);
      });
      return pages;
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
      if (!q) { hideResults(); list.textContent = ''; return; }
      load().then(function (search) {
        if (q !== input.value.trim()) return;
        var other = scope === 'lts' ? 'current' : 'lts';
        results = find(search, q, scopeBtns.length ? scope : null);
        var elsewhere = scopeBtns.length ? find(search, q, other).length : 0;
        scopeBtns.forEach(function (b) {
          var n = b.getAttribute('data-scope') === scope ? results.length : elsewhere;
          b.querySelector('.n').textContent = '(' + n + ')';
          b.setAttribute('aria-label', b.firstChild.textContent.trim() + ', ' + n + (n === 1 ? ' result' : ' results'));
        });
        shown = 0;
        list.textContent = '';
        var where = scopeBtns.length ? ' in the ' + label(scope) : '';
        if (!results.length) {
          summary.textContent = 'No results for “' + q + '”' + where + '.' +
            (elsewhere ? ' The ' + label(other) + ' have ' + elsewhere + '.' : '');
        } else {
          summary.textContent = results.length + (results.length === 1 ? ' result' : ' results') + where;
        }
        panel.hidden = false;
        announce(summary.textContent);
        showMore(false);
      }).catch(function () {
        list.textContent = '';
        summary.textContent = 'Search is not available right now: the search index could not be loaded.';
        more.hidden = true;
        panel.hidden = false;
        announce(summary.textContent);
      });
    }

    function showMore(focusFirst) {
      var first = null;
      results.slice(shown, shown + PAGE).forEach(function (p) {
        var li = render(p);
        first = first || li.querySelector('a');
        list.appendChild(li);
      });
      shown = Math.min(shown + PAGE, results.length);
      more.hidden = shown >= results.length;
      if (focusFirst && first) first.focus();
    }

    function el(tag, cls, text) {
      var e = document.createElement(tag);
      if (cls) e.className = cls;
      if (text) e.textContent = text;
      return e;
    }
    // About 180 characters of the record around its first hit, with the
    // matched words marked; the description when the hit is elsewhere.
    function excerpt(r) {
      var p = el('p', 'sr-excerpt');
      var terms = r.terms.map(function (t) { return t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); });
      var re = new RegExp('(' + terms.join('|') + ')', 'gi');
      var body = r.body || '';
      var at = body.search(re);
      var src;
      if (at === -1) {
        src = r.text || body.slice(0, 180);
      } else {
        var from = Math.max(0, at - 60);
        if (from > 0) from = body.indexOf(' ', from) + 1 || from;
        src = (from > 0 ? '…' : '') + body.slice(from, from + 180) + (from + 180 < body.length ? '…' : '');
      }
      src.split(re).forEach(function (part, i) {
        if (!part) return;
        p.appendChild(i % 2 ? el('mark', null, part) : document.createTextNode(part));
      });
      return p;
    }
    // A result: the page link (label and title) with an excerpt of its intro
    // when that matches, then the matching sections. The excerpts are outside
    // the links so a link's name is just its title.
    function render(p) {
      var li = el('li');
      var page = el('a', 'sr-page');
      page.href = p.url;
      if (p.label) page.appendChild(el('span', 'sr-where', p.label));
      page.appendChild(el('span', 'sr-title', p.page));
      li.appendChild(page);
      if (p.top) li.appendChild(excerpt(p.top));
      p.sections.forEach(function (s) {
        var div = el('div', 'sr-sub');
        var a = el('a');
        a.href = s.url;
        a.textContent = s.title;
        div.appendChild(a);
        div.appendChild(excerpt(s));
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
    more.addEventListener('click', function () { showMore(true); });
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
