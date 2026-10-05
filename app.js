(() => {
  'use strict';
  const content = window.LETTER_CONTENT;
  const $ = id => document.getElementById(id);
  const scene = $('scene');
  let chapterIndex = -1;
  let noCount = 0;
  let accepted = false;
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
  function showOpening() {
    const wrap = element('div', 'intro scene-enter');
    wrap.append(element('div', 'envelope'));
    wrap.firstChild.setAttribute('aria-hidden', 'true');
    wrap.append(element('p', 'handwritten', '把心意，好好交給妳。'), heading(content.opening.title), prose(content.opening.lines));
    const open = element('button', 'primary', '打開這封信 →');
    open.type = 'button';
    open.addEventListener('click', () => { requestMusic(); showChapter(0); });
    wrap.append(open);
    scene.replaceChildren(wrap);
  }
  function showChapter(index) {
    if (accepted || index < 0 || index >= content.chapters.length) return;
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
    $('previous').disabled = index === 0;
    $('next').hidden = index === content.chapters.length - 1;
    updateProgress();
    focusScene(title);
  }
  function showEnding() {
    if (accepted) return;
    accepted = true;
    $('navigation').hidden = true;
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
  $('previous').addEventListener('click', () => showChapter(chapterIndex - 1));
  $('next').addEventListener('click', () => showChapter(chapterIndex + 1));

  // 音樂與閱讀各自運作；API 或影片失敗時仍可翻頁。
  let player = null;
  let ready = false;
  let loading = false;
  let wantedPlayback = true;
  let playbackTimer;
  let loadingTimer;
  let generation = 0;
  let apiScript = null;
  $('youtube-link').href = `https://www.youtube.com/watch?v=${encodeURIComponent(content.music.videoId)}`;
  $('volume').value = content.music.initialVolume;
  $('volume-value').textContent = `${content.music.initialVolume}%`;
  const status = text => { $('music-status').textContent = text; };
  function requestMusic() {
    wantedPlayback = true;
    if (!ready) {
      status('音樂還在準備中，故事可以先繼續。稍後可按「播放音樂」。');
      if (!loading) loadMusic();
      return;
    }
    try {
      player.playVideo();
      clearTimeout(playbackTimer);
      playbackTimer = setTimeout(() => {
        if (player.getPlayerState() !== 1) status('若音樂尚未響起，請按「播放音樂」或播放器的播放鍵。');
      }, 5000);
    } catch { status('音樂暫時無法播放，請重新載入或在 YouTube 開啟。'); }
  }
  function createPlayer(token) {
    if (token !== generation || !window.YT?.Player) return;
    player = new window.YT.Player('youtube-player', {
      width: '100%', height: '200', videoId: content.music.videoId,
      playerVars: { playsinline: 1, controls: 1, origin: window.location.origin },
      events: {
        onReady: () => {
          if (token !== generation) return;
          clearTimeout(loadingTimer);
          loading = false;
          ready = true;
          player.setVolume(Number($('volume').value));
          if ($('mute').getAttribute('aria-pressed') === 'true') player.mute();
          status('音樂已準備好。');
          if (wantedPlayback) requestMusic();
        },
        onStateChange: event => {
          if (token !== generation) return;
          const playing = event.data === 1;
          $('play').textContent = playing ? '暫停音樂' : '播放音樂';
          if (playing) { clearTimeout(playbackTimer); status('音樂播放中，慢慢讀就好。'); }
          else if (event.data === 2) status('音樂已暫停，隨時可以繼續。');
          else if (event.data === 0) { wantedPlayback = false; status('歌曲播放完畢，可以按播放再聽一次。'); }
        },
        onAutoplayBlocked: () => { if (token === generation) status('瀏覽器需要妳點一下，請按「播放音樂」開始。'); },
        onError: () => {
          if (token !== generation) return;
          clearTimeout(loadingTimer); clearTimeout(playbackTimer);
          loading = false;
          status('這首歌目前無法嵌入播放。可以重新載入，或在 YouTube 開啟；這封信仍能繼續讀。');
        }
      }
    });
  }
  function loadMusic() {
    const token = ++generation;
    clearTimeout(playbackTimer); clearTimeout(loadingTimer);
    if (player) { try { player.destroy(); } catch { /* 重建播放器即可 */ } }
    player = null; ready = false; loading = true;
    $('play').textContent = '播放音樂';
    const target = document.createElement('div'); target.id = 'youtube-player';
    document.querySelector('.player-frame').replaceChildren(target);
    status('正在準備音樂，妳也可以先讀這封信。');
    loadingTimer = setTimeout(() => {
      if (token !== generation) return;
      loading = false;
      status('音樂載入較久，可以繼續閱讀、重新載入，或在 YouTube 開啟。');
    }, 12000);
    if (window.YT?.Player) { createPlayer(token); return; }
    window.onYouTubeIframeAPIReady = () => createPlayer(generation);
    if (apiScript) apiScript.remove();
    apiScript = document.createElement('script');
    apiScript.src = 'https://www.youtube.com/iframe_api';
    apiScript.async = true;
    apiScript.onerror = () => {
      if (token !== generation) return;
      loading = false; clearTimeout(loadingTimer);
      status('音樂連線失敗。可以重新載入或在 YouTube 開啟，故事不受影響。');
    };
    document.head.append(apiScript);
  }
  $('play').addEventListener('click', () => {
    if (ready && player.getPlayerState() === 1) { wantedPlayback = false; player.pauseVideo(); }
    else requestMusic();
  });
  $('mute').addEventListener('click', () => {
    const muted = $('mute').getAttribute('aria-pressed') !== 'true';
    $('mute').setAttribute('aria-pressed', String(muted));
    $('mute').textContent = muted ? '取消靜音' : '靜音';
    if (ready) { if (muted) player.mute(); else player.unMute(); }
  });
  $('volume').addEventListener('input', () => {
    $('volume-value').textContent = `${$('volume').value}%`;
    if (ready) player.setVolume(Number($('volume').value));
  });
  $('retry').addEventListener('click', () => { wantedPlayback = true; loadMusic(); });
  showOpening();
  loadMusic();
})();
