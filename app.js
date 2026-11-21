/* 일본어 여행회화 — app logic (vanilla, no build step) */
(function () {
  'use strict';

  var D = window.APP_DATA;
  if (!D || !D.phrases || !D.phrases.length) {
    document.querySelector('main').innerHTML = '<p class="empty">문장 데이터를 불러오지 못했어요.<br>data.js 파일을 확인해 주세요.</p>';
    return;
  }

  var CATS = D.categories;
  var PH = D.phrases;
  var CAT = {};
  CATS.forEach(function (c) { CAT[c.id] = c; });
  var BY_ID = {};
  PH.forEach(function (p) { BY_ID[p.id] = p; });
  var TOTAL = PH.length;
  var REPLY_COUNT = PH.filter(function (p) { return p.reply_ja; }).length;

  /* ---------------- helpers ---------------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  var ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (m) { return ESC[m]; }); }
  function tint(hex, a) {
    var n = parseInt(String(hex).replace('#', ''), 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }
  function shuffle(arr) {
    var a = arr.slice(), i, j, t;
    for (i = a.length - 1; i > 0; i--) { j = Math.floor(Math.random() * (i + 1)); t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  var ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.7c0-.9 1-1.4 1.7-.9l8.6 6.3c.6.4.6 1.4 0 1.8l-8.6 6.3c-.7.5-1.7 0-1.7-.9V5.7z"/></svg>';

  /* ---------------- state ---------------- */
  var K = { mem: 'jph.mem.v1', star: 'jph.star.v1', speed: 'jph.speed.v1' };
  function lsGet(k, fb) { try { var v = localStorage.getItem(k); return v === null ? fb : JSON.parse(v); } catch (e) { return fb; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }

  function idSet(v) {
    var s = {};
    if (Array.isArray(v)) v.forEach(function (id) { if (typeof id === 'string' && BY_ID[id]) s[id] = 1; });
    return s;
  }
  var mem = idSet(lsGet(K.mem, []));
  var stars = idSet(lsGet(K.star, []));
  var speed = lsGet(K.speed, 1) === 0.8 ? 0.8 : 1;
  var cat = 'all';
  var query = '';
  var mode = 'list';

  var listView = $('#listView'), flashView = $('#flashView'), quizView = $('#quizView');
  var catsEl = $('#cats'), searchWrap = $('#searchWrap'), qInput = $('#q');
  var progFill = $('#progFill'), progText = $('#progText'), speedBtn = $('#speedBtn');
  var footStat = $('#footStat');

  function saveMem() { lsSet(K.mem, Object.keys(mem)); }
  function saveStars() { lsSet(K.star, Object.keys(stars)); }
  function memCount() { return Object.keys(mem).length; }

  /* ---------------- audio ---------------- */
  var audio = new Audio();
  audio.preload = 'none';
  var playingEl = null, curText = '', lastRate = 1;

  function stopPulse() {
    if (playingEl) { playingEl.classList.remove('is-playing'); playingEl = null; }
  }
  audio.addEventListener('ended', stopPulse);
  audio.addEventListener('playing', function () { try { audio.playbackRate = lastRate; } catch (e) {} });
  audio.addEventListener('error', function () { stopPulse(); speak(); });

  function speak() {
    if (!curText || !('speechSynthesis' in window)) return;
    try {
      window.speechSynthesis.cancel();
      var u = new SpeechSynthesisUtterance(curText);
      u.lang = 'ja-JP';
      u.rate = lastRate;
      window.speechSynthesis.speak(u);
    } catch (e) {}
  }

  function playAudio(id, text, rate, btn) {
    curText = text || '';
    lastRate = rate || speed;
    if (btn) { stopPulse(); playingEl = btn; btn.classList.add('is-playing'); }
    try { audio.pause(); } catch (e) {}
    audio.src = 'audio/' + id + '.mp3';
    try { audio.playbackRate = lastRate; } catch (e) {}
    var pr = audio.play();
    if (pr && typeof pr.catch === 'function') {
      pr.catch(function () { stopPulse(); speak(); });
    }
  }
  function playPhrase(p, rate, btn) {
    if (!p) return;
    playAudio(p.id, p.ja, rate, btn);
  }
  function playReply(p, rate, btn) {
    if (!p || !p.reply_ja) return;
    playAudio(p.id + '-reply', p.reply_ja, rate, btn);
  }

  /* ---------------- filter ---------------- */
  function filtered() {
    var qq = query.trim().toLowerCase();
    return PH.filter(function (p) {
      if (cat === 'star') { if (!stars[p.id]) return false; }
      else if (cat !== 'all' && p.cat !== cat) return false;
      if (!qq) return true;
      var hay = [p.ko, p.ja, p.kana, p.pron, p.tip || '', p.reply_ko || '', p.reply_ja || '', p.reply_pron || ''].join(' ').toLowerCase();
      return hay.indexOf(qq) >= 0;
    });
  }

  /* ---------------- chrome ---------------- */
  function updateProgress() {
    var n = memCount();
    progFill.style.width = (TOTAL ? (n / TOTAL) * 100 : 0) + '%';
    progText.textContent = n + ' / ' + TOTAL + ' 외움';
  }

  function updateFoot() {
    footStat.textContent = '문장 ' + TOTAL + '개 · 음성 ' + (TOTAL + REPLY_COUNT) + '개 · 남성 음성(Keita)';
  }

  function paintSpeed() {
    speedBtn.textContent = speed === 1 ? '1.0x' : '0.8x';
    speedBtn.classList.toggle('slow', speed !== 1);
    speedBtn.setAttribute('aria-label', speed === 1 ? '기본 속도 1.0배 (누르면 0.8배)' : '천천히 0.8배 (누르면 기본 속도)');
  }

  function chipHTML(id, icon, name, color, n) {
    return '<button type="button" class="chip' + (cat === id ? ' on' : '') + '" data-cat="' + id + '"' +
      ' style="--c-18:' + tint(color, .18) + ';--c-30:' + tint(color, .3) + ';--c-45:' + tint(color, .45) + ';--c-60:' + tint(color, .6) + '">' +
      '<span aria-hidden="true">' + icon + '</span>' + esc(name) +
      '<span class="n">' + n + '</span></button>';
  }

  function renderCats() {
    var parts = [chipHTML('all', '📚', '전체', '#2EE6A8', TOTAL)];
    parts.push(chipHTML('star', '★', '즐겨찾기', '#FFB020', Object.keys(stars).length));
    CATS.forEach(function (c) {
      var n = PH.filter(function (p) { return p.cat === c.id; }).length;
      parts.push(chipHTML(c.id, c.icon, c.name, c.color, n));
    });
    catsEl.innerHTML = parts.join('');
  }

  function emptyHTML(msg) {
    return '<p class="empty">' + (msg || '이 조건에 맞는 문장이 없어요.<br>다른 카테고리나 검색어로 찾아보세요.') + '</p>';
  }

  /* ---------------- card ---------------- */
  function cardHTML(p) {
    var c = CAT[p.cat] || { icon: '・', name: p.cat, color: '#2EE6A8' };
    var isMem = !!mem[p.id], isStar = !!stars[p.id];
    var isListen = p.cat === 'listen';
    var lvlClass = isListen ? 'lvl-listen' : (p.level === 'casual' ? 'lvl-casual' : 'b-lvl');
    var lvlText = isListen ? '👂 듣기' : (p.level === 'casual' ? '반말·캐주얼' : '존댓말');
    var catBadgeLabel = isListen ? '상대가 하는 말' : (c.icon + ' ' + esc(c.name));

    return '<article class="card' + (isMem ? ' is-mem' : '') + '" data-id="' + p.id + '"' +
      ' style="--c:' + c.color + ';--c-10:' + tint(c.color, .1) + ';--c-30:' + tint(c.color, .3) +
      ';--c-45:' + tint(c.color, .45) + ';--c-60:' + tint(c.color, .6) + '">' +
      '<div class="card-head">' +
        '<span class="badge ' + lvlClass + '">' + lvlText + '</span>' +
        '<span class="badge b-cat">' + catBadgeLabel + '</span>' +
        '<span class="grow"></span>' +
        '<button type="button" class="icon-btn star' + (isStar ? ' on' : '') + '" data-act="star" aria-pressed="' + isStar + '" aria-label="즐겨찾기">' + (isStar ? '★' : '☆') + '</button>' +
        '<button type="button" class="mem-btn' + (isMem ? ' on' : '') + '" data-act="mem" aria-pressed="' + isMem + '">' + (isMem ? '외움 ✓' : '외웠어요') + '</button>' +
      '</div>' +
      '<p class="ko" lang="ko">' + esc(p.ko) + '</p>' +
      '<div class="ja-row">' +
        '<p class="ja" lang="ja">' + esc(p.ja) + '</p>' +
        '<button type="button" class="play" data-act="play" aria-label="재생">' + ICON_PLAY + '</button>' +
      '</div>' +
      '<p class="kana" lang="ja">' + esc(p.kana) + '</p>' +
      '<div class="pron-row">' +
        '<span class="pron" lang="ko">' + esc(p.pron) + '</span>' +
        '<button type="button" class="slow-btn" data-act="slow" aria-label="천천히 재생">🐢 천천히</button>' +
      '</div>' +
      (p.reply_ja ? '<div class="reply">' +
        '<div class="reply-top"><span class="reply-label">↩ 이렇게 답해요</span><span class="r-pron" lang="ko">' + esc(p.reply_pron || '') + '</span></div>' +
        '<p class="r-ko" lang="ko">' + esc(p.reply_ko || '') + '</p>' +
        '<div class="r-ja-row"><p class="r-ja" lang="ja">' + esc(p.reply_ja) + '</p>' +
        '<button type="button" class="play small" data-act="play-reply" aria-label="답변 재생">' + ICON_PLAY + '</button></div>' +
        '<p class="r-kana" lang="ja">' + esc(p.reply_kana || '') + '</p>' +
      '</div>' : '') +
      (p.tip ? '<p class="tip" lang="ko">💡 ' + esc(p.tip) + '</p>' : '') +
      '</article>';
  }

  /* ---------------- list ---------------- */
  function groups() {
    var items = filtered();
    var out = [];
    if (cat === 'all' || cat === 'star') {
      CATS.forEach(function (c) {
        var arr = items.filter(function (p) { return p.cat === c.id; });
        if (arr.length) out.push({ cat: c, items: arr });
      });
    } else if (CAT[cat]) {
      out.push({ cat: CAT[cat], items: items });
    }
    return out;
  }

  function renderList() {
    if (!filtered().length) {
      listView.innerHTML = emptyHTML(cat === 'star' && !query ? '즐겨찾기한 문장이 아직 없어요.<br>카드 오른쪽 ☆ 를 눌러 담아두면 여기 모여요.' : '');
      updateGroupCounts();
      return;
    }
    var html = groups().map(function (g) {
      var all = PH.filter(function (p) { return p.cat === g.cat.id; });
      var n = all.filter(function (p) { return mem[p.id]; }).length;
      var desc = (g.cat.id === 'listen')
        ? '점원·현지인이 먼저 건네는 말이에요. 아래 “이렇게 답해요”까지 같이 익히면 대화가 이어져요.'
        : (g.cat.desc || '');
      return '<section class="group" style="--c:' + g.cat.color + '">' +
        '<div class="group-head">' +
          '<span class="g-icon" aria-hidden="true">' + g.cat.icon + '</span>' +
          '<h2>' + esc(g.cat.name) + '</h2>' +
          '<span class="g-count" data-gcount="' + g.cat.id + '">' + n + '/' + all.length + ' 외움</span>' +
        '</div>' +
        (desc && !query ? '<p class="group-desc">' + esc(desc) + '</p>' : '') +
        g.items.map(cardHTML).join('') +
      '</section>';
    }).join('');
    listView.innerHTML = html;
  }

  function updateGroupCounts() {
    $$('[data-gcount]', listView).forEach(function (el) {
      var cid = el.getAttribute('data-gcount');
      var all = PH.filter(function (p) { return p.cat === cid; });
      var n = all.filter(function (p) { return mem[p.id]; }).length;
      el.textContent = n + '/' + all.length + ' 외움';
    });
  }

  function paintCard(id) {
    var card = listView.querySelector('.card[data-id="' + id + '"]');
    if (!card) return;
    var on = !!mem[id];
    card.classList.toggle('is-mem', on);
    var btn = card.querySelector('.mem-btn');
    if (btn) {
      btn.classList.toggle('on', on);
      btn.textContent = on ? '외움 ✓' : '외웠어요';
      btn.setAttribute('aria-pressed', String(on));
    }
  }

  function toggleMem(id) {
    if (!id) return;
    if (mem[id]) delete mem[id]; else mem[id] = 1;
    saveMem();
    paintCard(id);
    updateProgress();
    updateGroupCounts();
  }

  function toggleStar(id) {
    if (!id) return;
    if (stars[id]) delete stars[id]; else stars[id] = 1;
    saveStars();
    var card = listView.querySelector('.card[data-id="' + id + '"]');
    if (card) {
      var b = card.querySelector('.star');
      if (b) {
        var on = !!stars[id];
        b.classList.toggle('on', on);
        b.textContent = on ? '★' : '☆';
        b.setAttribute('aria-pressed', String(on));
      }
    }
    renderCats();
    if (cat === 'star') renderList();
  }

  /* ---------------- flashcard ---------------- */
  var flash = { deck: [], i: 0, revealed: false, excludeMem: false, done: false, known: 0, unknown: 0 };

  function openFlash() {
    var items = filtered();
    if (flash.excludeMem) items = items.filter(function (p) { return !mem[p.id]; });
    flash.deck = shuffle(items);
    flash.i = 0; flash.revealed = false; flash.done = false; flash.known = 0; flash.unknown = 0;
    renderFlash();
  }

  function flashBackHTML(p) {
    return '<div class="fc-back">' +
      '<p class="ja" lang="ja">' + esc(p.ja) + '</p>' +
      '<p class="kana" lang="ja">' + esc(p.kana) + '</p>' +
      '<div class="pron-row"><span class="pron" lang="ko">' + esc(p.pron) + '</span></div>' +
      (p.reply_ja ? '<div class="reply"><div class="reply-top"><span class="reply-label">↩ 이렇게 답해요</span>' +
        '<span class="r-pron" lang="ko">' + esc(p.reply_pron || '') + '</span></div>' +
        '<p class="r-ja" lang="ja">' + esc(p.reply_ja) + '</p><p class="r-kana" lang="ja">' + esc(p.reply_kana || '') + '</p></div>' : '') +
      '</div>';
  }

  function renderFlash() {
    if (!flash.deck.length) {
      flashView.innerHTML = emptyHTML(flash.excludeMem
        ? '이 카테고리는 다 외웠어요! 🎉<br>“외운 카드 빼기”를 끄면 다시 볼 수 있어요.'
        : '');
      return;
    }
    if (flash.done) {
      flashView.innerHTML = '<div class="fc-toolbar"><span class="fc-count">한 바퀴 완료</span><span class="grow"></span>' +
        '<button type="button" class="fc-shuffle" data-act="fc-restart">↻ 다시</button></div>' +
        '<div class="fc-card revealed" style="min-height:220px">' +
        '<p class="fc-ask">이번 판 결과</p>' +
        '<p class="fc-ko">외웠어요 ' + flash.known + '개<br>복습할 것 ' + flash.unknown + '개</p>' +
        '<p class="fc-hint">외운 카드는 목록에서 초록 테두리로 표시돼요.</p></div>' +
        '<div class="fc-actions" style="grid-template-columns:1fr 1fr">' +
        '<button type="button" data-act="fc-restart">다시 하기</button>' +
        '<button type="button" class="fc-play" data-act="fc-to-list">목록으로</button></div>';
      return;
    }
    var p = flash.deck[flash.i];
    var c = CAT[p.cat] || { icon: '・', name: p.cat, color: '#2EE6A8' };
    flashView.innerHTML =
      '<div class="fc-toolbar">' +
        '<span class="fc-count">' + (flash.i + 1) + ' / ' + flash.deck.length + '</span>' +
        '<span class="grow"></span>' +
        '<label><input type="checkbox" id="exMem"' + (flash.excludeMem ? ' checked' : '') + '> 외운 카드 빼기</label>' +
        '<button type="button" class="fc-shuffle" data-act="fc-shuffle" aria-label="카드 섞기">↻ 섞기</button>' +
      '</div>' +
      '<div class="fc-card' + (flash.revealed ? ' revealed' : '') + '" data-act="fc-flip" tabindex="0" role="button" aria-label="카드 뒤집기">' +
        '<span class="badge b-cat" style="--c:' + c.color + ';--c-10:' + tint(c.color, .12) + ';--c-30:' + tint(c.color, .35) + '">' + c.icon + ' ' + esc(c.name) + '</span>' +
        '<p class="fc-ask">이 뜻, 일본어로?</p>' +
        '<p class="fc-ko" lang="ko">' + esc(p.ko) + '</p>' +
        (flash.revealed ? flashBackHTML(p) : '') +
        '<p class="fc-hint">' + (flash.revealed ? '탭해서 접기' : '탭하면 일본어와 발음이 나와요') + '</p>' +
      '</div>' +
      '<div class="fc-actions">' +
        '<button type="button" class="fc-no" data-act="fc-unknown">몰랐어요</button>' +
        '<button type="button" class="fc-play" data-act="fc-play">▶ 듣기</button>' +
        '<button type="button" class="fc-ok" data-act="fc-known">외웠어요</button>' +
      '</div>';
  }

  function flashNext() {
    flash.i++;
    flash.revealed = false;
    if (flash.i >= flash.deck.length) { flash.done = true; }
    renderFlash();
  }

  /* ---------------- quiz ---------------- */
  var quiz = { deck: [], i: 0, correct: 0, cur: null, opts: [], answered: false, picked: -1, lastOk: false, done: false };
  var qToken = 0;

  function openQuiz() {
    quiz.deck = shuffle(filtered());
    quiz.i = 0; quiz.correct = 0; quiz.answered = false; quiz.picked = -1; quiz.done = false;
    if (!quiz.deck.length) { quizView.innerHTML = emptyHTML(); return; }
    nextQ();
  }

  function nextQ() {
    qToken++;
    var token = qToken;
    if (quiz.i >= quiz.deck.length) { quiz.done = true; renderQuizEnd(); return; }
    quiz.cur = quiz.deck[quiz.i];
    quiz.answered = false;
    quiz.picked = -1;
    var others = PH.filter(function (p) { return p.id !== quiz.cur.id && p.ko !== quiz.cur.ko; });
    var pool = others.filter(function (p) { return p.cat === quiz.cur.cat; });
    if (pool.length < 3) pool = others;
    quiz.opts = shuffle([quiz.cur].concat(shuffle(pool).slice(0, 3)));
    renderQuiz();
    window.setTimeout(function () {
      if (qToken === token && !quiz.answered) playPhrase(quiz.cur, speed, null);
    }, 220);
  }

  function renderQuiz() {
    var p = quiz.cur;
    var html = '<div class="q-top"><span>문제 ' + (quiz.i + 1) + ' / ' + quiz.deck.length + '</span>' +
      '<span class="q-score">정답 ' + quiz.correct + '</span></div>' +
      '<div class="q-listen">' +
        '<button type="button" class="play big-play" data-act="q-replay" aria-label="다시 듣기">' + ICON_PLAY + '</button>' +
        '<p>' + (quiz.answered ? '다시 들으려면 버튼을 눌러요' : '듣고 뜻을 골라보세요') + '</p>' +
      '</div>' +
      '<div class="q-opts">';
    quiz.opts.forEach(function (o, idx) {
      var cls = 'q-opt';
      if (quiz.answered) {
        if (o.id === p.id) cls += ' correct';
        else if (idx === quiz.picked) cls += ' wrong';
        else cls += ' dim';
      }
      html += '<button type="button" class="' + cls + '" data-act="q-opt" data-idx="' + idx + '"' + (quiz.answered ? ' disabled' : '') + ' lang="ko">' +
        esc(o.ko) + '</button>';
    });
    html += '</div>';

    if (quiz.answered) {
      html += '<div class="q-result ' + (quiz.lastOk ? 'ok' : 'no') + '">' +
        '<div class="qr-head">' + (quiz.lastOk ? '✓ 정답!' : '✗ 아쉬워요') + '</div>' +
        '<p class="ja" lang="ja">' + esc(p.ja) + '</p>' +
        '<p class="kana" lang="ja">' + esc(p.kana) + '</p>' +
        '<div class="pron-row"><span class="pron" lang="ko">' + esc(p.pron) + '</span>' +
        '<button type="button" class="slow-btn" data-act="q-slow">🐢 천천히</button></div>' +
        (p.reply_ja ? '<p class="tip" lang="ko">↩ 답: ' + esc(p.reply_ja) + ' (' + esc(p.reply_pron || '') + ')</p>' : '') +
        (p.tip ? '<p class="tip" lang="ko">💡 ' + esc(p.tip) + '</p>' : '') +
        (quiz.lastOk ? '' : '<button type="button" class="q-next" data-act="q-next">다음 →</button>') +
        '</div>';
    }
    quizView.innerHTML = html;
  }

  function renderQuizEnd() {
    var n = quiz.deck.length;
    var html = '<div class="fc-card revealed" style="min-height:220px">' +
      '<p class="fc-ask">' + n + '문제 끝</p>' +
      '<p class="fc-ko">정답 ' + quiz.correct + ' / ' + n + '</p>' +
      '<p class="fc-hint">' + (quiz.correct === n ? '완벽해요. 이대로 가면 술자리에서 통합니다 🍻' : '틀린 문장은 목록에서 다시 들어보세요.') + '</p>' +
      '</div>' +
      '<div class="fc-actions" style="grid-template-columns:1fr 1fr">' +
      '<button type="button" data-act="q-restart">한 번 더</button>' +
      '<button type="button" class="fc-play" data-act="fc-to-list">목록으로</button></div>';
    quizView.innerHTML = html;
  }

  function answerQuiz(idx) {
    if (quiz.answered || !quiz.cur) return;
    var picked = quiz.opts[idx];
    if (!picked) return;
    quiz.answered = true;
    quiz.picked = idx;
    quiz.lastOk = picked.id === quiz.cur.id;
    if (quiz.lastOk) quiz.correct++;
    renderQuiz();
    if (quiz.lastOk) {
      var token = qToken;
      window.setTimeout(function () {
        if (qToken === token && quiz.answered) { quiz.i++; nextQ(); }
      }, 1500);
    }
  }

  /* ---------------- mode ---------------- */
  function setMode(m) {
    mode = m;
    $$('#modes button').forEach(function (b) {
      var on = b.getAttribute('data-mode') === m;
      b.classList.toggle('on', on);
      b.setAttribute('aria-selected', String(on));
    });
    listView.hidden = m !== 'list';
    flashView.hidden = m !== 'flash';
    quizView.hidden = m !== 'quiz';
    searchWrap.hidden = m !== 'list';
    if (m === 'list') renderList();
    else if (m === 'flash') openFlash();
    else openQuiz();
    window.scrollTo({ top: 0, behavior: 'auto' });
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var modeBtn = t.closest('#modes button');
    if (modeBtn) { setMode(modeBtn.getAttribute('data-mode')); return; }

    var chipEl = t.closest('[data-cat]');
    if (chipEl) {
      cat = chipEl.getAttribute('data-cat');
      renderCats();
      if (mode === 'list') renderList();
      else if (mode === 'flash') openFlash();
      else openQuiz();
      return;
    }

    var actEl = t.closest('[data-act]');
    if (!actEl) return;
    var act = actEl.getAttribute('data-act');
    var card = t.closest('.card');
    var id = card ? card.getAttribute('data-id') : null;
    var p = id ? BY_ID[id] : null;

    switch (act) {
      case 'play':
        if (p) playPhrase(p, speed, actEl);
        break;
      case 'slow':
        if (p) playPhrase(p, 0.8, null);
        break;
      case 'play-reply':
        if (p) playReply(p, speed, actEl);
        break;
      case 'mem':
        toggleMem(id);
        break;
      case 'star':
        toggleStar(id);
        break;

      case 'fc-flip': {
        var fp = flash.deck[flash.i];
        flash.revealed = !flash.revealed;
        if (flash.revealed && fp) playPhrase(fp, speed, null);
        renderFlash();
        break;
      }
      case 'fc-play': {
        var cp = flash.deck[flash.i];
        if (cp) playPhrase(cp, speed, actEl);
        break;
      }
      case 'fc-known': {
        var kp = flash.deck[flash.i];
        if (kp) { mem[kp.id] = 1; saveMem(); flash.known++; updateProgress(); }
        flashNext();
        break;
      }
      case 'fc-unknown': {
        var up = flash.deck[flash.i];
        if (up && mem[up.id]) { delete mem[up.id]; saveMem(); updateProgress(); }
        flash.unknown++;
        flashNext();
        break;
      }
      case 'fc-shuffle':
        openFlash();
        break;
      case 'fc-restart':
        openFlash();
        break;
      case 'fc-to-list':
        setMode('list');
        break;

      case 'q-replay':
        if (quiz.cur) playPhrase(quiz.cur, speed, null);
        break;
      case 'q-slow':
        if (quiz.cur) playPhrase(quiz.cur, 0.8, null);
        break;
      case 'q-opt':
        answerQuiz(parseInt(actEl.getAttribute('data-idx'), 10));
        break;
      case 'q-next':
        quiz.i++;
        nextQ();
        break;
      case 'q-restart':
        openQuiz();
        break;
    }
  });

  // 플래시카드의 '외운 카드 빼기'
  document.addEventListener('change', function (e) {
    if (e.target && e.target.id === 'exMem') {
      flash.excludeMem = !!e.target.checked;
      openFlash();
    }
  });

  // 카드 키보드 조작
  document.addEventListener('keydown', function (e) {
    if ((e.key === 'Enter' || e.key === ' ') && document.activeElement && document.activeElement.classList &&
        document.activeElement.classList.contains('fc-card')) {
      e.preventDefault();
      document.activeElement.click();
    }
  });

  speedBtn.addEventListener('click', function () {
    speed = speed === 1 ? 0.8 : 1;
    lsSet(K.speed, speed);
    paintSpeed();
    lastRate = speed;
    try { audio.playbackRate = speed; } catch (e) {}
  });

  var timer = null;
  qInput.addEventListener('input', function () {
    window.clearTimeout(timer);
    var v = qInput.value;
    timer = window.setTimeout(function () {
      query = v;
      renderList();
    }, 120);
  });

  $('#resetBtn').addEventListener('click', function () {
    if (!window.confirm('외운 표시와 즐겨찾기를 모두 지울까요?')) return;
    mem = {}; stars = {};
    saveMem(); saveStars();
    renderCats(); renderList();
    flash.excludeMem = false;
    updateProgress();
  });

  /* ---------------- boot ---------------- */
  if (D.title) document.title = D.title;
  if (D.subtitle) $('#appSub').textContent = D.subtitle;
  if (D.title) $('#appTitle').textContent = D.title;
  paintSpeed();
  renderCats();
  renderList();
  updateProgress();
  updateFoot();
})();
