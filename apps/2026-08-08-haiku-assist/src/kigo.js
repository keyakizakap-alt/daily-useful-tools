(function (root, factory) {
  var moduleExports = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = moduleExports;
  }
  root.KigoData = moduleExports;
})(typeof self !== 'undefined' ? self : this, function () {
  var KIGO_DICTIONARY = {
    spring: [
      { word: '桜', reading: 'さくら', description: '春を代表する花。開花から散り際まで幅広く詠まれる。' },
      { word: '梅', reading: 'うめ', description: '早春に咲く花。桜より一足早い春の訪れを告げる。' },
      { word: '入学', reading: 'にゅうがく', description: '新しい生活の始まりを象徴する季語。' },
      { word: '蝶', reading: 'ちょう', description: '春から初夏にかけて舞う姿が詠まれる。' },
      { word: '若葉', reading: 'わかば', description: '芽吹いたばかりの瑞々しい葉。' },
      { word: '花見', reading: 'はなみ', description: '桜の花を眺めて楽しむ春の行事。' },
      { word: '春風', reading: 'はるかぜ', description: '春に吹くやわらかな風。' },
      { word: 'つくし', reading: 'つくし', description: '春先に土から顔を出すスギナの胞子茎。' },
      { word: 'うぐいす', reading: 'うぐいす', description: '春を告げる鳥として親しまれる。' },
      { word: '雪解', reading: 'ゆきどけ', description: '冬の雪が解けていく春先の様子。' },
      { word: '陽炎', reading: 'かげろう', description: '春先の暖かい日に地面から立ち上る揺らめき。' },
    ],
    summer: [
      { word: '蟬', reading: 'せみ', description: '夏を象徴する鳴き声の主。' },
      { word: '花火', reading: 'はなび', description: '夏の夜を彩る風物詩。' },
      { word: '夕立', reading: 'ゆうだち', description: '夏の午後に急に降る雨。' },
      { word: '風鈴', reading: 'ふうりん', description: '涼を呼ぶ音色を奏でる夏の道具。' },
      { word: '朝顔', reading: 'あさがお', description: '夏の朝に咲く花。' },
      { word: '海水浴', reading: 'かいすいよく', description: '夏の代表的なレジャー。' },
      { word: '入道雲', reading: 'にゅうどうぐも', description: '夏空にそびえる積乱雲。' },
      { word: '金魚', reading: 'きんぎょ', description: '縁日や夏の風物詩として詠まれる。' },
      { word: '涼し', reading: 'すずし', description: '暑さの中にふと感じる涼を表す。' },
      { word: '西瓜', reading: 'すいか', description: '夏を代表する果物。' },
      { word: '蛍', reading: 'ほたる', description: '初夏の夜に光を放つ昆虫。' },
    ],
    autumn: [
      { word: '紅葉', reading: 'もみじ', description: '秋に色づく葉、または楓そのもの。' },
      { word: '月見', reading: 'つきみ', description: '秋の澄んだ夜空に浮かぶ月を愛でる行事。' },
      { word: 'コスモス', reading: 'こすもす', description: '秋を代表する花のひとつ。' },
      { word: '秋風', reading: 'あきかぜ', description: '涼しさと物寂しさを含んだ秋の風。' },
      { word: '稲刈', reading: 'いねかり', description: '実った稲を収穫する秋の農作業。' },
      { word: '蜻蛉', reading: 'とんぼ', description: '秋の空を飛び交う昆虫。' },
      { word: '柿', reading: 'かき', description: '秋に熟す代表的な果物。' },
      { word: '虫の声', reading: 'むしのこえ', description: '秋の夜に鳴く鈴虫やコオロギの声。' },
      { word: '天の川', reading: 'あまのがわ', description: '秋の澄んだ夜空に見える星の帯。' },
      { word: '案山子', reading: 'かかし', description: '実りの田を守る秋の風物。' },
      { word: '秋刀魚', reading: 'さんま', description: '秋の味覚を代表する魚。' },
    ],
    winter: [
      { word: '雪', reading: 'ゆき', description: '冬を象徴する自然現象。' },
      { word: '木枯らし', reading: 'こがらし', description: '晩秋から初冬にかけて吹く冷たい風。' },
      { word: '炬燵', reading: 'こたつ', description: '冬の暖房器具。日本の冬の団らんの象徴。' },
      { word: '息白し', reading: 'いきしろし', description: '寒さで吐く息が白く見える様子。' },
      { word: '霜', reading: 'しも', description: '冬の朝に地面や草木を覆う氷の結晶。' },
      { word: '冬眠', reading: 'とうみん', description: '動物が冬を越すために眠ること。' },
      { word: '寒椿', reading: 'かんつばき', description: '寒い時期に咲く椿。' },
      { word: '氷柱', reading: 'つらら', description: '軒先などに垂れ下がる氷。' },
      { word: '焚き火', reading: 'たきび', description: '冬に暖をとるための火。' },
      { word: '除夜の鐘', reading: 'じょやのかね', description: '大晦日の夜に撞かれる鐘。' },
      { word: '北風', reading: 'きたかぜ', description: '冬に吹く冷たい北からの風。' },
    ],
    newyear: [
      { word: '初日の出', reading: 'はつひので', description: '元日に昇る最初の太陽。' },
      { word: '初詣', reading: 'はつもうで', description: '年が明けて最初に神社仏閣へお参りすること。' },
      { word: '門松', reading: 'かどまつ', description: '正月に玄関先に飾る松飾り。' },
      { word: '雑煮', reading: 'ぞうに', description: '正月に食べる餅入りの汁物。' },
      { word: '年賀状', reading: 'ねんがじょう', description: '新年の挨拶を書いて送るはがき。' },
      { word: '凧揚げ', reading: 'たこあげ', description: '正月の代表的な遊び。' },
      { word: '鏡餅', reading: 'かがみもち', description: '正月に飾る丸い餅。' },
      { word: '七草', reading: 'ななくさ', description: '1月7日に食べる七草粥の材料。' },
      { word: '初夢', reading: 'はつゆめ', description: '新年になって最初に見る夢。' },
      { word: '御節', reading: 'おせち', description: '正月に食べる伝統的な料理。' },
      { word: '福袋', reading: 'ふくぶくろ', description: '正月に販売される中身が見えない福袋。' },
    ],
  };

  var SEASON_LABELS = {
    spring: '春',
    summer: '夏',
    autumn: '秋',
    winter: '冬',
    newyear: '新年',
  };

  function findKigoInText(text) {
    if (!text) return [];
    var found = [];
    Object.keys(KIGO_DICTIONARY).forEach(function (season) {
      KIGO_DICTIONARY[season].forEach(function (entry) {
        if (text.indexOf(entry.word) !== -1 || (entry.reading && text.indexOf(entry.reading) !== -1)) {
          found.push({ season: season, seasonLabel: SEASON_LABELS[season], entry: entry });
        }
      });
    });
    return found;
  }

  return {
    KIGO_DICTIONARY: KIGO_DICTIONARY,
    SEASON_LABELS: SEASON_LABELS,
    findKigoInText: findKigoInText,
  };
});
