/* ============================================================
   感情の郵便局 - backup.js
   JSONエクスポート/インポートのロジック(純粋関数中心)。
   ファイルダウンロード等のDOM操作はmain.js側で行う。
   ============================================================ */
(function (root, factory) {
  var mod = factory(
    typeof module !== "undefined" && module.exports
      ? require("./letters.js")
      : root.KanjoPost && root.KanjoPost.Letters
  );
  if (typeof module !== "undefined" && module.exports) {
    module.exports = mod;
  } else {
    root.KanjoPost = root.KanjoPost || {};
    root.KanjoPost.Backup = mod;
  }
})(typeof window !== "undefined" ? window : globalThis, function (Letters) {
  "use strict";

  var FORMAT_VERSION = 1;

  /**
   * エクスポート用のペイロードを組み立てる。
   */
  function buildExportPayload(letters, settings, now) {
    now = now || new Date();
    return {
      exportedAt: now.toISOString(),
      version: FORMAT_VERSION,
      settings: settings || {},
      letters: letters || [],
    };
  }

  function isPlainObject(v) {
    return typeof v === "object" && v !== null && !Array.isArray(v);
  }

  function isValidLetterShape(letter) {
    if (!isPlainObject(letter)) return false;
    if (typeof letter.id !== "string" || !letter.id) return false;
    if (typeof letter.createdAt !== "string") return false;
    if (typeof letter.deliverAt !== "string") return false;
    if (typeof letter.relation !== "string") return false;
    if (Letters && !Letters.isValidRelation(letter.relation)) return false;
    if (!Array.isArray(letter.emotionTags)) return false;
    if (
      Letters &&
      !letter.emotionTags.every(Letters.isValidEmotion)
    )
      return false;
    if (typeof letter.eventText !== "string") return false;
    if (typeof letter.trueFeelingText !== "string") return false;
    if (["sealed", "delivered", "opened"].indexOf(letter.status) === -1)
      return false;
    if (!Array.isArray(letter.reflections)) return false;
    return true;
  }

  /**
   * インポートされたJSON文字列を検証し、{settings, letters} を返す。
   * 不正な形式であれば例外を投げる。
   */
  function parseImportPayload(jsonString) {
    var data;
    try {
      data = JSON.parse(jsonString);
    } catch (err) {
      throw new Error(
        "ファイルの読み込みに失敗しました。JSON形式のバックアップファイルを選んでください。"
      );
    }
    if (!isPlainObject(data)) {
      throw new Error("バックアップファイルの形式が正しくありません。");
    }
    if (!Array.isArray(data.letters)) {
      throw new Error("手紙のデータが見つかりませんでした。");
    }
    var invalid = data.letters.some(function (letter) {
      return !isValidLetterShape(letter);
    });
    if (invalid) {
      throw new Error("手紙データの一部が正しい形式ではありません。");
    }
    var settings = isPlainObject(data.settings) ? data.settings : {};
    return { settings: settings, letters: data.letters };
  }

  /**
   * 既存の手紙リストにインポートしたデータをマージする。
   * 同じidの手紙は取り込んだ側で上書きする。
   */
  function mergeLetters(existingLetters, importedLetters) {
    var byId = {};
    (existingLetters || []).forEach(function (letter) {
      byId[letter.id] = letter;
    });
    (importedLetters || []).forEach(function (letter) {
      byId[letter.id] = letter;
    });
    return Object.keys(byId).map(function (id) {
      return byId[id];
    });
  }

  function buildExportFilename(now) {
    now = now || new Date();
    function pad(n) {
      return n < 10 ? "0" + n : "" + n;
    }
    var name =
      "kanjo-post-backup-" +
      now.getFullYear() +
      pad(now.getMonth() + 1) +
      pad(now.getDate()) +
      "-" +
      pad(now.getHours()) +
      pad(now.getMinutes()) +
      ".json";
    return name;
  }

  return {
    FORMAT_VERSION: FORMAT_VERSION,
    buildExportPayload: buildExportPayload,
    parseImportPayload: parseImportPayload,
    mergeLetters: mergeLetters,
    buildExportFilename: buildExportFilename,
    isValidLetterShape: isValidLetterShape,
  };
});
