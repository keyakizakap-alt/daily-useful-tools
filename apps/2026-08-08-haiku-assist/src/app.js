(function () {
  var LINES = [
    { id: 'kami', target: 5, label: '上五' },
    { id: 'naka', target: 7, label: '中七' },
    { id: 'shimo', target: 5, label: '下五' },
  ];

  var els = {};
  LINES.forEach(function (line) {
    els[line.id] = {
      input: document.getElementById('input-' + line.id),
      count: document.getElementById('count-' + line.id),
    };
  });
  els.totalCount = document.getElementById('total-count');
  els.overallJudge = document.getElementById('overall-judge');
  els.seasonSelect = document.getElementById('season-select');
  els.kigoList = document.getElementById('kigo-list');
  els.refreshKigo = document.getElementById('refresh-kigo');
  els.kigoDetection = document.getElementById('kigo-detection');
  els.copyButton = document.getElementById('copy-button');
  els.copyStatus = document.getElementById('copy-status');

  function pickRandom(arr, n) {
    var copy = arr.slice();
    var result = [];
    while (copy.length > 0 && result.length < n) {
      var idx = Math.floor(Math.random() * copy.length);
      result.push(copy.splice(idx, 1)[0]);
    }
    return result;
  }

  function renderCounts() {
    var total = 0;
    var allOk = true;
    LINES.forEach(function (line) {
      var text = els[line.id].input.value;
      var count = window.MoraUtil.countMora(text);
      var judge = window.MoraUtil.judgeMora(count, line.target);
      total += count;
      if (judge !== 'ok') allOk = false;

      var countEl = els[line.id].count;
      countEl.textContent = count + ' / ' + line.target + '音';
      countEl.classList.toggle('count-ok', judge === 'ok');
      countEl.classList.toggle('count-ng', judge !== 'ok');
    });

    els.totalCount.textContent = total + ' / 17音';
    els.overallJudge.textContent = allOk ? '5・7・5、達成！' : 'まだ調整中…';
    els.overallJudge.classList.toggle('count-ok', allOk);
    els.overallJudge.classList.toggle('count-ng', !allOk);

    renderKigoDetection();
  }

  function renderKigoList() {
    var season = els.seasonSelect.value;
    var entries = window.KigoData.KIGO_DICTIONARY[season] || [];
    var picked = pickRandom(entries, 5);
    els.kigoList.innerHTML = '';
    picked.forEach(function (entry) {
      var li = document.createElement('li');
      li.className = 'kigo-item';
      li.innerHTML =
        '<span class="kigo-word">' + entry.word + '</span>' +
        '<span class="kigo-reading">（' + entry.reading + '）</span>' +
        '<span class="kigo-desc">' + entry.description + '</span>';
      els.kigoList.appendChild(li);
    });
  }

  function renderKigoDetection() {
    var fullText = LINES.map(function (line) {
      return els[line.id].input.value;
    }).join('');

    if (!fullText.trim()) {
      els.kigoDetection.textContent = '';
      els.kigoDetection.classList.remove('count-ok', 'count-ng');
      return;
    }

    var found = window.KigoData.findKigoInText(fullText);
    if (found.length > 0) {
      var names = found
        .map(function (f) {
          return f.entry.word + '（' + f.seasonLabel + '）';
        })
        .filter(function (v, i, arr) {
          return arr.indexOf(v) === i;
        });
      els.kigoDetection.textContent = '季語が見つかりました: ' + names.join('、');
      els.kigoDetection.classList.add('count-ok');
      els.kigoDetection.classList.remove('count-ng');
    } else {
      els.kigoDetection.textContent = '季語が見つかりません';
      els.kigoDetection.classList.add('count-ng');
      els.kigoDetection.classList.remove('count-ok');
    }
  }

  function copyHaiku() {
    var text = LINES.map(function (line) {
      return els[line.id].input.value;
    })
      .filter(Boolean)
      .join(' ');

    if (!text) {
      els.copyStatus.textContent = 'コピーする内容がありません';
      return;
    }

    function showCopied() {
      els.copyStatus.textContent = 'コピーしました: ' + text;
      setTimeout(function () {
        els.copyStatus.textContent = '';
      }, 3000);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(showCopied, function () {
        fallbackCopy(text, showCopied);
      });
    } else {
      fallbackCopy(text, showCopied);
    }
  }

  function fallbackCopy(text, onDone) {
    var textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand('copy');
    } catch (e) {
      /* コピーに失敗しても致命的ではないため無視する */
    }
    document.body.removeChild(textarea);
    onDone();
  }

  LINES.forEach(function (line) {
    els[line.id].input.addEventListener('input', renderCounts);
  });
  els.seasonSelect.addEventListener('change', renderKigoList);
  els.refreshKigo.addEventListener('click', renderKigoList);
  els.copyButton.addEventListener('click', copyHaiku);

  renderCounts();
  renderKigoList();
})();
