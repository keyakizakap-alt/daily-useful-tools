(function (root, factory) {
  var mod = factory();
  if (typeof module === 'object' && module.exports) {
    module.exports = mod;
  } else {
    root.NoshiData = mod;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  return {
  "relations": [
    {
      "id": "parent_grandparent",
      "label": "親・祖父母"
    },
    {
      "id": "sibling",
      "label": "兄弟姉妹"
    },
    {
      "id": "relative",
      "label": "親戚"
    },
    {
      "id": "friend",
      "label": "友人・知人"
    },
    {
      "id": "colleague",
      "label": "会社の同僚"
    },
    {
      "id": "boss_client",
      "label": "会社の上司・取引先"
    },
    {
      "id": "neighbor",
      "label": "近所の人"
    }
  ],
  "ageGroups": [
    {
      "id": "infant",
      "label": "未就学児"
    },
    {
      "id": "elementary",
      "label": "小学生"
    },
    {
      "id": "middle",
      "label": "中学生"
    },
    {
      "id": "high",
      "label": "高校生"
    },
    {
      "id": "college",
      "label": "大学生・成人"
    }
  ],
  "occasions": [
    {
      "id": "wedding",
      "name": "結婚祝い",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "寿",
          "note": "結婚祝いの表書きとして最も一般的"
        },
        {
          "text": "御祝",
          "note": "汎用的に使える表書き"
        },
        {
          "text": "御結婚御祝",
          "note": "やや丁寧な言い回し"
        }
      ],
      "mizuhiki": {
        "type": "結び切り または あわじ結び",
        "color": "紅白 または 金銀",
        "knotCount": "10本（両家の結びつきを表す）",
        "note": "一度きりであってほしい行事のため、ほどけない結び切り系を使う"
      },
      "naming": "水引の下中央にフルネームで記名。夫婦連名の場合は夫の氏名を中央に、妻の名のみを左に並べる。",
      "soubaByRelation": {
        "parent_grandparent": "50,000円〜100,000円",
        "sibling": "30,000円〜50,000円",
        "relative": "10,000円〜30,000円",
        "friend": "20,000円〜30,000円",
        "colleague": "10,000円〜20,000円（連名の場合は5,000円〜10,000円）",
        "boss_client": "10,000円〜30,000円",
        "neighbor": "10,000円〜20,000円"
      }
    },
    {
      "id": "birth",
      "name": "出産祝い",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "御祝",
          "note": "最も一般的な表書き"
        },
        {
          "text": "御出産御祝",
          "note": "丁寧な言い回し"
        }
      ],
      "mizuhiki": {
        "type": "蝶結び",
        "color": "紅白",
        "knotCount": "5本または7本",
        "note": "何度あっても喜ばしい行事のため、結び直せる蝶結びを使う"
      },
      "naming": "水引の下中央にフルネームで記名。",
      "soubaByRelation": {
        "parent_grandparent": "10,000円〜100,000円",
        "sibling": "10,000円〜30,000円",
        "relative": "5,000円〜10,000円",
        "friend": "5,000円〜10,000円",
        "colleague": "3,000円〜5,000円",
        "boss_client": "5,000円〜10,000円",
        "neighbor": "3,000円〜5,000円"
      }
    },
    {
      "id": "funeral_buddhist_wake",
      "name": "香典（仏式・通夜／葬儀・告別式）",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "御霊前",
          "note": "四十九日（忌明け）より前、故人がまだ「霊」とされる期間に使用"
        },
        {
          "text": "御香典",
          "note": "宗派を問わず使える汎用的な表書き"
        }
      ],
      "mizuhiki": {
        "type": "結び切り",
        "color": "黒白（関西・北陸など一部地域では黄白の場合あり）",
        "knotCount": "水引なしの印刷タイプも一般的",
        "note": "二度と繰り返したくない行事のため結び切りを使う。地域慣習の差があるため迷う場合は黒白を選べば無難"
      },
      "naming": "水引の下中央にフルネームで記名。連名は目上の人を右から順に。",
      "soubaByRelation": {
        "parent_grandparent": "50,000円〜100,000円",
        "sibling": "30,000円〜50,000円",
        "relative": "10,000円〜30,000円",
        "friend": "5,000円〜10,000円",
        "colleague": "5,000円〜10,000円",
        "boss_client": "5,000円〜10,000円",
        "neighbor": "3,000円〜5,000円"
      }
    },
    {
      "id": "funeral_buddhist_after49",
      "name": "香典（仏式・四十九日以降の法要）",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "御仏前",
          "note": "四十九日（忌明け）以降、故人が「仏」になったとされて以降に使用"
        }
      ],
      "mizuhiki": {
        "type": "結び切り",
        "color": "黒白 または 双銀",
        "knotCount": "水引なしの印刷タイプも一般的",
        "note": "御霊前と御仏前は忌明けの前後で使い分けるのが基本"
      },
      "naming": "水引の下中央にフルネームで記名。",
      "soubaByRelation": {
        "parent_grandparent": "10,000円〜50,000円",
        "sibling": "10,000円〜30,000円",
        "relative": "5,000円〜20,000円",
        "friend": "5,000円〜10,000円",
        "colleague": "3,000円〜10,000円",
        "boss_client": "5,000円〜10,000円",
        "neighbor": "3,000円〜5,000円"
      }
    },
    {
      "id": "funeral_shinto",
      "name": "香典（神式）",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "御玉串料",
          "note": "神式の葬儀・霊祭で広く使われる表書き"
        },
        {
          "text": "御榊料",
          "note": "御玉串料と同様の意味で使われる"
        }
      ],
      "mizuhiki": {
        "type": "結び切り",
        "color": "黒白 または 双銀",
        "knotCount": "水引なしの印刷タイプも一般的",
        "note": "仏式で使う「御仏前」「御香典」は使わないよう注意（宗教的に不適切）"
      },
      "naming": "水引の下中央にフルネームで記名。",
      "soubaByRelation": {
        "parent_grandparent": "50,000円〜100,000円",
        "sibling": "30,000円〜50,000円",
        "relative": "10,000円〜30,000円",
        "friend": "5,000円〜10,000円",
        "colleague": "5,000円〜10,000円",
        "boss_client": "5,000円〜10,000円",
        "neighbor": "3,000円〜5,000円"
      }
    },
    {
      "id": "funeral_christian",
      "name": "香典（キリスト教式）",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "御花料",
          "note": "カトリック・プロテスタント共通で使いやすい表書き"
        },
        {
          "text": "御ミサ料",
          "note": "カトリックの場合に使われることがある"
        }
      ],
      "mizuhiki": {
        "type": "水引なしの封筒（十字架や百合の絵柄入り）が一般的",
        "color": "白無地",
        "knotCount": "-",
        "note": "水引がついた和風の不祝儀袋は使わないのが基本"
      },
      "naming": "封筒中央にフルネームで記名。",
      "soubaByRelation": {
        "parent_grandparent": "50,000円〜100,000円",
        "sibling": "30,000円〜50,000円",
        "relative": "10,000円〜30,000円",
        "friend": "5,000円〜10,000円",
        "colleague": "5,000円〜10,000円",
        "boss_client": "5,000円〜10,000円",
        "neighbor": "3,000円〜5,000円"
      }
    },
    {
      "id": "school",
      "name": "入学・卒業祝い",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "御祝",
          "note": "汎用的な表書き"
        },
        {
          "text": "御入学祝",
          "note": "入学に特化した表書き"
        },
        {
          "text": "御卒業祝",
          "note": "卒業に特化した表書き"
        }
      ],
      "mizuhiki": {
        "type": "蝶結び",
        "color": "紅白",
        "knotCount": "5本または7本",
        "note": "何度あっても喜ばしい行事のため蝶結びを使う"
      },
      "naming": "水引の下中央にフルネームで記名。",
      "soubaByRelation": {
        "parent_grandparent": "10,000円〜30,000円",
        "sibling": "5,000円〜10,000円",
        "relative": "5,000円〜10,000円",
        "friend": "3,000円〜5,000円",
        "colleague": "3,000円〜5,000円",
        "boss_client": "3,000円〜5,000円",
        "neighbor": "3,000円〜5,000円"
      }
    },
    {
      "id": "employment",
      "name": "就職祝い",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "御祝",
          "note": "汎用的な表書き"
        },
        {
          "text": "御就職御祝",
          "note": "就職に特化した表書き"
        }
      ],
      "mizuhiki": {
        "type": "蝶結び",
        "color": "紅白",
        "knotCount": "5本または7本",
        "note": "何度あっても喜ばしい行事のため蝶結びを使う"
      },
      "naming": "水引の下中央にフルネームで記名。",
      "soubaByRelation": {
        "parent_grandparent": "10,000円〜30,000円",
        "sibling": "5,000円〜10,000円",
        "relative": "5,000円〜10,000円",
        "friend": "5,000円〜10,000円",
        "colleague": "3,000円〜5,000円",
        "boss_client": "3,000円〜5,000円",
        "neighbor": "3,000円〜5,000円"
      }
    },
    {
      "id": "recovery",
      "name": "快気祝い",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "快気祝",
          "note": "全快した場合に使用"
        },
        {
          "text": "快気内祝",
          "note": "完治はしていないが退院した場合などに使用"
        }
      ],
      "mizuhiki": {
        "type": "結び切り",
        "color": "紅白",
        "knotCount": "5本",
        "note": "病気や怪我を繰り返さないようにという願いを込めて結び切りを使う（出産祝い等の蝶結びとは異なる点に注意）"
      },
      "naming": "水引の下中央にフルネームで記名。",
      "soubaByRelation": {
        "parent_grandparent": "3,000円〜5,000円（お見舞い額の半返し〜3分の1が目安）",
        "sibling": "3,000円〜5,000円",
        "relative": "3,000円〜5,000円",
        "friend": "3,000円〜5,000円",
        "colleague": "2,000円〜3,000円",
        "boss_client": "3,000円〜5,000円",
        "neighbor": "2,000円〜3,000円"
      }
    },
    {
      "id": "newhouse",
      "name": "新築祝い",
      "relationMode": "relation",
      "omotegaki": [
        {
          "text": "御祝",
          "note": "汎用的な表書き"
        },
        {
          "text": "御新築御祝",
          "note": "新築に特化した表書き"
        }
      ],
      "mizuhiki": {
        "type": "蝶結び",
        "color": "紅白",
        "knotCount": "5本または7本",
        "note": "何度あっても喜ばしい行事のため蝶結びを使う。ただし「火」を連想させる品物（ライター等）は贈らないのがマナー"
      },
      "naming": "水引の下中央にフルネームで記名。",
      "soubaByRelation": {
        "parent_grandparent": "10,000円〜50,000円",
        "sibling": "10,000円〜30,000円",
        "relative": "5,000円〜10,000円",
        "friend": "5,000円〜10,000円",
        "colleague": "5,000円〜10,000円",
        "boss_client": "5,000円〜10,000円",
        "neighbor": "3,000円〜5,000円"
      }
    },
    {
      "id": "otoshidama",
      "name": "お年玉",
      "relationMode": "age",
      "omotegaki": [
        {
          "text": "御年玉",
          "note": "お年玉専用のポチ袋に印刷済みのことが多い"
        }
      ],
      "mizuhiki": {
        "type": "ポチ袋（水引なしの小袋、または印刷の蝶結び柄）",
        "color": "干支・キャラクター柄なども可",
        "knotCount": "-",
        "note": "目上の人の子どもに渡す場合でも「御年玉」は失礼にあたらないが、目上の人本人には「御年賀」を使う"
      },
      "naming": "特になし（ポチ袋に子どもの名前を書くと丁寧）。",
      "soubaByAge": {
        "infant": "1,000円〜3,000円",
        "elementary": "3,000円〜5,000円",
        "middle": "5,000円程度",
        "high": "5,000円〜10,000円",
        "college": "10,000円程度"
      }
    }
  ]
};
});
