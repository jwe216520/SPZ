(() => {
  'use strict';
  const content = window.LETTER_CONTENT;
  const $ = id => document.getElementById(id);
  const scene = $('scene');
  let chapterIndex = -1;
  let noCount = 0;
  let showingEnding = false;
  const personalise = text => text.replaceAll('{name}', content.recipient);
  document.title = `給${content.recipient}的一封信`;

  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = personalise(text);
    return node;
  }
  function prose(lines) {
    const container = element('div', 'prose');
    lines.forEach(line => container.append(element('p', '', line)));
    return container;
  }
  function heading(text) {
    const node = element('h1', '', text);
    node.tabIndex = -1;
    return node;
  }
  function focusScene(title) {
    title.focus({ preventScroll: true });
    document.querySelector('.letter').scrollIntoView({ block: 'start', behavior: 'instant' });
  }
  function updateProgress() {
    $('progress').replaceChildren();
    content.chapters.forEach((_, i) => $('progress').append(element('span', i === chapterIndex ? 'active' : '')));
    $('progress').setAttribute('aria-label', `第 ${chapterIndex + 1} 頁，共 ${content.chapters.length} 頁`);
  }
  function showOpening(restoreFocus = false) {
    chapterIndex = -1;
    showingEnding = false;
    $('navigation').hidden = true;
    $('eyebrow').textContent = 'FOR YOU, WITH LOVE';
    $('page-number').textContent = '序';
    const wrap = element('div', 'intro scene-enter');
    wrap.append(element('div', 'envelope'));
    wrap.firstChild.setAttribute('aria-hidden', 'true');
    wrap.append(element('p', 'handwritten', '把心意，好好交給妳。'), heading(content.opening.title), prose(content.opening.lines));
    const open = element('button', 'primary', '打開這封信 →');
    open.type = 'button';
    open.addEventListener('click', () => { requestMusic(); showChapter(0); });
    wrap.append(open);
    scene.replaceChildren(wrap);
    if (restoreFocus) focusScene(wrap.querySelector('h1'));
  }
  function showChapter(index) {
    if (index < 0 || index >= content.chapters.length) return;
    showingEnding = false;
    chapterIndex = index;
    const chapter = content.chapters[index];
    const wrap = element('div', 'scene-enter');
    const title = heading(chapter.title);
    wrap.append(element('p', 'scene-date', chapter.date), title, prose(chapter.lines));
    if (chapter.question) {
      wrap.append(element('h2', 'question', chapter.question));
      const buttons = element('div', 'answer-buttons');
      const yes = element('button', 'primary', '我同意 ♡');
      yes.type = 'button';
      yes.addEventListener('click', showEnding);
      const no = element('button', 'no-button', '不同意');
      no.type = 'button';
      no.dataset.step = String(noCount);
      const response = element('p', 'response', noCount ? content.noResponses[noCount - 1] : '');
      response.setAttribute('role', 'status');
      no.addEventListener('click', () => {
        noCount = Math.min(noCount + 1, content.noResponses.length);
        no.dataset.step = String(noCount);
        response.textContent = content.noResponses[noCount - 1];
      });
      buttons.append(yes, no);
      wrap.append(buttons, response, element('p', 'invitation-note', content.invitationNote));
    }
    scene.replaceChildren(wrap);
    $('eyebrow').textContent = 'A LITTLE CLOSER, PAGE BY PAGE';
    $('page-number').textContent = `${String(index + 1).padStart(2, '0')} / ${String(content.chapters.length).padStart(2, '0')}`;
    $('navigation').hidden = false;
    $('swipe-hint').textContent = chapter.question ? '右滑回顧上一頁 · 把答案留給妳' : '左滑下一頁 · 右滑上一頁';
    $('progress').hidden = false;
    updateProgress();
    focusScene(title);
  }
  function showEnding() {
    showingEnding = true;
    $('navigation').hidden = false;
    $('swipe-hint').textContent = '右滑回到上一頁 · 上下滑動看照片';
    $('progress').hidden = true;
    $('eyebrow').textContent = 'TO BE CONTINUED, TOGETHER';
    $('page-number').textContent = '♡';
    const wrap = element('div', 'ending scene-enter');
    const heart = element('div', 'ending-heart', '♡');
    heart.setAttribute('aria-hidden', 'true');
    const title = heading(content.ending.title);
    wrap.append(heart, title, prose(content.ending.lines));
    const memories = element('div', 'memories');
    memories.append(element('p', 'memories-label', 'LITTLE MOMENTS, OUR MEMORIES'));
    content.photos.forEach((photo, index) => {
      const card = element('figure', 'photo-card');
      card.style.animationDelay = `${0.35 + index * 0.15}s`;
      const img = document.createElement('img');
      img.src = photo.src;
      img.alt = photo.alt;
      img.decoding = 'async';
      img.loading = index === 0 ? 'eager' : 'lazy';
      img.addEventListener('error', () => {
        img.hidden = true;
        card.prepend(element('p', 'photo-error', '這張回憶暫時沒有載入，請重新整理後再看看。'));
      }, { once: true });
      card.append(img, element('figcaption', '', photo.caption));
      memories.append(card);
    });
    wrap.append(memories, element('p', 'ending-sign', '慢慢來，未來還有好多回憶。 ♡'));
    scene.replaceChildren(wrap);
    focusScene(title);
  }
  function turnPage(direction) {
    if (showingEnding) {
      if (direction < 0) showChapter(content.chapters.length - 1);
      return;
    }
    // 首頁必須點擊開信；告白頁不能用滑動略過「我同意」。
    if (chapterIndex < 0) return;
    if (direction < 0 && chapterIndex === 0) showOpening(true);
    else showChapter(chapterIndex + direction);
  }
  const letter = document.querySelector('.letter');
  const interactive = target => target.closest('button, a, input, select, textarea, iframe, [contenteditable]');
  let gesture = null;
  letter.addEventListener('pointerdown', event => {
    if (!event.isPrimary) { gesture = null; return; }
    if (event.button !== 0 || interactive(event.target)) return;
    gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, horizontal: false };
  });
  letter.addEventListener('pointermove', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const dx = event.clientX - gesture.x;
    const dy = event.clientY - gesture.y;
    if (!gesture.horizontal && Math.max(Math.abs(dx), Math.abs(dy)) >= 12) {
      if (Math.abs(dx) <= Math.abs(dy) * 1.5) { gesture = null; return; }
      gesture.horizontal = true;
      letter.setPointerCapture(event.pointerId);
    }
    if (gesture?.horizontal) event.preventDefault();
  });
  letter.addEventListener('pointerup', event => {
    if (!gesture || event.pointerId !== gesture.id) return;
    const swipe = gesture;
    gesture = null;
    if (letter.hasPointerCapture(event.pointerId)) letter.releasePointerCapture(event.pointerId);
    const dx = event.clientX - swipe.x;
    const dy = event.clientY - swipe.y;
    if (swipe.horizontal && Math.abs(dx) >= 55 && Math.abs(dx) > Math.abs(dy) * 1.5) turnPage(dx < 0 ? 1 : -1);
  });
  letter.addEventListener('pointercancel', () => { gesture = null; });
  letter.addEventListener('lostpointercapture', event => {
    // 觸控的隱含捕捉從文字節點轉到信紙時，也會冒泡此事件；只處理信紙本身失去捕捉。
    if (event.target === letter) gesture = null;
  });
  // 桌面亦可拖曳，鍵盤使用左右方向鍵；輸入與按鈕操作不受影響。
  letter.addEventListener('dragstart', event => { if (!interactive(event.target)) event.preventDefault(); });
  letter.addEventListener('keydown', event => {
    if (interactive(event.target) || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      turnPage(event.key === 'ArrowRight' ? 1 : -1);
    }
  });

  // 原生音檔獨立於故事；靜音只改 muted，音量交由裝置控制。
  const audio = $('background-music');
  const soundButton = $('sound-toggle');
  let userMuted = false;
  let playPending = false;
  let failed = false;
  let attempt = 0;
  let noticeTimer;
  let loadingTimer;
  audio.defaultMuted = false;
  audio.muted = false;
  audio.src = content.music.src;

  function syncSoundButton() {
    const sounding = (!audio.paused || playPending) && !audio.ended && !audio.muted && !failed;
    const label = failed ? '重試播放音樂' : audio.ended ? '重新播放音樂' : sounding ? '靜音' : '開啟聲音';
    soundButton.setAttribute('aria-label', label);
    soundButton.setAttribute('aria-pressed', String(sounding));
    soundButton.title = label;
    $('sound-waves').toggleAttribute('hidden', !sounding);
    $('sound-off').toggleAttribute('hidden', sounding);
  }
  function notifySound(text) {
    clearTimeout(noticeTimer);
    $('sound-status').textContent = text;
    $('sound-notice').textContent = text;
    $('sound-notice').hidden = false;
    noticeTimer = setTimeout(() => { $('sound-notice').hidden = true; }, 6000);
  }
  async function requestMusic(restart = false) {
    // 開信只重試播放，不解除使用者的靜音，也不重播已結束的歌曲。
    if (playPending || (audio.ended && !restart)) return;
    if (!audio.paused && !failed) return;
    const token = ++attempt;
    if (failed || audio.error) { failed = false; audio.load(); }
    if (restart && audio.ended) audio.currentTime = 0;
    audio.muted = userMuted;
    playPending = true;
    syncSoundButton();
    loadingTimer = setTimeout(() => {
      if (token === attempt && playPending) notifySound('音樂還在載入，妳可以先讀這封信。');
    }, 10000);
    try {
      await audio.play();
      if (token !== attempt) return;
      failed = false;
      clearTimeout(noticeTimer);
      $('sound-notice').hidden = true;
      $('sound-status').textContent = audio.muted ? '音樂已靜音。' : '音樂播放中。';
    } catch (error) {
      if (token !== attempt) return;
      if (error.name === 'NotAllowedError') notifySound('點一下喇叭或打開這封信，就能開啟音樂。');
      else if (error.name !== 'AbortError') {
        failed = true;
        notifySound('音樂暫時無法播放，點喇叭重試即可。');
      }
    } finally {
      if (token === attempt) { playPending = false; clearTimeout(loadingTimer); syncSoundButton(); }
    }
  }
  soundButton.addEventListener('click', () => {
    if (failed || audio.ended || (audio.paused && !playPending)) {
      userMuted = false;
      audio.muted = false;
      requestMusic(true);
    } else {
      userMuted = !userMuted;
      audio.muted = userMuted;
      $('sound-status').textContent = userMuted ? '音樂已靜音。' : '聲音已開啟。';
      syncSoundButton();
    }
  });
  ['playing', 'pause', 'volumechange'].forEach(type => audio.addEventListener(type, syncSoundButton));
  audio.addEventListener('ended', () => {
    syncSoundButton();
    $('sound-status').textContent = '歌曲播放完畢，點喇叭可再聽一次。';
  });
  audio.addEventListener('error', () => {
    failed = true;
    clearTimeout(loadingTimer);
    syncSoundButton();
    notifySound('音樂載入失敗，點喇叭重試；這封信仍能繼續讀。');
  });
  showOpening();
  syncSoundButton();
  requestMusic();
})();
