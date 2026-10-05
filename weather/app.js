"use strict";

/* ============================================================
 * 1. 地点データ
 *    緯度経度は各都市の市役所／県庁所在地周辺の代表点。
 *    pin: true の 9 地点が「主要な天気の閲覧地点」として既定で上段に並ぶ。
 * ============================================================ */
const REGIONS = ["北海道・東北", "関東", "中部", "近畿", "中国・四国", "九州・沖縄"];

const CITIES = [
  // --- 主要地点（既定でピン留め）-----------------------------------------
  { id: "sapporo",   name: "札幌",   sub: "北海道",   region: "北海道・東北", lat: 43.0618, lon: 141.3545, pin: true, jma: "016000", jmaArea: "石狩地方" },
  { id: "tokyo",     name: "東京",   sub: "東京都",   region: "関東",         lat: 35.6895, lon: 139.6917, pin: true, jma: "130000", jmaArea: "東京地方" },
  { id: "nagoya",    name: "名古屋", sub: "愛知県",   region: "中部",         lat: 35.1815, lon: 136.9066, pin: true, jma: "230000", jmaArea: "西部" },
  { id: "osaka",     name: "大阪",   sub: "大阪府",   region: "近畿",         lat: 34.6937, lon: 135.5023, pin: true, jma: "270000", jmaArea: "大阪府" },
  { id: "kobe",      name: "神戸",   sub: "兵庫県",   region: "近畿",         lat: 34.6901, lon: 135.1955, pin: true, jma: "280000", jmaArea: "南部" },
  { id: "fukuoka",   name: "福岡",   sub: "福岡県",   region: "九州・沖縄",   lat: 33.5902, lon: 130.4017, pin: true, jma: "400000", jmaArea: "福岡地方" },
  { id: "nagasaki",  name: "長崎",   sub: "長崎県",   region: "九州・沖縄",   lat: 32.7503, lon: 129.8779, pin: true, jma: "420000", jmaArea: "南部" },
  { id: "kumamoto",  name: "熊本",   sub: "熊本県",   region: "九州・沖縄",   lat: 32.8031, lon: 130.7079, pin: true, jma: "430000", jmaArea: "熊本地方" },
  { id: "naha",      name: "那覇",   sub: "沖縄県",   region: "九州・沖縄",   lat: 26.2124, lon: 127.6809, pin: true, jma: "471000", jmaArea: "沖縄本島中南部" },

  // --- 北海道・東北 --------------------------------------------------------
  { id: "asahikawa", name: "旭川",   sub: "北海道",   region: "北海道・東北", lat: 43.7708, lon: 142.3650, jma: "012000" },
  { id: "hakodate",  name: "函館",   sub: "北海道",   region: "北海道・東北", lat: 41.7687, lon: 140.7288, jma: "017000" },
  { id: "kushiro",   name: "釧路",   sub: "北海道",   region: "北海道・東北", lat: 42.9849, lon: 144.3820, jma: "014100" },
  { id: "aomori",    name: "青森",   sub: "青森県",   region: "北海道・東北", lat: 40.8246, lon: 140.7406, jma: "020000" },
  { id: "morioka",   name: "盛岡",   sub: "岩手県",   region: "北海道・東北", lat: 39.7036, lon: 141.1527, jma: "030000" },
  { id: "sendai",    name: "仙台",   sub: "宮城県",   region: "北海道・東北", lat: 38.2682, lon: 140.8694, jma: "040000", jmaArea: "東部" },
  { id: "akita",     name: "秋田",   sub: "秋田県",   region: "北海道・東北", lat: 39.7186, lon: 140.1024, jma: "050000" },
  { id: "yamagata",  name: "山形",   sub: "山形県",   region: "北海道・東北", lat: 38.2404, lon: 140.3633, jma: "060000" },
  { id: "fukushima", name: "福島",   sub: "福島県",   region: "北海道・東北", lat: 37.7500, lon: 140.4678, jma: "070000" },

  // --- 関東 ----------------------------------------------------------------
  { id: "mito",      name: "水戸",   sub: "茨城県",   region: "関東", lat: 36.3418, lon: 140.4468, jma: "080000" },
  { id: "utsunomiya",name: "宇都宮", sub: "栃木県",   region: "関東", lat: 36.5658, lon: 139.8836, jma: "090000" },
  { id: "maebashi",  name: "前橋",   sub: "群馬県",   region: "関東", lat: 36.3895, lon: 139.0634, jma: "100000" },
  { id: "saitama",   name: "さいたま", sub: "埼玉県", region: "関東", lat: 35.8617, lon: 139.6455, jma: "110000", jmaArea: "南部" },
  { id: "chiba",     name: "千葉",   sub: "千葉県",   region: "関東", lat: 35.6074, lon: 140.1065, jma: "120000", jmaArea: "北西部" },
  { id: "yokohama",  name: "横浜",   sub: "神奈川県", region: "関東", lat: 35.4437, lon: 139.6380, jma: "140000", jmaArea: "東部" },
  { id: "hakone",    name: "箱根",   sub: "神奈川県", region: "関東", lat: 35.2324, lon: 139.1069, jma: "140000" },

  // --- 中部 ----------------------------------------------------------------
  { id: "niigata",   name: "新潟",   sub: "新潟県",   region: "中部", lat: 37.9026, lon: 139.0235, jma: "150000" },
  { id: "toyama",    name: "富山",   sub: "富山県",   region: "中部", lat: 36.6953, lon: 137.2113, jma: "160000" },
  { id: "kanazawa",  name: "金沢",   sub: "石川県",   region: "中部", lat: 36.5947, lon: 136.6256, jma: "170000" },
  { id: "fukui",     name: "福井",   sub: "福井県",   region: "中部", lat: 36.0652, lon: 136.2216, jma: "180000" },
  { id: "kofu",      name: "甲府",   sub: "山梨県",   region: "中部", lat: 35.6642, lon: 138.5684, jma: "190000" },
  { id: "nagano",    name: "長野",   sub: "長野県",   region: "中部", lat: 36.6513, lon: 138.1810, jma: "200000" },
  { id: "karuizawa", name: "軽井沢", sub: "長野県",   region: "中部", lat: 36.3485, lon: 138.5966, jma: "200000" },
  { id: "gifu",      name: "岐阜",   sub: "岐阜県",   region: "中部", lat: 35.3912, lon: 136.7223, jma: "210000" },
  { id: "shizuoka",  name: "静岡",   sub: "静岡県",   region: "中部", lat: 34.9769, lon: 138.3831, jma: "220000" },
  { id: "tsu",       name: "津",     sub: "三重県",   region: "中部", lat: 34.7303, lon: 136.5086, jma: "240000" },

  // --- 近畿 ----------------------------------------------------------------
  { id: "otsu",      name: "大津",   sub: "滋賀県",   region: "近畿", lat: 35.0045, lon: 135.8686, jma: "250000" },
  { id: "kyoto",     name: "京都",   sub: "京都府",   region: "近畿", lat: 35.0116, lon: 135.7681, jma: "260000", jmaArea: "南部" },
  { id: "himeji",    name: "姫路",   sub: "兵庫県",   region: "近畿", lat: 34.8154, lon: 134.6854, jma: "280000", jmaArea: "南部" },
  { id: "nara",      name: "奈良",   sub: "奈良県",   region: "近畿", lat: 34.6851, lon: 135.8048, jma: "290000" },
  { id: "wakayama",  name: "和歌山", sub: "和歌山県", region: "近畿", lat: 34.2260, lon: 135.1675, jma: "300000" },

  // --- 中国・四国 ----------------------------------------------------------
  { id: "tottori",   name: "鳥取",   sub: "鳥取県",   region: "中国・四国", lat: 35.5011, lon: 134.2351, jma: "310000" },
  { id: "matsue",    name: "松江",   sub: "島根県",   region: "中国・四国", lat: 35.4723, lon: 133.0505, jma: "320000" },
  { id: "okayama",   name: "岡山",   sub: "岡山県",   region: "中国・四国", lat: 34.6551, lon: 133.9195, jma: "330000" },
  { id: "hiroshima", name: "広島",   sub: "広島県",   region: "中国・四国", lat: 34.3853, lon: 132.4553, jma: "340000", jmaArea: "南部" },
  { id: "yamaguchi", name: "山口",   sub: "山口県",   region: "中国・四国", lat: 34.1859, lon: 131.4706, jma: "350000" },
  { id: "tokushima", name: "徳島",   sub: "徳島県",   region: "中国・四国", lat: 34.0658, lon: 134.5593, jma: "360000" },
  { id: "takamatsu", name: "高松",   sub: "香川県",   region: "中国・四国", lat: 34.3401, lon: 134.0434, jma: "370000" },
  { id: "matsuyama", name: "松山",   sub: "愛媛県",   region: "中国・四国", lat: 33.8416, lon: 132.7657, jma: "380000" },
  { id: "kochi",     name: "高知",   sub: "高知県",   region: "中国・四国", lat: 33.5597, lon: 133.5311, jma: "390000" },

  // --- 九州・沖縄 ----------------------------------------------------------
  { id: "kitakyushu",name: "北九州", sub: "福岡県",   region: "九州・沖縄", lat: 33.8834, lon: 130.8752, jma: "400000", jmaArea: "北九州地方" },
  { id: "saga",      name: "佐賀",   sub: "佐賀県",   region: "九州・沖縄", lat: 33.2494, lon: 130.2988, jma: "410000" },
  { id: "oita",      name: "大分",   sub: "大分県",   region: "九州・沖縄", lat: 33.2382, lon: 131.6126, jma: "440000" },
  { id: "miyazaki",  name: "宮崎",   sub: "宮崎県",   region: "九州・沖縄", lat: 31.9111, lon: 131.4239, jma: "450000" },
  { id: "kagoshima", name: "鹿児島", sub: "鹿児島県", region: "九州・沖縄", lat: 31.5966, lon: 130.5571, jma: "460100", jmaArea: "薩摩地方" },
  { id: "miyakojima",name: "宮古島", sub: "沖縄県",   region: "九州・沖縄", lat: 24.8055, lon: 125.2811, jma: "473000" },
  { id: "ishigaki",  name: "石垣",   sub: "沖縄県",   region: "九州・沖縄", lat: 24.3448, lon: 124.1572, jma: "474000" }
];

const CITY_BY_ID = new Map(CITIES.map(c => [c.id, c]));
/** ユーザーが検索して追加した地点を登録する（id は "geo:<Open-MeteoのID>"） */
/** 検索で追加した地点（"geo:<数値ID>"）として妥当か。保存データや API の値は信用しない */
function isValidCustomCity(c) {
  return !!c && typeof c.id === "string" && /^geo:\d{1,12}$/.test(c.id)
    && typeof c.name === "string" && c.name.length > 0 && c.name.length <= 100
    && (c.sub === undefined || (typeof c.sub === "string" && c.sub.length <= 100))
    && typeof c.lat === "number" && isFinite(c.lat) && c.lat >= -90 && c.lat <= 90
    && typeof c.lon === "number" && isFinite(c.lon) && c.lon >= -180 && c.lon <= 180;
}
/** Geocoding API の 1 件が表示・追加に使える形か */
function isValidGeoResult(r) {
  return !!r && /^\d{1,12}$/.test(String(r.id)) && typeof r.name === "string" && r.name.length > 0 && r.name.length <= 100
    && typeof r.latitude === "number" && isFinite(r.latitude) && Math.abs(r.latitude) <= 90
    && typeof r.longitude === "number" && isFinite(r.longitude) && Math.abs(r.longitude) <= 180;
}
function registerCity(c) {
  if (!c || !c.id || typeof c.lat !== "number" || typeof c.lon !== "number") return null;
  if (!CITY_BY_ID.has(c.id)) CITY_BY_ID.set(c.id, c);
  return CITY_BY_ID.get(c.id);
}
function isCustom(id) { return String(id).indexOf("geo:") === 0; }
/** 現在地は専用の固定 ID を使い、取得のたびに座標を入れ替える */
const CURRENT_LOCATION_ID = "geo:0";
/** 画面下部のタブ */
const TABS = ["radar", "weather", "region", "news", "menu"];
const DEFAULT_PINNED = CITIES.filter(c => c.pin).map(c => c.id);
/** 既定で一覧に出す地点（主要9地点＋主要都市を少しだけ） */
const DEFAULT_SELECTED = DEFAULT_PINNED.concat(["sendai", "yokohama", "kyoto", "hiroshima", "kagoshima"]);

/* ============================================================
 * 2. WMO 天気コード → 日本語 / アイコン / 配色
 *    Open-Meteo は WMO 4677 に準拠した weather_code を返す。
 * ============================================================ */
const WMO = {
  0:  { label: "快晴",             icon: "sun",      sky: ["#4a90e2", "#7cb6ef"] },
  1:  { label: "晴れ",             icon: "sun",      sky: ["#4a90e2", "#83bcf0"] },
  2:  { label: "晴れ時々くもり",   icon: "partly",   sky: ["#5b93cf", "#8fb4d8"] },
  3:  { label: "くもり",           icon: "cloud",    sky: ["#7b8a9c", "#a7b4c2"] },
  45: { label: "霧",               icon: "fog",      sky: ["#8d98a4", "#b4bcc4"] },
  48: { label: "霧（着氷性）",     icon: "fog",      sky: ["#8d98a4", "#b4bcc4"] },
  51: { label: "霧雨（弱い）",     icon: "drizzle",  sky: ["#5f7d99", "#8aa4bb"] },
  53: { label: "霧雨",             icon: "drizzle",  sky: ["#5f7d99", "#8aa4bb"] },
  55: { label: "霧雨（強い）",     icon: "drizzle",  sky: ["#546f88", "#7d96ac"] },
  56: { label: "着氷性の霧雨",     icon: "sleet",    sky: ["#5f7d99", "#8aa4bb"] },
  57: { label: "着氷性の霧雨（強）", icon: "sleet",  sky: ["#546f88", "#7d96ac"] },
  61: { label: "弱い雨",           icon: "rain",     sky: ["#4d6f91", "#7a97b3"] },
  63: { label: "雨",               icon: "rain",     sky: ["#41627f", "#6d8aa3"] },
  65: { label: "強い雨",           icon: "rain",     sky: ["#35505f", "#5b7789"] },
  66: { label: "着氷性の雨",       icon: "sleet",    sky: ["#4d6f91", "#7a97b3"] },
  67: { label: "着氷性の雨（強）", icon: "sleet",    sky: ["#41627f", "#6d8aa3"] },
  71: { label: "弱い雪",           icon: "snow",     sky: ["#7f93ab", "#b0c1d2"] },
  73: { label: "雪",               icon: "snow",     sky: ["#71879f", "#a3b6c9"] },
  75: { label: "強い雪",           icon: "snow",     sky: ["#627690", "#93a7bd"] },
  77: { label: "霧雪",             icon: "snow",     sky: ["#7f93ab", "#b0c1d2"] },
  80: { label: "にわか雨",         icon: "shower",   sky: ["#4d6f91", "#7a97b3"] },
  81: { label: "にわか雨（強）",   icon: "shower",   sky: ["#41627f", "#6d8aa3"] },
  82: { label: "激しいにわか雨",   icon: "shower",   sky: ["#31485c", "#547189"] },
  85: { label: "にわか雪",         icon: "snow",     sky: ["#71879f", "#a3b6c9"] },
  86: { label: "にわか雪（強）",   icon: "snow",     sky: ["#627690", "#93a7bd"] },
  95: { label: "雷雨",             icon: "thunder",  sky: ["#3b4358", "#5d6780"] },
  96: { label: "雷雨・ひょう",     icon: "thunder",  sky: ["#343b4f", "#545e77"] },
  99: { label: "激しい雷雨・ひょう", icon: "thunder", sky: ["#2c3244", "#4a536a"] }
};
const WMO_UNKNOWN = { label: "—", icon: "cloud", sky: ["#7b8a9c", "#a7b4c2"] };
function wmo(code) { return WMO[code] || WMO_UNKNOWN; }

/* ---- インライン SVG アイコン（依存ライブラリなし）---- */
const SUN = '<circle cx="12" cy="12" r="4.6" fill="#f5b942"/><g stroke="#f5b942" stroke-width="1.9" stroke-linecap="round"><path d="M12 2.4v2.4M12 19.2v2.4M2.4 12h2.4M19.2 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7"/></g>';
const MOONLESS_CLOUD = '<path d="M17.6 19.5H7.6a4 4 0 0 1-.4-7.98 5.4 5.4 0 0 1 10.1.9h.3a3.54 3.54 0 0 1 0 7.08Z" fill="#c6d2e0" stroke="#9aabbe" stroke-width="1"/>';
function icon(name, size) {
  const s = size || 24;
  let inner = "";
  switch (name) {
    case "sun":     inner = SUN; break;
    case "partly":  inner = '<circle cx="9" cy="8.6" r="3.7" fill="#f5b942"/><g stroke="#f5b942" stroke-width="1.6" stroke-linecap="round"><path d="M9 1.9v1.7M2.6 8.6h1.7M4.3 3.9l1.2 1.2M13.5 3.9l-1.2 1.2"/></g>' + MOONLESS_CLOUD; break;
    case "cloud":   inner = MOONLESS_CLOUD; break;
    case "fog":     inner = MOONLESS_CLOUD + '<g stroke="#8fa0b3" stroke-width="1.5" stroke-linecap="round" opacity=".85"><path d="M3.5 21.6h7M13.5 21.6h7"/></g>'; break;
    case "drizzle": inner = MOONLESS_CLOUD + '<g stroke="#4f8fd1" stroke-width="1.7" stroke-linecap="round"><path d="M9.4 20.6v1.6M14.4 20.6v1.6"/></g>'; break;
    case "rain":    inner = MOONLESS_CLOUD + '<g stroke="#3b82c4" stroke-width="1.8" stroke-linecap="round"><path d="M8.6 20.2l-.8 2.4M12.4 20.2l-.8 2.4M16.2 20.2l-.8 2.4"/></g>'; break;
    case "shower":  inner = MOONLESS_CLOUD + '<g stroke="#3b82c4" stroke-width="1.8" stroke-linecap="round"><path d="M9 20.2l-1 2.5M14.6 20.2l-1 2.5"/></g><circle cx="11.8" cy="22.2" r="1" fill="#3b82c4"/>'; break;
    case "sleet":   inner = MOONLESS_CLOUD + '<g stroke="#3b82c4" stroke-width="1.8" stroke-linecap="round"><path d="M9 20.2l-.9 2.5"/></g><g stroke="#6fa8d6" stroke-width="1.5" stroke-linecap="round"><path d="M14.6 20.4v2.2M13.6 21.5h2"/></g>'; break;
    case "snow":    inner = MOONLESS_CLOUD + '<g stroke="#6fa8d6" stroke-width="1.5" stroke-linecap="round"><path d="M8.6 20.3v2.2M7.6 21.4h2M13.8 20.3v2.2M12.8 21.4h2"/></g>'; break;
    case "thunder": inner = MOONLESS_CLOUD + '<path d="M12.6 19.4l-3.4 4.2h2.5l-1 2.9 3.9-4.7h-2.6l1.4-2.4Z" fill="#f0a93c" transform="translate(0,-1)"/>'; break;
    default:        inner = MOONLESS_CLOUD;
  }
  return '<svg viewBox="0 0 24 26" width="' + s + '" height="' + s + '" fill="none" aria-hidden="true">' + inner + '</svg>';
}

/* ============================================================
 * 3. 状態管理（localStorage に保存）
 * ============================================================ */
const STORE_KEY = "soranarabe.v1";
const state = {
  selected: DEFAULT_SELECTED.slice(),
  pinned: DEFAULT_PINNED.slice(),
  unit: "c",
  view: "cards",
  sort: "default",
  theme: "auto",
  tableSort: { key: null, dir: 1 },
  custom: [],           // ユーザーが検索して追加した地点
  openCity: null,       // 「天気」タブで表示している地点
  openDay: 0,           // 「天気」タブで選んでいる日
  tab: "radar",         // radar / weather / region / news / menu
  weatherCity: null,    // 「天気」タブで最後に見ていた地点
  radarCity: null,      // 雨雲レーダーの中心にしている地点
  radarBase: "photo",   // レーダーの背景地図 photo / std / pale
  data: new Map(),      // cityId -> normalized forecast
  errors: new Map(),    // cityId -> message
  alerts: new Map(),    // 府県予報区コード -> 気象庁の警報・注意報
  alertFallback: false, // 気象庁 JSON を取得できず独自判定に切り替えたか
  loading: false,
  fetchedAt: null
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);
    // 追加地点を先に登録してから、保存された選択内容を検証する
    if (Array.isArray(s.custom)) {
      // 保存データは書き換えられている可能性があるため、必要な項目だけを検証して取り込む
      s.custom.filter(isValidCustomCity).slice(0, 50).forEach(c => {
        const city = { id: c.id, name: c.name, sub: c.sub || "", region: "追加した地点", lat: c.lat, lon: c.lon, jma: null,
                       country: typeof c.country === "string" ? c.country.slice(0, 2) : "" };
        // 現在地は保存データの府県予報区を信用せず、座標から最寄りの内蔵地点を引き直す
        if (city.id === CURRENT_LOCATION_ID) Object.assign(city, currentLocationMeta(city.lat, city.lon));
        if (registerCity(city)) state.custom.push(city);
      });
    }
    const valid = id => CITY_BY_ID.has(id);
    if (Array.isArray(s.selected)) state.selected = s.selected.filter(valid);
    if (Array.isArray(s.pinned))   state.pinned   = s.pinned.filter(valid);
    if (s.unit === "c" || s.unit === "f") state.unit = s.unit;
    if (s.view === "cards" || s.view === "table") state.view = s.view;
    if (typeof s.sort === "string") state.sort = s.sort;
    if (["auto", "light", "dark"].includes(s.theme)) state.theme = s.theme;
    if (TABS.includes(s.tab)) state.tab = s.tab;
    if (["photo", "std", "pale"].includes(s.radarBase)) state.radarBase = s.radarBase;
    if (valid(s.weatherCity)) state.weatherCity = s.weatherCity;
    if (valid(s.radarCity)) state.radarCity = s.radarCity;
    if (!state.selected.length) state.selected = DEFAULT_SELECTED.slice();
    // ピン留めは必ず表示対象に含める
    state.pinned.forEach(id => { if (!state.selected.includes(id)) state.selected.push(id); });
  } catch (e) { /* 壊れた保存データは無視して初期値で続行 */ }
}
function saveState() {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({
      selected: state.selected, pinned: state.pinned, custom: state.custom,
      unit: state.unit, view: state.view, sort: state.sort, theme: state.theme,
      tab: state.tab, weatherCity: state.weatherCity, radarCity: state.radarCity, radarBase: state.radarBase
    }));
  } catch (e) { /* プライベートモード等で保存できなくても動作は継続 */ }
}

/* ============================================================
 * 4. 表示ユーティリティ
 * ============================================================ */
const JST = "Asia/Tokyo";
const DOW = ["日", "月", "火", "水", "木", "金", "土"];

function toUnit(c) { return state.unit === "f" ? c * 9 / 5 + 32 : c; }
function unitLabel() { return state.unit === "f" ? "°F" : "°C"; }
function fmtTemp(c, digits) {
  if (c === null || c === undefined || Number.isNaN(c)) return "—";
  return toUnit(c).toFixed(digits === undefined ? 0 : digits);
}
function fmtNum(v, suffix) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return Math.round(v) + (suffix || "");
}
/** 風向と風速をまとめて文字列にする（風向が無ければ風速だけ） */
function windText(deg, speed) {
  const dir = windDir(deg);
  const sp = fmtNum(speed);
  return dir ? dir + " " + sp : sp;
}
function windDir(deg) {
  if (deg === null || deg === undefined) return "";
  const dirs = ["北", "北北東", "北東", "東北東", "東", "東南東", "南東", "南南東",
                "南", "南南西", "南西", "西南西", "西", "西北西", "北西", "北北西"];
  return dirs[Math.round(deg / 22.5) % 16];
}
/** "2026-09-12T15:00" 形式（APIはタイムゾーン指定時にローカル時刻の裸文字列を返す） */
function parseLocal(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(String(s));
  if (!m) { const d = new Date(s); return isNaN(d) ? null : d; }
  return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0));
}
function fmtClock(s) {
  const d = parseLocal(s);
  return d ? String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0") : "—";
}
function nowJstText() {
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      timeZone: JST, month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit"
    }).format(new Date());
  } catch (e) {
    return new Date().toLocaleString("ja-JP");
  }
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, ch =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}

/* ============================================================
 * 5. データ取得（Open-Meteo Forecast API / APIキー不要）
 *    - 複数地点は latitude/longitude をカンマ区切りで 1 リクエストにまとめる
 *      （レスポンスは配列）。配列で返らない環境に備え、単数レスポンスも受ける。
 *    - まとめ取得が失敗した場合は地点ごとの個別リクエストにフォールバックする。
 * ============================================================ */
const API = "https://api.open-meteo.com/v1/forecast";
const CURRENT_VARS = ["temperature_2m", "relative_humidity_2m", "apparent_temperature", "is_day",
                      "precipitation", "weather_code", "wind_speed_10m", "wind_direction_10m",
                      "pressure_msl", "cloud_cover"];
const HOURLY_VARS  = ["temperature_2m", "apparent_temperature", "relative_humidity_2m",
                      "precipitation_probability", "precipitation", "weather_code",
                      "wind_speed_10m", "wind_direction_10m", "pressure_msl", "cloud_cover"];
const DAILY_VARS   = ["weather_code", "temperature_2m_max", "temperature_2m_min",
                      "apparent_temperature_max", "apparent_temperature_min",
                      "precipitation_probability_max", "precipitation_sum",
                      "sunrise", "sunset", "wind_speed_10m_max", "wind_direction_10m_dominant",
                      "precipitation_hours", "uv_index_max", "sunshine_duration"];
const FORECAST_DAYS = 16;   // Open-Meteo の上限（= 約2週間先まで）
const CACHE_KEY = "soranarabe.cache.v1";
const CACHE_TTL_MS = 3 * 60 * 60 * 1000;   // 3時間より古いキャッシュは表示しない
const AUTO_REFRESH_MS = 15 * 60 * 1000;    // 15分ごとに自動更新

/**
 * 予報リクエストの URL を組み立てる。
 * compact = true のときは hourly を 48 時間に絞って転送量を抑える。
 * forecast_hours に未対応の環境に備え、呼び出し側で compact なしの再試行を行う。
 */
function buildUrl(cities, compact) {
  const p = new URLSearchParams();
  p.set("latitude",  cities.map(c => c.lat).join(","));
  p.set("longitude", cities.map(c => c.lon).join(","));
  p.set("current", CURRENT_VARS.join(","));
  p.set("hourly",  HOURLY_VARS.join(","));
  p.set("daily",   DAILY_VARS.join(","));
  p.set("timezone", JST);
  p.set("forecast_days", String(FORECAST_DAYS));
  if (compact) p.set("forecast_hours", "48");
  return API + "?" + p.toString();
}

async function getJson(url, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || 15000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const json = await res.json();
    if (json && json.error) throw new Error(json.reason || "APIエラー");
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** API レスポンス 1 件 → 画面が使う形に正規化 */
function normalize(city, raw) {
  const cur = raw.current || {};
  const daily = raw.daily || {};
  const hourly = raw.hourly || {};
  const dTime = daily.time || [];

  const days = dTime.map((t, i) => ({
    date: t,
    code: pick(daily.weather_code, i),
    hi: pick(daily.temperature_2m_max, i),
    lo: pick(daily.temperature_2m_min, i),
    pop: pick(daily.precipitation_probability_max, i),
    precip: pick(daily.precipitation_sum, i),
    feelsHi: pick(daily.apparent_temperature_max, i),
    feelsLo: pick(daily.apparent_temperature_min, i),
    sunrise: pick(daily.sunrise, i),
    sunset: pick(daily.sunset, i),
    wind: pick(daily.wind_speed_10m_max, i),
    windDeg: pick(daily.wind_direction_10m_dominant, i),
    precipHours: pick(daily.precipitation_hours, i),
    uv: pick(daily.uv_index_max, i),
    sunshine: pick(daily.sunshine_duration, i)
  }));

  const hTime = hourly.time || [];
  const now = Date.now();
  let start = hTime.findIndex(t => { const d = parseLocal(t); return d && d.getTime() >= now - 60 * 60 * 1000; });
  if (start < 0) start = 0;
  const hours = [];
  for (let i = start; i < Math.min(hTime.length, start + 48); i++) {
    hours.push(normalizeHour(hourly, i));
  }

  return {
    cityId: city.id,
    elevation: raw.elevation,
    now: {
      temp: cur.temperature_2m,
      feels: cur.apparent_temperature,
      humidity: cur.relative_humidity_2m,
      precip: cur.precipitation,
      code: cur.weather_code,
      wind: cur.wind_speed_10m,
      windDeg: cur.wind_direction_10m,
      pressure: cur.pressure_msl,
      cloud: cur.cloud_cover,
      isDay: cur.is_day,
      time: cur.time
    },
    today: days[0] || null,
    days: days,
    hours: hours,
    fetchedAt: Date.now()
  };
}
function pick(arr, i) { return Array.isArray(arr) && arr[i] !== undefined ? arr[i] : null; }

/** hourly レスポンスの i 番目を 1 時間分のオブジェクトにする */
function normalizeHour(hourly, i) {
  return {
    time: (hourly.time || [])[i],
    temp: pick(hourly.temperature_2m, i),
    feels: pick(hourly.apparent_temperature, i),
    humidity: pick(hourly.relative_humidity_2m, i),
    pop: pick(hourly.precipitation_probability, i),
    precip: pick(hourly.precipitation, i),
    code: pick(hourly.weather_code, i),
    wind: pick(hourly.wind_speed_10m, i),
    windDeg: pick(hourly.wind_direction_10m, i),
    pressure: pick(hourly.pressure_msl, i),
    cloud: pick(hourly.cloud_cover, i)
  };
}

let useCompact = true;   // forecast_hours が使えないと判明したら false に落とす

async function fetchCities(cities) {
  if (!cities.length) return;
  let list = null;
  try {
    const raw = await getJson(buildUrl(cities, useCompact), 25000);
    list = Array.isArray(raw) ? raw : [raw];
  } catch (e) {
    if (useCompact) {
      // forecast_hours 非対応の可能性 → パラメータを外して一度だけ再試行
      useCompact = false;
      try {
        const raw = await getJson(buildUrl(cities, false), 25000);
        list = Array.isArray(raw) ? raw : [raw];
      } catch (e2) { list = null; }
    } else {
      list = null;   // まとめ取得が失敗 → 個別取得へ
    }
  }

  if (list && list.length === cities.length) {
    cities.forEach((c, i) => {
      try {
        state.data.set(c.id, normalize(c, list[i]));
        state.errors.delete(c.id);
      } catch (e) {
        state.errors.set(c.id, "データの解析に失敗しました");
      }
    });
    return;
  }

  // フォールバック: 5 件ずつ並行で個別取得
  for (let i = 0; i < cities.length; i += 5) {
    const chunk = cities.slice(i, i + 5);
    await Promise.all(chunk.map(async c => {
      try {
        const raw = await getJson(buildUrl([c], useCompact), 15000);
        state.data.set(c.id, normalize(c, Array.isArray(raw) ? raw[0] : raw));
        state.errors.delete(c.id);
      } catch (e) {
        state.errors.set(c.id, e.name === "AbortError" ? "取得がタイムアウトしました" : "取得に失敗しました");
      }
    }));
  }
}

function saveCache() {
  try {
    const obj = {};
    state.data.forEach((v, k) => { obj[k] = v; });
    localStorage.setItem(CACHE_KEY, JSON.stringify({ at: Date.now(), data: obj }));
  } catch (e) { /* 容量超過などは無視 */ }
}
function loadCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return false;
    const c = JSON.parse(raw);
    if (!c || !c.data || Date.now() - c.at > CACHE_TTL_MS) return false;
    Object.keys(c.data).forEach(k => { if (CITY_BY_ID.has(k)) state.data.set(k, c.data[k]); });
    state.fetchedAt = c.at;
    return state.data.size > 0;
  } catch (e) { return false; }
}

async function refresh(showBusy) {
  if (state.loading) return;
  state.loading = true;
  const btn = $("#refreshBtn");
  btn.setAttribute("aria-busy", "true");
  btn.disabled = true;
  if (showBusy) render();
  try {
    await Promise.all([
      fetchCities(state.selected.map(id => CITY_BY_ID.get(id)).filter(Boolean)),
      refreshAlerts()
    ]);
    state.fetchedAt = Date.now();
    saveCache();
  } finally {
    state.loading = false;
    btn.removeAttribute("aria-busy");
    btn.disabled = false;
    render();
    showBanner();
  }
}

function showBanner() {
  const el = $("#banner");
  const failed = state.selected.filter(id => state.errors.has(id));
  if (!failed.length) {
    if (state.alertFallback) {
      el.hidden = false;
      el.innerHTML = '気象庁の警報・注意報を取得できなかった地点があります。'
        + 'その地点では<strong>予報値から判定したアプリ独自の目安</strong>を表示しています'
        + '（気象庁の発表とは基準が異なります）。';
      return;
    }
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const names = failed.map(id => CITY_BY_ID.get(id).name).join("・");
  el.innerHTML = failed.length === state.selected.length
    ? '<strong>天気データを取得できませんでした。</strong>ネットワーク接続を確認して「更新」をお試しください。'
      + '（オフライン時は直近3時間以内に取得した内容があれば表示されます）'
    : esc(names) + ' のデータを取得できませんでした。他の地点は最新の内容です。';
}

/* ============================================================
 * 5b. 気象警報・注意報
 *   一次ソース: 気象庁 防災情報 JSON
 *     https://www.jma.go.jp/bosai/warning/data/warning/{府県予報区コード}.json
 *   ※ 気象庁が公式に API として提供しているものではなく、仕様変更や CORS 制限で
 *      取得できないことがある。その場合は予報値から判定する独自の目安
 *      （下記 deriveAlerts）に自動でフォールバックし、画面上で出典を区別して示す。
 * ============================================================ */
const JMA_WARNING_URL = "https://www.jma.go.jp/bosai/warning/data/warning/";
const JMA_AREA_URL = "https://www.jma.go.jp/bosai/common/const/area.json";

/** 気象警報・注意報コード（気象庁の防災情報 XML/JSON で用いられる番号） */
const JMA_WARNING_NAMES = {
  "02": "暴風雪警報", "03": "大雨警報", "04": "洪水警報", "05": "暴風警報",
  "06": "大雪警報", "07": "波浪警報", "08": "高潮警報",
  "10": "大雨注意報", "12": "大雪注意報", "13": "風雪注意報", "14": "雷注意報",
  "15": "強風注意報", "16": "波浪注意報", "17": "融雪注意報", "18": "洪水注意報",
  "19": "高潮注意報", "20": "濃霧注意報", "21": "乾燥注意報", "22": "なだれ注意報",
  "23": "低温注意報", "24": "霜注意報", "25": "着氷注意報", "26": "着雪注意報",
  "27": "その他の注意報",
  "32": "暴風雪特別警報", "33": "大雨特別警報", "35": "暴風特別警報",
  "36": "大雪特別警報", "37": "波浪特別警報", "38": "高潮特別警報"
};
/** 深刻度: 3=特別警報 / 2=警報 / 1=注意報 / 0=なし */
function warningSeverity(name) {
  if (!name) return 0;
  if (name.indexOf("特別警報") >= 0) return 3;
  if (name.indexOf("警報") >= 0) return 2;
  if (name.indexOf("注意報") >= 0) return 1;
  return 0;
}
const SEVERITY_STYLE = {
  3: { label: "特別警報", cls: "sev-3" },
  2: { label: "警報",     cls: "sev-2" },
  1: { label: "注意報",   cls: "sev-1" },
  0: { label: "",         cls: "" }
};

let jmaAreaNames = null;        // 区域コード -> 区域名
const jmaCache = new Map();     // 府県予報区コード -> { at, alerts }
const JMA_TTL_MS = 10 * 60 * 1000;

async function loadJmaAreaNames() {
  if (jmaAreaNames) return jmaAreaNames;
  try {
    const cached = sessionStorage.getItem("soranarabe.jmaArea");
    if (cached) { jmaAreaNames = JSON.parse(cached); return jmaAreaNames; }
  } catch (e) { /* 取得できなければ後段でフェッチ */ }
  const json = await getJson(JMA_AREA_URL, 12000);
  const map = {};
  ["centers", "offices", "class10s", "class15s", "class20s"].forEach(k => {
    const group = json[k];
    if (!group) return;
    Object.keys(group).forEach(code => { if (group[code] && group[code].name) map[code] = group[code].name; });
  });
  jmaAreaNames = map;
  try { sessionStorage.setItem("soranarabe.jmaArea", JSON.stringify(map)); } catch (e) { /* 保存できなくても可 */ }
  return map;
}

/** 府県予報区単位で、発表中の警報・注意報を区域名つきで取り出す */
async function fetchJmaWarnings(prefCode) {
  const hit = jmaCache.get(prefCode);
  if (hit && Date.now() - hit.at < JMA_TTL_MS) return hit.alerts;

  const names = await loadJmaAreaNames().catch(() => ({}));
  const json = await getJson(JMA_WARNING_URL + prefCode + ".json", 12000);

  const byArea = new Map();
  (json.areaTypes || []).forEach(type => {
    (type.areas || []).forEach(area => {
      (area.warnings || []).forEach(w => {
        // status が「解除」「発表警報・注意報はなし」のものは発表中ではない
        if (w.status && (w.status.indexOf("解除") >= 0 || w.status.indexOf("なし") >= 0)) return;
        const name = JMA_WARNING_NAMES[w.code];
        if (!name) return;
        const areaName = names[area.code] || "";
        const key = areaName || area.code;
        if (!byArea.has(key)) byArea.set(key, { area: areaName, items: [] });
        const bucket = byArea.get(key);
        if (bucket.items.indexOf(name) < 0) bucket.items.push(name);
      });
    });
  });

  const alerts = {
    source: "jma",
    office: json.publishingOffice || "気象庁",
    reportedAt: json.reportDatetime || null,
    headline: json.headlineText || "",
    areas: Array.from(byArea.values())
             .map(a => ({ area: a.area, items: a.items,
                          severity: Math.max.apply(null, a.items.map(warningSeverity).concat([0])) }))
             .sort((a, b) => b.severity - a.severity),
    severity: 0
  };
  alerts.severity = alerts.areas.reduce((m, a) => Math.max(m, a.severity), 0);
  jmaCache.set(prefCode, { at: Date.now(), alerts: alerts });
  return alerts;
}

/**
 * 予報値からの独自判定（気象庁の警報ではない）。
 * 気象庁 JSON を取得できないときのフォールバックとして使う。
 * しきい値は一般的な注意喚起の目安であり、気象庁の発表基準とは一致しない。
 */
function deriveAlerts(d) {
  if (!d || !d.today) return { source: "derived", areas: [], severity: 0 };
  const t = d.today, n = d.now, items = [];
  const precip = typeof t.precip === "number" ? t.precip : 0;
  const wind = Math.max(typeof t.wind === "number" ? t.wind : 0, typeof n.wind === "number" ? n.wind : 0);

  if (precip >= 50) items.push({ name: "大雨に警戒（24時間 " + Math.round(precip) + "mm 予想）", sev: 2 });
  else if (precip >= 20) items.push({ name: "強い雨に注意（24時間 " + Math.round(precip) + "mm 予想）", sev: 1 });
  if (wind >= 60) items.push({ name: "暴風に警戒（最大 " + Math.round(wind) + "km/h）", sev: 2 });
  else if (wind >= 35) items.push({ name: "強風に注意（最大 " + Math.round(wind) + "km/h）", sev: 1 });
  if (typeof t.hi === "number") {
    if (t.hi >= 35) items.push({ name: "危険な暑さ・熱中症に警戒（最高 " + Math.round(t.hi) + "℃）", sev: 2 });
    else if (t.hi >= 33) items.push({ name: "熱中症に注意（最高 " + Math.round(t.hi) + "℃）", sev: 1 });
  }
  if (typeof t.lo === "number" && t.lo <= -5) items.push({ name: "厳しい冷え込みに注意（最低 " + Math.round(t.lo) + "℃）", sev: 1 });
  const snowy = [71, 73, 75, 77, 85, 86].indexOf(t.code) >= 0;
  if (snowy && precip >= 10) items.push({ name: "積雪・路面凍結に注意", sev: 1 });
  if ([95, 96, 99].indexOf(t.code) >= 0) items.push({ name: "雷雨に注意", sev: 1 });
  if (typeof t.uv === "number" && t.uv >= 8) items.push({ name: "強い紫外線に注意（UV指数 " + t.uv.toFixed(1) + "）", sev: 1 });

  const severity = items.reduce((m, i) => Math.max(m, i.sev), 0);
  return {
    source: "derived",
    areas: items.length ? [{ area: "", items: items.map(i => i.name), severity: severity }] : [],
    severity: severity
  };
}

/** 表示中の地点について警報を取りにいく（失敗した府県は独自判定に落とす） */
async function refreshAlerts() {
  const prefs = new Set();
  state.selected.forEach(id => {
    const c = CITY_BY_ID.get(id);
    if (c && c.jma) prefs.add(c.jma);
  });
  await Promise.all(Array.from(prefs).map(async code => {
    try {
      state.alerts.set(code, await fetchJmaWarnings(code));
      state.alertFallback = false;
    } catch (e) {
      state.alerts.delete(code);
      state.alertFallback = true;   // 1件でも失敗したら注記を出す
    }
  }));
}

/**
 * 地点に対応する警報情報（気象庁 → 取れなければ独自判定）。
 * jmaArea（一次細分区域名）が一致する区域があればその区域だけに絞り込み、
 * 一致しなければ府県予報区全体の発表状況をそのまま返す。
 */
function alertsFor(cityId) {
  const c = CITY_BY_ID.get(cityId);
  if (!c || !c.jma || !state.alerts.has(c.jma)) return deriveAlerts(state.data.get(cityId));
  const pref = state.alerts.get(c.jma);
  if (!c.jmaArea) return pref;
  const mine = pref.areas.filter(a => a.area === c.jmaArea);
  if (!mine.length) return pref;   // 区域名が一致しなければ府県全体にフォールバック
  return {
    source: pref.source, office: pref.office, reportedAt: pref.reportedAt, headline: pref.headline,
    areas: mine, scoped: true,
    severity: mine.reduce((m, a) => Math.max(m, a.severity), 0)
  };
}

/* ============================================================
 * 5c. おすすめの服装・傘の判断
 *   数値予報から機械的に導く目安。個人差・用途差があるため断定はしない。
 * ============================================================ */
const UMBRELLA = [
  { min: 70, level: "need",  label: "傘は必須",         note: "しっかりした雨傘を持って出かけてください。" },
  { min: 50, level: "need",  label: "傘を持って",       note: "日中に雨に当たる可能性が高い時間帯があります。" },
  { min: 30, level: "maybe", label: "折りたたみ傘を",   note: "急な雨に備えて折りたたみがあると安心です。" },
  { min: 0,  level: "no",    label: "傘はいりません",   note: "まとまった雨の心配は小さい見込みです。" }
];

function umbrellaAdvice(day) {
  if (!day) return null;
  const pop = typeof day.pop === "number" ? day.pop : 0;
  const precip = typeof day.precip === "number" ? day.precip : 0;
  const wind = typeof day.wind === "number" ? day.wind : 0;
  let a = UMBRELLA.find(u => pop >= u.min) || UMBRELLA[UMBRELLA.length - 1];
  if (precip >= 10 && a.level !== "need") a = UMBRELLA[1];
  const out = { level: a.level, label: a.label, note: a.note, pop: pop };
  if (wind >= 40 && a.level !== "no") {
    out.label = "傘より雨具を";
    out.note = "風が強く傘が壊れやすい見込みです。レインウェアやフード付きの上着が安全です。";
  }
  const snowy = [71, 73, 75, 77, 85, 86].indexOf(day.code) >= 0;
  if (snowy && a.level !== "no") {
    out.label = "雪に備えて";
    out.note = "雪の予想です。傘よりも防水の上着と滑りにくい靴が役立ちます。";
  }
  return out;
}

/** 体感の最高・最低を優先して服装を決める */
const CLOTHES = [
  { min: 30, emoji: "🥵", title: "半袖・通気性のよい服",   detail: "麻やドライ素材など風を通すものを。日差し対策と水分補給を忘れずに。" },
  { min: 25, emoji: "😎", title: "半袖シャツ",             detail: "屋内の冷房が強い場所に行くなら薄手の羽織りものを1枚。" },
  { min: 20, emoji: "🙂", title: "長袖シャツ・薄手のニット", detail: "動くと汗ばむ陽気。重ね着で調節できる服装が快適です。" },
  { min: 16, emoji: "🧥", title: "薄手のジャケット・カーディガン", detail: "朝晩はひんやりします。羽織りものを1枚足すとちょうどよい体感です。" },
  { min: 12, emoji: "🧥", title: "ジャケット・厚手のニット", detail: "風があると体感はさらに下がります。首元を覆えるものがあると安心。" },
  { min: 8,  emoji: "🧣", title: "コート・セーター",         detail: "本格的な冬支度。手袋やマフラーがあると快適に過ごせます。" },
  { min: 3,  emoji: "🧣", title: "厚手のコート・マフラー",   detail: "冷え込みます。インナーダウンやヒートテックなどの重ね着を。" },
  { min: -99, emoji: "❄️", title: "ダウン・手袋・マフラー",  detail: "厳しい寒さ。耳や指先まで覆える防寒と、滑りにくい靴を。" }
];

function clothingAdvice(day, now) {
  if (!day) return null;
  const hi = typeof day.feelsHi === "number" ? day.feelsHi : day.hi;
  const lo = typeof day.feelsLo === "number" ? day.feelsLo : day.lo;
  if (typeof hi !== "number") return null;
  const base = CLOTHES.find(c => hi >= c.min) || CLOTHES[CLOTHES.length - 1];
  const tips = [];
  if (typeof lo === "number" && hi - lo >= 10) {
    tips.push("日中と朝晩の体感差が" + Math.round(hi - lo) + "℃あります。脱ぎ着しやすい重ね着が安心です。");
  }
  if (typeof day.wind === "number" && day.wind >= 30) tips.push("風が強め。防風性のある上着が快適です。");
  if (typeof day.uv === "number" && day.uv >= 6) tips.push("紫外線が強めです。帽子や日焼け止めを。");
  if (typeof day.pop === "number" && day.pop >= 50) tips.push("濡れても乾きやすい素材や、防水の靴が役立ちます。");
  if (now && typeof now.humidity === "number" && now.humidity >= 80 && hi >= 25) tips.push("湿度が高く蒸し暑く感じられます。");
  return { emoji: base.emoji, title: base.title, detail: base.detail, tips: tips, hi: hi, lo: lo };
}

/* ============================================================
 * 5d. 生活指数
 *   市販の天気アプリが載せている指数にあわせた目安。数値予報から機械的に
 *   導いているだけで、気象庁や各社が発表している指数そのものではない。
 * ============================================================ */

/** 日中（6〜18時）の時間ごとの値の平均 */
function dayMean(hours, key) {
  const vals = (hours || []).filter(h => {
    const t = parseLocal(h.time);
    return t && t.getHours() >= 6 && t.getHours() < 18 && typeof h[key] === "number";
  }).map(h => h[key]);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
/** 夜間（18時〜翌6時）の時間ごとの値の平均 */
function nightMean(hours, key) {
  const vals = (hours || []).filter(h => {
    const t = parseLocal(h.time);
    return t && (t.getHours() >= 18 || t.getHours() < 6) && typeof h[key] === "number";
  }).map(h => h[key]);
  if (!vals.length) return null;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

/** 洗濯指数 — 外干しで乾くか */
function laundryIndex(day, hours) {
  if (!day) return null;
  const pop = typeof day.pop === "number" ? day.pop : 0;
  const precip = typeof day.precip === "number" ? day.precip : 0;
  if (pop >= 50 || precip >= 1) {
    return { level: "bad", score: 1, title: "部屋干しで", detail: "日中に雨の可能性が高い見込みです。外に干すなら軒下などに。" };
  }
  const hum = dayMean(hours, "humidity");
  const temp = typeof day.hi === "number" ? day.hi : 15;
  const wind = typeof day.wind === "number" ? day.wind : 0;
  // 気温が高い・湿度が低い・風がある ほど乾きやすい
  let score = 0;
  score += temp >= 25 ? 3 : temp >= 18 ? 2 : temp >= 10 ? 1 : 0;
  score += hum === null ? 1 : hum <= 50 ? 3 : hum <= 65 ? 2 : hum <= 80 ? 1 : 0;
  score += wind >= 20 ? 2 : wind >= 10 ? 1 : 0;
  if (pop >= 30) score -= 1;
  if (score >= 6) return { level: "great", score: 5, title: "よく乾く", detail: "気温・湿度・風のそろった洗濯日和です。厚手のものもおすすめ。" };
  if (score >= 4) return { level: "good",  score: 4, title: "まあまあ乾く", detail: "ふつうに外干しできます。厚手のものは時間がかかるかもしれません。" };
  if (score >= 2) return { level: "soso",  score: 3, title: "乾きにくい", detail: "乾きは遅めです。薄手のものを中心に、間隔をあけて干すと乾きやすくなります。" };
  return { level: "bad", score: 2, title: "外干しは不向き", detail: "気温が低く湿りがちです。室内干しや乾燥機のほうが確実です。" };
}

/** 紫外線指数 — WHO の UV インデックス区分にあわせた対策の目安 */
function uvIndex(day) {
  if (!day || typeof day.uv !== "number") return null;
  const uv = day.uv;
  const band =
    uv >= 11 ? { level: "bad",  title: "極端に強い", detail: "日中の外出は控えめに。日陰・長袖・帽子・日焼け止めをすべて。" } :
    uv >= 8  ? { level: "bad",  title: "非常に強い", detail: "日焼け止めと帽子は必須。10〜14時の外出はできるだけ日陰で。" } :
    uv >= 6  ? { level: "soso", title: "強い",       detail: "日焼け止めを。長時間の外出では帽子やサングラスもあると安心です。" } :
    uv >= 3  ? { level: "good", title: "中程度",     detail: "長時間外にいるなら日焼け止めがあるとよい程度です。" } :
               { level: "great", title: "弱い",      detail: "特別な対策は要りません。" };
  return { level: band.level, title: band.title, detail: band.detail, value: uv.toFixed(1) };
}

/** 星空指数 — 夜間の雲量から */
function starIndex(day, hours) {
  const cloud = nightMean(hours, "cloud");
  if (cloud === null) return null;
  const pop = typeof day.pop === "number" ? day.pop : 0;
  if (pop >= 50 || cloud >= 80) return { level: "bad",   title: "期待できない", detail: "夜は雲が広がる見込みです。", value: Math.round(cloud) + "%" };
  if (cloud >= 55)              return { level: "soso",  title: "雲が多め",     detail: "雲の切れ間からなら見えるかもしれません。", value: Math.round(cloud) + "%" };
  if (cloud >= 25)              return { level: "good",  title: "まずまず",     detail: "ところどころ雲はありますが、星は見えそうです。", value: Math.round(cloud) + "%" };
  return { level: "great", title: "よく見える", detail: "夜はよく晴れる見込みです。明かりの少ない場所ならなお良く見えます。", value: Math.round(cloud) + "%" };
}

/**
 * 熱中症の注意レベル — 体感温度と湿度からの目安。
 * 環境省が発表する暑さ指数（WBGT）とは算出方法が異なるため、代用はできない。
 */
function heatIndex(day, hours) {
  const feels = typeof day.feelsHi === "number" ? day.feelsHi : day.hi;
  if (typeof feels !== "number" || feels < 24) return null;
  const hum = dayMean(hours, "humidity");
  const adj = feels + (hum !== null && hum >= 70 ? 1.5 : 0);
  if (adj >= 35) return { level: "bad",  title: "危険",     detail: "運動は原則中止。外出はできるだけ避け、冷房のある室内で過ごしてください。", value: Math.round(feels) + "°" };
  if (adj >= 31) return { level: "bad",  title: "厳重警戒", detail: "外出時は炎天下を避け、こまめに休憩と水分・塩分を。", value: Math.round(feels) + "°" };
  if (adj >= 28) return { level: "soso", title: "警戒",     detail: "運動や作業では定期的に休憩を。のどが渇く前の水分補給を。", value: Math.round(feels) + "°" };
  return { level: "good", title: "注意", detail: "激しい運動では水分補給を忘れずに。", value: Math.round(feels) + "°" };
}

/** 乾燥指数 — 湿度と気温から */
function dryIndex(day, hours) {
  const hum = dayMean(hours, "humidity");
  if (hum === null) return null;
  if (hum <= 35) return { level: "bad",  title: "とても乾燥", detail: "のどや肌が乾きやすく、火の取り扱いにも注意が必要です。加湿を。", value: Math.round(hum) + "%" };
  if (hum <= 50) return { level: "soso", title: "やや乾燥",   detail: "加湿や保湿があると快適に過ごせます。", value: Math.round(hum) + "%" };
  if (hum >= 85) return { level: "soso", title: "蒸し蒸し",   detail: "湿度が高く、洗濯物や食品の傷みに注意。", value: Math.round(hum) + "%" };
  return { level: "great", title: "ちょうどよい", detail: "湿度は過ごしやすい範囲です。", value: Math.round(hum) + "%" };
}

/** その日の生活指数をまとめて返す */
function lifeIndices(day, hours) {
  return [
    { key: "laundry", cap: "洗濯",   emoji: "👕", data: laundryIndex(day, hours) },
    { key: "uv",      cap: "紫外線", emoji: "🧴", data: uvIndex(day) },
    { key: "heat",    cap: "熱中症", emoji: "🥵", data: heatIndex(day, hours) },
    { key: "dry",     cap: "乾燥",   emoji: "💧", data: dryIndex(day, hours) },
    { key: "star",    cap: "星空",   emoji: "✨", data: starIndex(day, hours) }
  ].filter(x => x.data);
}

/* ============================================================
 * 5e. 大気質（Open-Meteo Air Quality API / APIキー不要）
 *   PM2.5・PM10・オゾン・二酸化窒素・黄砂（dust）と US AQI を取得する。
 *   花粉は CAMS のヨーロッパ域のみの提供で、日本のスギ・ヒノキは対象外のため
 *   意図的に扱わない（表示すると誤った情報になる）。
 * ============================================================ */
const AIR_API = "https://air-quality-api.open-meteo.com/v1/air-quality";
const AIR_VARS = ["pm2_5", "pm10", "ozone", "nitrogen_dioxide", "sulphur_dioxide",
                  "carbon_monoxide", "dust", "us_aqi"];
const airCache = new Map();     // cityId -> { at, data }
const AIR_TTL_MS = 60 * 60 * 1000;

/** US AQI を区分に落とす（米国 EPA の基準） */
function aqiBand(aqi) {
  if (typeof aqi !== "number") return null;
  if (aqi <= 50)  return { level: "great", label: "良い",             detail: "大気の状態は良好です。" };
  if (aqi <= 100) return { level: "good",  label: "普通",             detail: "ごく一部の敏感な人は注意してください。" };
  if (aqi <= 150) return { level: "soso",  label: "敏感な人に不健康", detail: "呼吸器が弱い方・子ども・高齢者は長時間の屋外活動を控えめに。" };
  if (aqi <= 200) return { level: "bad",   label: "健康に良くない",   detail: "屋外での激しい運動は避け、換気の方法に気をつけてください。" };
  if (aqi <= 300) return { level: "bad",   label: "非常に不健康",     detail: "屋外活動は控えてください。マスクや空気清浄機の使用を。" };
  return { level: "bad", label: "危険", detail: "屋外活動は避けてください。" };
}

/** PM2.5 の濃度を日本の環境基準（日平均 35μg/m³）と見比べた目安 */
function pm25Band(v) {
  if (typeof v !== "number") return null;
  if (v <= 15) return { level: "great", label: "少ない" };
  if (v <= 35) return { level: "good",  label: "やや多い" };
  if (v <= 70) return { level: "soso",  label: "多い" };
  return { level: "bad", label: "非常に多い" };
}

async function fetchAirQuality(city) {
  const hit = airCache.get(city.id);
  if (hit && Date.now() - hit.at < AIR_TTL_MS) return hit.data;
  const p = new URLSearchParams();
  p.set("latitude", String(city.lat));
  p.set("longitude", String(city.lon));
  p.set("current", AIR_VARS.join(","));
  p.set("hourly", "pm2_5");
  p.set("timezone", JST);
  p.set("forecast_days", "2");
  const raw = await getJson(AIR_API + "?" + p.toString(), 15000);
  const json = Array.isArray(raw) ? raw[0] : raw;
  const cur = (json && json.current) || {};
  const hourly = (json && json.hourly) || {};
  const data = {
    time: cur.time,
    pm25: cur.pm2_5,
    pm10: cur.pm10,
    ozone: cur.ozone,
    no2: cur.nitrogen_dioxide,
    so2: cur.sulphur_dioxide,
    co: cur.carbon_monoxide,
    dust: cur.dust,
    aqi: cur.us_aqi,
    series: (hourly.time || []).map((t, i) => ({ time: t, pm25: pick(hourly.pm2_5, i) }))
  };
  airCache.set(city.id, { at: Date.now(), data: data });
  return data;
}

/* ============================================================
 * 6. 描画
 * ============================================================ */
function $(sel, root) { return (root || document).querySelector(sel); }

function orderedCities() {
  const cities = state.selected.map(id => CITY_BY_ID.get(id)).filter(Boolean);
  const val = (c, key) => {
    const d = state.data.get(c.id);
    if (!d) return null;
    if (key === "temp") return d.now.temp;
    if (key === "pop") return d.today ? d.today.pop : null;
    return null;
  };
  const cmpNum = (a, b, key, dir) => {
    const va = val(a, key), vb = val(b, key);
    if (va === null && vb === null) return 0;
    if (va === null) return 1;
    if (vb === null) return -1;
    return (va - vb) * dir;
  };
  switch (state.sort) {
    case "temp-desc": return cities.slice().sort((a, b) => cmpNum(a, b, "temp", -1));
    case "temp-asc":  return cities.slice().sort((a, b) => cmpNum(a, b, "temp", 1));
    case "pop-desc":  return cities.slice().sort((a, b) => cmpNum(a, b, "pop", -1));
    case "name":      return cities.slice().sort((a, b) => a.name.localeCompare(b.name, "ja"));
    default: {
      const rank = c => {
        if (c.id === CURRENT_LOCATION_ID) return -1;   // 現在地は常に先頭
        const i = CITIES.indexOf(c);
        return i < 0 ? CITIES.length + state.custom.findIndex(x => x.id === c.id) : i;
      };
      return cities.slice().sort((a, b) => rank(a) - rank(b));
    }
  }
}

function cardHtml(city) {
  const d = state.data.get(city.id);
  const err = state.errors.get(city.id);
  const pinned = state.pinned.includes(city.id);
  const w = d ? wmo(d.now.code) : WMO_UNKNOWN;
  const sky = 'style="background:linear-gradient(90deg,' + w.sky[0] + ',' + w.sky[1] + ')"';

  const pinBtn =
    '<button type="button" class="card-pin" data-pin="' + esc(city.id) + '" aria-pressed="' + pinned + '"'
    + ' title="' + (pinned ? "主要地点から外す" : "主要地点に入れる") + '"'
    + ' aria-label="' + esc(city.name) + 'を主要地点に' + (pinned ? "しない" : "する") + '">'
    + '<svg viewBox="0 0 24 24" fill="' + (pinned ? "currentColor" : "none") + '" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round">'
    + '<path d="M12 3.4l2.6 5.3 5.9.9-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.6l5.9-.9z"/></svg></button>';

  if (!d) {
    // データが無い間もカードは開ける。取得が終われば詳細パネルの中身は自動で差し替わる。
    const body = err
      ? '<div class="card-error">' + esc(err) + '</div>'
      : '<div class="card-main"><span class="card-temp skeleton">00</span></div><div class="card-range skeleton">読込中</div>';
    return '<div class="card' + (err ? " is-error" : " is-loading") + '">' + pinBtn
      + '<div class="card-sky" ' + sky + '></div>'
      + '<button type="button" class="card-open" data-open="' + esc(city.id) + '" '
      + 'style="all:unset;display:block;cursor:pointer;width:100%" aria-label="' + esc(city.name) + 'の詳細を開く">'
      + '<div class="card-body">'
      + '<div class="card-top"><div class="card-city"><div class="card-name">' + esc(city.name) + '</div>'
      + '<div class="card-region">' + esc(city.sub) + '</div></div></div>' + body + '</div></button></div>';
  }

  const t = d.today || {};
  return '<div class="card">' + pinBtn
    + alertStrip(city.id)
    + '<div class="card-sky" ' + sky + '></div>'
    + '<button type="button" class="card-open" data-open="' + esc(city.id) + '" '
    + 'style="all:unset;display:block;cursor:pointer;width:100%" aria-label="' + esc(city.name) + 'の詳細を開く">'
    + '<div class="card-body">'
    +   '<div class="card-top">'
    +     '<div class="card-city"><div class="card-name">' + esc(city.name) + '</div>'
    +     '<div class="card-region">' + esc(city.sub) + '</div></div>'
    +   '</div>'
    +   '<div class="card-main"><span class="card-temp tnum">' + fmtTemp(d.now.temp)
    +     '<span class="unit">' + unitLabel() + '</span></span>'
    +     '<span class="card-desc">' + esc(w.label) + '</span>'
    +     '<span class="card-icon">' + icon(w.icon, 48) + '</span></div>'
    +   '<div class="card-range tnum"><span class="hi">最高 ' + fmtTemp(t.hi) + '°</span>'
    +     '<span class="sep">/</span><span class="lo">最低 ' + fmtTemp(t.lo) + '°</span></div>'
    +   '<dl class="card-metrics tnum">'
    +     '<div class="metric"><dt>降水確率</dt><dd>' + fmtNum(t.pop, "%") + '</dd></div>'
    +     '<div class="metric"><dt>湿度</dt><dd>' + fmtNum(d.now.humidity, "%") + '</dd></div>'
    +     '<div class="metric"><dt>風</dt><dd>' + fmtNum(d.now.wind) + '<span style="font-size:10px"> km/h</span></dd></div>'
    +   '</dl>'
    +   adviceRow(d)
    +   '<div class="card-spark">' + sparkline(d.hours.slice(0, 24)) + '</div>'
    + '</div></button></div>';
}

/** 警報情報から重複のない名称一覧を作る */
function uniqueAlertNames(a) {
  const names = [];
  (a.areas || []).forEach(ar => ar.items.forEach(i => { if (names.indexOf(i) < 0) names.push(i); }));
  return names;
}

const UMBRELLA_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" '
  + 'stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v1.2"/><path d="M3 12.6a9 9 0 0 1 18 0Z"/>'
  + '<path d="M12 12.6v6.2a2.2 2.2 0 0 1-4.4 0"/></svg>';

/** カード上端の警報バッジ */
function alertStrip(cityId) {
  const a = alertsFor(cityId);
  if (!a || !a.severity) return "";
  const all = uniqueAlertNames(a);
  const shown = all.slice(0, 3);
  const style = SEVERITY_STYLE[a.severity];
  const src = a.source === "jma" ? "気象庁" : "目安";
  return '<div class="alert-strip ' + style.cls + '">'
    + '<span>⚠ ' + esc(shown.join("・")) + (all.length > shown.length ? " ほか" : "") + '</span>'
    + '<span class="src">' + src + '</span></div>';
}

/** カード下部の「傘」「服装」一行サマリー */
function adviceRow(d) {
  const u = umbrellaAdvice(d.today);
  const w = clothingAdvice(d.today, d.now);
  if (!u && !w) return "";
  return '<div class="advice-row">'
    + (u ? '<span class="umb ' + u.level + '">' + UMBRELLA_ICON + esc(u.label) + '</span>' : "")
    + (w ? '<span class="wear">' + esc(w.emoji + " " + w.title) + '</span>' : "")
    + '</div>';
}

/** カード下部の 24 時間気温スパークライン */
function sparkline(hours) {
  const pts = hours.filter(h => typeof h.temp === "number");
  if (pts.length < 2) return "";
  const W = 240, H = 34, pad = 4;
  const temps = pts.map(p => p.temp);
  const min = Math.min.apply(null, temps), max = Math.max.apply(null, temps);
  const span = (max - min) || 1;
  const x = i => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = v => H - pad - ((v - min) / span) * (H - pad * 2 - 6);
  const line = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.temp).toFixed(1)).join(" ");
  const area = line + " L" + x(pts.length - 1).toFixed(1) + " " + H + " L" + x(0).toFixed(1) + " " + H + " Z";
  const gid = "g" + Math.random().toString(36).slice(2, 8);
  return '<svg viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" aria-hidden="true">'
    + '<defs><linearGradient id="' + gid + '" x1="0" y1="0" x2="0" y2="1">'
    + '<stop offset="0%" stop-color="var(--accent)" stop-opacity=".28"/>'
    + '<stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>'
    + '<path d="' + area + '" fill="url(#' + gid + ')"/>'
    + '<path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="1.8" '
    + 'stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>';
}

function renderGrids() {
  const ordered = orderedCities();
  const pinned = ordered.filter(c => state.pinned.includes(c.id));
  const others = ordered.filter(c => !state.pinned.includes(c.id));
  $("#pinnedGrid").innerHTML = pinned.map(cardHtml).join("");
  $("#otherGrid").innerHTML = others.map(cardHtml).join("");
  $("#pinnedEmpty").hidden = pinned.length > 0;
  $("#otherEmpty").hidden = others.length > 0;
  $("#pinnedCount").textContent = pinned.length + " 地点";
  $("#otherCount").textContent = others.length + " 地点";
}

function renderTable() {
  const key = state.tableSort.key;
  let rows = orderedCities();
  if (key) {
    const dir = state.tableSort.dir;
    const get = c => {
      const d = state.data.get(c.id);
      if (!d) return null;
      if (key === "temp") return d.now.temp;
      if (key === "hi") return d.today ? d.today.hi : null;
      if (key === "lo") return d.today ? d.today.lo : null;
      if (key === "pop") return d.today ? d.today.pop : null;
      return null;
    };
    rows = rows.slice().sort((a, b) => {
      if (key === "name") return a.name.localeCompare(b.name, "ja") * dir;
      const va = get(a), vb = get(b);
      if (va === null && vb === null) return 0;
      if (va === null) return 1;
      if (vb === null) return -1;
      return (va - vb) * dir;
    });
  }
  $("#tableBody").innerHTML = rows.map(c => {
    const d = state.data.get(c.id);
    const pin = state.pinned.includes(c.id) ? '<span class="pin-dot">★</span>' : "";
    if (!d) {
      return '<tr data-open="' + c.id + '"><td class="name">' + pin + esc(c.name) + '</td>'
        + '<td colspan="10" style="color:var(--text-3)">' + esc(state.errors.get(c.id) || "読込中…") + '</td></tr>';
    }
    const w = wmo(d.now.code), t = d.today || {};
    return '<tr data-open="' + esc(c.id) + '" tabindex="0">'
      + '<td class="name">' + pin + esc(c.name) + ' <span style="color:var(--text-3);font-weight:400;font-size:12px">' + esc(c.sub) + '</span></td>'
      + '<td><span class="cond">' + icon(w.icon, 22) + esc(w.label) + '</span></td>'
      + '<td class="tnum">' + fmtTemp(d.now.temp, 1) + unitLabel() + '</td>'
      + '<td class="tnum hi">' + fmtTemp(t.hi) + '°</td>'
      + '<td class="tnum lo">' + fmtTemp(t.lo) + '°</td>'
      + '<td class="tnum">' + fmtNum(t.pop, "%") + '</td>'
      + '<td>' + umbrellaCell(d) + '</td>'
      + '<td>' + alertCell(c.id) + '</td>'
      + '<td class="tnum">' + fmtNum(d.now.humidity, "%") + '</td>'
      + '<td class="tnum">' + esc(windText(d.now.windDeg, d.now.wind)) + ' km/h</td>'
      + '<td class="tnum">' + fmtTemp(d.now.feels) + '°</td></tr>';
  }).join("");
}

function umbrellaCell(d) {
  const u = umbrellaAdvice(d.today);
  if (!u) return "—";
  return '<span class="umb ' + u.level + '" style="font-weight:600;font-size:12.5px">' + esc(u.label) + '</span>';
}
function alertCell(cityId) {
  const a = alertsFor(cityId);
  if (!a || !a.severity) return '<span style="color:var(--text-3)">—</span>';
  const all = uniqueAlertNames(a);
  const shown = all.slice(0, 2);
  return '<span class="alert-tag ' + SEVERITY_STYLE[a.severity].cls + '">'
    + esc(shown.join("・")) + (all.length > shown.length ? " ほか" : "") + '</span>';
}

/* ---- 地点の検索（Open-Meteo Geocoding API / APIキー不要）---- */
const GEOCODE_API = "https://geocoding-api.open-meteo.com/v1/search";
let searchSeq = 0;

async function searchPlaces(q) {
  const seq = ++searchSeq;
  const msg = $("#searchMsg"), box = $("#searchResults");
  box.innerHTML = "";
  msg.hidden = false;
  msg.textContent = "「" + q + "」を検索中…";
  const url = GEOCODE_API + "?name=" + encodeURIComponent(q) + "&count=10&language=ja&format=json";
  let results;
  try {
    const json = await getJson(url, 12000);
    results = ((json && Array.isArray(json.results)) ? json.results : []).filter(isValidGeoResult);
  } catch (e) {
    if (seq !== searchSeq) return;
    msg.textContent = "検索に失敗しました。ネットワーク接続を確認してもう一度お試しください。";
    return;
  }
  if (seq !== searchSeq) return;
  if (!results.length) {
    msg.textContent = "「" + q + "」に一致する地点が見つかりませんでした。別の表記（ひらがな・ローマ字・英語）もお試しください。";
    return;
  }
  msg.hidden = true;
  box.innerHTML = results.map(r => {
    const id = "geo:" + r.id;
    const already = state.selected.indexOf(id) >= 0;
    const meta = [r.admin1, r.admin2, r.country].filter(Boolean).join(" / ");
    return '<button type="button" class="search-result" data-add="' + esc(id) + '"'
      + ' data-name="' + esc(r.name) + '" data-lat="' + esc(r.latitude) + '" data-lon="' + esc(r.longitude) + '"'
      + ' data-sub="' + esc(r.admin1 || r.country || "") + '" data-country="' + esc(r.country_code || "") + '"'
      + (already ? " disabled" : "") + '>'
      + '<span><span class="rn">' + esc(r.name) + '</span> '
      + '<span class="rm">' + esc(meta) + '</span></span>'
      + '<span class="add">' + (already ? "追加済み" : "＋ 追加") + '</span></button>';
  }).join("");
}

/** 検索結果のボタンから地点を登録して表示に加える */
function addSearchedCity(btn) {
  const lat = parseFloat(btn.getAttribute("data-lat"));
  const lon = parseFloat(btn.getAttribute("data-lon"));
  if (!isFinite(lat) || !isFinite(lon)) return;
  const country = btn.getAttribute("data-country") || "";
  const city = {
    id: btn.getAttribute("data-add"),
    name: btn.getAttribute("data-name"),
    sub: btn.getAttribute("data-sub") || "",
    region: "追加した地点",
    lat: lat, lon: lon,
    // 日本国内の地点でも、任意地点は府県予報区を特定できないため気象庁の警報は引かない
    jma: null,
    country: country
  };
  if (!isValidCustomCity(city)) return;
  if (!CITY_BY_ID.has(city.id)) {
    registerCity(city);
    state.custom.push(city);
  }
  if (state.selected.indexOf(city.id) < 0) state.selected.push(city.id);
  saveState();
  $("#searchResults").innerHTML = "";
  $("#searchInput").value = "";
  $("#searchMsg").hidden = false;
  $("#searchMsg").textContent = city.name + " を追加しました。";
  render();
  refresh(false);
}

/* ---- 現在地の天気（Geolocation API）---- */

/** 2点間のおおよその距離（km） */
function distanceKm(aLat, aLon, bLat, bLon) {
  const R = 6371, toRad = d => d * Math.PI / 180;
  const dLat = toRad(bLat - aLat), dLon = toRad(bLon - aLon);
  const x = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

/** 内蔵地点のうち最も近いものを返す（地名の表示と府県予報区の特定に使う） */
function nearestCity(lat, lon) {
  let best = null, bestKm = Infinity;
  CITIES.forEach(c => {
    const km = distanceKm(lat, lon, c.lat, c.lon);
    if (km < bestKm) { bestKm = km; best = c; }
  });
  return { city: best, km: bestKm };
}

function geoStatus(msg) {
  const el = $("#searchMsg");
  if (!el) return;
  $("#picker").hidden = false;
  $("#pickerBtn").setAttribute("aria-expanded", "true");
  el.hidden = false;
  el.textContent = msg;
}

/** 現在地の座標から、表示名と気象警報に使う府県予報区を決める */
function currentLocationMeta(lat, lon) {
  const near = nearestCity(lat, lon);
  // 近くに内蔵地点があるときだけ、その府県予報区の警報を引く
  const useJma = !!near.city && near.km <= 100;
  return {
    name: "現在地",
    sub: near.city ? (near.km < 15 ? near.city.name + "付近" : near.city.name + "から約" + Math.round(near.km) + "km") : "",
    jma: useJma ? near.city.jma : null,
    jmaArea: useJma ? near.city.jmaArea : null,
    nearName: near.city ? near.city.name : "",
    isCurrent: true
  };
}

/**
 * 現在地を取得して一覧に加える。
 * opts.status(msg) で進捗の出し先を、opts.done(city) で取得後の処理を差し替えられる。
 */
function requestCurrentLocation(opts) {
  const o = opts || {};
  const status = o.status || geoStatus;
  if (!navigator.geolocation) {
    status("このブラウザは現在地の取得に対応していません。地点を検索して追加してください。");
    return;
  }
  const btns = document.querySelectorAll("[data-geo]");
  const busy = on => btns.forEach(b => { b.disabled = on; if (on) b.setAttribute("aria-busy", "true"); else b.removeAttribute("aria-busy"); });
  busy(true);
  status("現在地を取得しています…");

  navigator.geolocation.getCurrentPosition(pos => {
    busy(false);
    const lat = Math.round(pos.coords.latitude * 10000) / 10000;
    const lon = Math.round(pos.coords.longitude * 10000) / 10000;
    const city = Object.assign({ id: CURRENT_LOCATION_ID, region: "追加した地点", lat: lat, lon: lon },
                               currentLocationMeta(lat, lon));
    if (!isValidCustomCity(city)) {
      status("現在地の座標を取得できませんでした。");
      return;
    }
    // 位置が変わっている場合もあるので、常に最新の座標で置き換える
    CITY_BY_ID.set(city.id, city);
    state.custom = state.custom.filter(c => c.id !== city.id).concat([city]);
    if (state.selected.indexOf(city.id) < 0) state.selected.unshift(city.id);
    if (state.pinned.indexOf(city.id) < 0) state.pinned.unshift(city.id);
    state.data.delete(city.id);
    state.errors.delete(city.id);
    saveState();
    status("現在地（" + (city.sub || (lat + ", " + lon)) + "）を追加しました。");
    render();
    refresh(false);
    if (o.done) o.done(city);
  }, err => {
    busy(false);
    status(
      err && err.code === 1 ? "位置情報の利用が許可されませんでした。ブラウザの設定で許可するか、地点を検索して追加してください。"
      : err && err.code === 3 ? "現在地の取得がタイムアウトしました。もう一度お試しください。"
      : "現在地を取得できませんでした。地点を検索して追加してください。");
  }, { enableHighAccuracy: false, timeout: 15000, maximumAge: 5 * 60 * 1000 });
}

function removeCustomCity(id) {
  state.custom = state.custom.filter(c => c.id !== id);
  state.selected = state.selected.filter(x => x !== id);
  state.pinned = state.pinned.filter(x => x !== id);
  CITY_BY_ID.delete(id);
  state.data.delete(id);
  state.errors.delete(id);
  saveState();
  render();
}

function renderPicker() {
  let html = REGIONS.map(r => {
    const chips = CITIES.filter(c => c.region === r).map(c =>
      '<button type="button" class="chip" data-toggle="' + esc(c.id) + '" aria-pressed="'
      + state.selected.includes(c.id) + '">' + esc(c.name) + '</button>').join("");
    return '<div class="picker-group"><h3>' + esc(r) + '</h3><div class="chips">' + chips + '</div></div>';
  }).join("");

  if (state.custom.length) {
    const chips = state.custom.map(c =>
      '<button type="button" class="chip" data-remove="' + esc(c.id) + '" aria-pressed="true"'
      + ' title="クリックで削除">' + esc(c.name) + ' ×</button>').join("");
    html += '<div class="picker-group"><h3>追加した地点（クリックで削除）</h3><div class="chips">'
      + chips + '</div></div>';
  }
  $("#pickerGroups").innerHTML = html;
}

function render() {
  const cards = state.view === "cards";
  $("#viewCards").setAttribute("aria-pressed", String(cards));
  $("#viewTable").setAttribute("aria-pressed", String(!cards));
  document.querySelectorAll('section[aria-labelledby="pinnedHead"], section[aria-labelledby="otherHead"]')
    .forEach(el => { el.hidden = !cards; });
  $("#tableSection").hidden = cards;

  if (cards) renderGrids(); else renderTable();
  renderPicker();

  syncOpenSheet();
  if (radar.active) {
    const rc = CITY_BY_ID.get(radar.cityId);
    if (rc && radar.series && radar.series.source === "model") {
      const ms = modelSeries(rc);
      if (ms) { ms.key = radar.series.key; ms.headline = makeHeadline(ms); radar.series = ms; }
    } else if (rc && !radar.series) {
      updateRadarSeries();
    }
    renderRadarPanel();
  }
  if (state.tab === "news") renderNews();
  updateNewsBadge();

  const u = $("#updated");
  if (state.loading) u.textContent = "更新中…";
  else if (state.fetchedAt) u.innerHTML = "最終更新 <strong>" + esc(nowText(state.fetchedAt)) + "</strong>";
  else u.textContent = "";
}
/** 詳細パネルを開いたまま取得が完了したら、中身を描き直す */
function syncOpenSheet() {
  if (state.tab !== "weather" || !state.openCity) return;
  const sheet = $("#sheet");
  if (state.data.has(state.openCity) && sheet.dataset.hasData !== "1") {
    openSheet(state.openCity, state.openDay, { keepScroll: true });
  } else {
    renderCitySwitch();
  }
}

function nowText(ts) {
  try {
    return new Intl.DateTimeFormat("ja-JP", { timeZone: JST, hour: "2-digit", minute: "2-digit" }).format(new Date(ts)) + " JST";
  } catch (e) { return new Date(ts).toLocaleTimeString("ja-JP"); }
}

/* ============================================================
 * 6b. 日ごとの詳細予報
 *   一般的な「今日の天気予報」の掲載項目にあわせ、天気・最高/最低気温（前日差）・
 *   時間帯別の降水確率・3時間ごとの推移・風・湿度・日の出/日の入・UV指数を出す。
 *   48時間より先の日は hourly を持っていないため、その日だけ追加取得する。
 * ============================================================ */
const dayHours = new Map();       // "cityId|YYYY-MM-DD" -> 時間ごとの配列
const dayHoursPending = new Set();

function dayKey(cityId, date) { return cityId + "|" + date; }

/** 手持ちの 48 時間データから、その日の分を切り出す */
function hoursOfDay(d, date) {
  return (d.hours || []).filter(h => String(h.time || "").slice(0, 10) === date);
}

/** その日の 1 時間ごとのデータを用意する（未取得なら API から取りにいく） */
async function ensureDayHours(city, date, d) {
  const key = dayKey(city.id, date);
  if (dayHours.has(key) || dayHoursPending.has(key)) return;
  const local = hoursOfDay(d, date);
  if (local.length >= 20) { dayHours.set(key, local); return; }

  dayHoursPending.add(key);
  try {
    const p = new URLSearchParams();
    p.set("latitude", String(city.lat));
    p.set("longitude", String(city.lon));
    p.set("hourly", HOURLY_VARS.join(","));
    p.set("timezone", JST);
    p.set("start_date", date);
    p.set("end_date", date);
    const raw = await getJson(API + "?" + p.toString(), 15000);
    const json = Array.isArray(raw) ? raw[0] : raw;
    const hourly = (json && json.hourly) || {};
    // start_date / end_date が効かなかった場合に備えて、その日の分だけに絞る
    const out = (hourly.time || []).map((t, i) => normalizeHour(hourly, i))
                  .filter(h => String(h.time || "").slice(0, 10) === date);
    dayHours.set(key, out.length ? out : local);
  } catch (e) {
    dayHours.set(key, local);   // 取得できなければ手持ちの分だけで描画する
  } finally {
    dayHoursPending.delete(key);
  }
}

/** WMO コードを大まかな天気の区分にまとめる */
function coarseWeather(code) {
  if (code === 0 || code === 1) return "晴れ";
  if (code === 2) return "晴れ";
  if (code === 3) return "くもり";
  if (code === 45 || code === 48) return "霧";
  if (code >= 95) return "雷雨";
  if ([71, 73, 75, 77, 85, 86].indexOf(code) >= 0) return "雪";
  if (code >= 51) return "雨";
  return "くもり";
}

/**
 * 「晴れのちくもり」「くもり時々雨」のような天気文をつくる。
 * 前半・後半で区分が変われば「のち」、通しで一定時間だけ別の区分が混じれば「時々」。
 */
function dayWeatherText(hours, fallbackCode) {
  const day = (hours || []).filter(h => {
    const hh = parseLocal(h.time);
    return hh && hh.getHours() >= 6 && hh.getHours() <= 21 && typeof h.code === "number";
  });
  if (day.length < 6) return wmo(fallbackCode).label;

  const cats = day.map(h => coarseWeather(h.code));
  const half = Math.floor(cats.length / 2);
  const major = arr => {
    const count = {};
    arr.forEach(c => { count[c] = (count[c] || 0) + 1; });
    return Object.keys(count).sort((a, b) => count[b] - count[a])[0];
  };
  const first = major(cats.slice(0, half));
  const second = major(cats.slice(half));

  if (first !== second) return first + "のち" + second;

  const others = cats.filter(c => c !== first);
  if (others.length >= 3) {
    const sub = major(others);
    return first + (others.length >= cats.length * 0.35 ? "時々" : "一時") + sub;
  }
  return first;
}

/** 0-6 / 6-12 / 12-18 / 18-24 の時間帯ごとの降水確率 */
const PERIODS = [
  { label: "未明〜朝", from: 0, to: 6 },
  { label: "朝〜昼",   from: 6, to: 12 },
  { label: "昼〜夕",   from: 12, to: 18 },
  { label: "夜",       from: 18, to: 24 }
];
function periodPops(hours) {
  return PERIODS.map(pd => {
    const vals = (hours || []).filter(h => {
      const t = parseLocal(h.time);
      return t && t.getHours() >= pd.from && t.getHours() < pd.to && typeof h.pop === "number";
    }).map(h => h.pop);
    return { label: pd.label, pop: vals.length ? Math.max.apply(null, vals) : null };
  });
}

/** 前日との気温差（「前日より3℃高い」の表示用） */
function diffText(today, prev) {
  if (typeof today !== "number" || typeof prev !== "number") return "";
  const diff = Math.round(toUnit(today)) - Math.round(toUnit(prev));
  if (diff === 0) return "前日と同じ";
  return "前日より" + Math.abs(diff) + "° " + (diff > 0 ? "高い" : "低い");
}

/** 選択した日の詳細を描画する */
function renderDayDetail(city, d, index) {
  const box = document.getElementById("dayDetail");
  if (!box) return;
  const day = d.days[index];
  if (!day) { box.innerHTML = ""; return; }

  const key = dayKey(city.id, day.date);
  const hours = dayHours.get(key) || hoursOfDay(d, day.date);
  const loading = dayHoursPending.has(key);
  const dt = parseLocal(day.date);
  const dow = dt ? DOW[dt.getDay()] : "";
  const w = wmo(day.code);
  const prev = index > 0 ? d.days[index - 1] : null;

  const periodRow = periodPops(hours).map(pd =>
    '<div class="pd"><div class="pd-label">' + esc(pd.label) + '</div>'
    + '<div class="pd-val tnum">' + (pd.pop === null ? "—" : pd.pop + "%") + '</div></div>').join("");

  // 3時間ごとの推移
  const step = hours.filter(h => { const t = parseLocal(h.time); return t && t.getHours() % 3 === 0; });
  const table = step.length
    ? '<div class="table-wrap" style="box-shadow:none"><table class="compare hours"><thead><tr>'
      + '<th>時刻</th><th>天気</th><th>気温</th><th>体感</th><th>降水確率</th><th>降水量</th><th>風 (km/h)</th><th>湿度</th>'
      + '</tr></thead><tbody>'
      + step.map(h => {
          const hw = wmo(h.code);
          return '<tr><td class="tnum">' + fmtClock(h.time) + '</td>'
            + '<td><span class="cond">' + icon(hw.icon, 20) + esc(hw.label) + '</span></td>'
            + '<td class="tnum">' + fmtTemp(h.temp, 1) + '°</td>'
            + '<td class="tnum">' + fmtTemp(h.feels) + '°</td>'
            + '<td class="tnum">' + fmtNum(h.pop, "%") + '</td>'
            + '<td class="tnum">' + (h.precip == null ? "—" : h.precip + " mm") + '</td>'
            + '<td class="tnum">' + esc(windText(h.windDeg, h.wind)) + '</td>'
            + '<td class="tnum">' + fmtNum(h.humidity, "%") + '</td></tr>';
        }).join("")
      + '</tbody></table></div>'
    : '<p class="alert-note">' + (loading ? "1時間ごとの予報を取得しています…"
        : "この日の1時間ごとの予報は取得できませんでした。") + '</p>';

  const um = umbrellaAdvice(day), cl = clothingAdvice(day, d.now);

  box.innerHTML =
    '<div class="day-detail">'
    + '<div class="dd-head">'
    +   '<span class="dd-icon">' + icon(w.icon, 44) + '</span>'
    +   '<div><div class="dd-date tnum">' + (dt ? (dt.getMonth() + 1) + "月" + dt.getDate() + "日(" + dow + ")" : "")
    +     (index === 0 ? ' <span class="dd-badge">今日</span>' : index === 1 ? ' <span class="dd-badge">明日</span>' : "") + '</div>'
    +     '<div class="dd-text">' + esc(dayWeatherText(hours, day.code)) + '</div></div>'
    +   '<div class="dd-temp tnum">'
    +     '<span class="hi">' + fmtTemp(day.hi) + '°</span><span class="sl">/</span>'
    +     '<span class="lo">' + fmtTemp(day.lo) + '°</span>'
    +     (prev ? '<div class="dd-diff">' + esc(diffText(day.hi, prev.hi)) + '</div>' : "")
    +   '</div>'
    + '</div>'
    + '<div class="dd-periods"><div class="dd-cap">時間帯ごとの降水確率</div><div class="pds">' + periodRow + '</div></div>'
    + '<dl class="stats tnum" style="margin-top:10px">'
    +   stat("降水量", (day.precip == null ? "—" : day.precip + " mm"))
    +   stat("降水時間", (day.precipHours == null ? "—" : Math.round(day.precipHours) + " 時間"))
    +   stat("最大風速", windText(day.windDeg, day.wind) + " km/h")
    +   stat("UV指数", (day.uv == null ? "—" : Number(day.uv).toFixed(1)))
    +   stat("日の出", fmtClock(day.sunrise))
    +   stat("日の入", fmtClock(day.sunset))
    +   stat("服装", cl ? cl.emoji + " " + cl.title : "—")
    +   stat("傘", um ? um.label : "—")
    + '</dl>'
    + '<div class="dd-cap" style="margin-top:14px">3時間ごとの予報</div>'
    + table
    + '</div>';
}

/** 日のカードが押されたとき */
async function selectDay(cityId, index) {
  const city = CITY_BY_ID.get(cityId);
  const d = state.data.get(cityId);
  if (!city || !d || !d.days[index]) return;
  state.openDay = index;
  document.querySelectorAll("#daysStrip .day").forEach((el, i) => {
    el.setAttribute("aria-pressed", String(i === index));
    el.classList.toggle("selected", i === index);
  });
  renderDayDetail(city, d, index);
  await ensureDayHours(city, d.days[index].date, d);
  if (state.openCity === cityId && state.openDay === index) renderDayDetail(city, d, index);
}

/* ============================================================
 * 7. 詳細パネル（週間予報 + 48時間の推移）
 * ============================================================ */

function openSheet(cityId, dayIndex, opts) {
  const city = CITY_BY_ID.get(cityId);
  const d = state.data.get(cityId);
  if (!city) return;
  const keepScroll = opts && opts.keepScroll;
  if (state.tab !== "weather") setTab("weather", { silent: true });

  const w = d ? wmo(d.now.code) : WMO_UNKNOWN;
  let html =
    '<div class="sheet-head" style="background:linear-gradient(135deg,' + w.sky[0] + ',' + w.sky[1] + ')">'
    + '<span class="icon">' + icon(w.icon, 52) + '</span>'
    + '<div><h2 id="sheetTitle">' + esc(city.name) + '</h2>'
    + '<div class="meta">' + esc(city.sub) + ' ・ ' + esc(city.region)
    + ' ・ ' + city.lat.toFixed(2) + '°N ' + city.lon.toFixed(2) + '°E</div></div>';

  if (d) {
    html += '<div class="now"><div class="t tnum">' + fmtTemp(d.now.temp, 1) + unitLabel() + '</div>'
      + '<div class="d">' + esc(w.label) + ' ・ 体感 ' + fmtTemp(d.now.feels) + '°</div></div>';
  }
  html += '</div><div class="sheet-body">';

  if (!d) {
    const err = state.errors.get(cityId);
    html += '<p style="color:var(--text-3)">' + esc(err || "予報を読み込んでいます…") + '</p>'
      + (err ? '<button type="button" class="btn" id="retryBtn">再取得する</button>' : "");
  } else {
    const t = d.today || {};

    // --- 気象警報・注意報 ---
    const al = alertsFor(cityId);
    const sev = al ? al.severity : 0;
    html += '<h3 class="sheet-h3">気象警報・注意報</h3>'
      + '<div class="alert-box ' + SEVERITY_STYLE[sev].cls + (sev ? "" : " sev-0") + '">'
      + '<div class="head">' + (sev
          ? "⚠ " + esc(SEVERITY_STYLE[sev].label) + "が発表されています"
          : "発表中の警報・注意報はありません") + '</div>'
      + '<div class="body">';
    if (sev && al.areas.length) {
      html += al.areas.map(ar =>
        '<div class="area">'
        + (ar.area ? '<div class="area-name">' + esc(ar.area) + '</div>' : "")
        + ar.items.map(i => '<span class="alert-tag ' + SEVERITY_STYLE[warningSeverity(i) || sev].cls + '">'
            + esc(i) + '</span>').join("")
        + '</div>').join("");
    } else if (!sev) {
      html += '<span style="color:var(--text-3);font-size:12.5px">現時点で発表されているものはありません。</span>';
    }
    html += '<div class="alert-note">' + (al && al.source === "jma"
        ? "出典: " + esc(al.office || "気象庁") + "（" + (al.reportedAt ? esc(String(al.reportedAt).slice(0, 16).replace("T", " ")) : "発表時刻不明") + " 発表）。"
          + (al.scoped
              ? "この地点が属する一次細分区域（" + esc(city.jmaArea || "") + "）の発表状況です。"
              : "この地点が属する府県予報区全体の発表状況です。区域によっては発表されていない場合があります。")
          + "市区町村ごとの詳細は気象庁の公式ページをご確認ください。"
        : "気象庁の発表情報を取得できなかったため、<strong>予報値から自動判定したアプリ独自の目安</strong>を表示しています。"
          + "気象庁が発表する警報・注意報とは基準も内容も異なります。防災上の判断は必ず気象庁の公式情報をご確認ください。")
      + '</div></div></div>';

    // --- おすすめ（服装・傘）---
    const um = umbrellaAdvice(t), cl = clothingAdvice(t, d.now);
    if (um || cl) {
      html += '<h3 class="sheet-h3">今日のおすすめ</h3><div class="advice-cards">';
      if (cl) {
        html += '<div class="advice-card"><div class="cap">服装</div>'
          + '<div class="main"><span class="emoji">' + cl.emoji + '</span>'
          + '<span class="title">' + esc(cl.title) + '</span></div>'
          + '<div class="detail">' + esc(cl.detail) + '</div>'
          + (cl.tips.length ? '<ul>' + cl.tips.map(x => '<li>' + esc(x) + '</li>').join("") + '</ul>' : "")
          + '<div class="alert-note">体感温度の最高 ' + fmtTemp(cl.hi) + '° / 最低 ' + fmtTemp(cl.lo) + '° をもとにした目安です。</div>'
          + '</div>';
      }
      if (um) {
        html += '<div class="advice-card"><div class="cap">傘</div>'
          + '<div class="main"><span class="emoji">' + (um.level === "no" ? "🌤️" : um.level === "maybe" ? "🌂" : "☂️") + '</span>'
          + '<span class="title umb ' + um.level + '">' + esc(um.label) + '</span></div>'
          + '<div class="detail">' + esc(um.note) + '</div>'
          + '<div class="alert-note">本日の降水確率 ' + fmtNum(t.pop, "%") + ' / 予想降水量 '
          + (t.precip == null ? "—" : t.precip + " mm") + ' をもとにした目安です。</div>'
          + '</div>';
      }
      html += '</div>';
    }

    // --- 生活指数 ---
    const idx = lifeIndices(t, d.hours);
    if (idx.length) {
      html += '<h3 class="sheet-h3">生活指数</h3><div class="idx-grid">'
        + idx.map(x =>
            '<div class="idx-card lv-' + x.data.level + '">'
            + '<div class="idx-top"><span class="idx-emoji">' + x.emoji + '</span>'
            + '<span class="idx-cap">' + esc(x.cap) + '</span>'
            + (x.data.value ? '<span class="idx-val tnum">' + esc(x.data.value) + '</span>' : "") + '</div>'
            + '<div class="idx-title">' + esc(x.data.title) + '</div>'
            + '<div class="idx-detail">' + esc(x.data.detail) + '</div></div>').join("")
        + '</div>'
        + '<p class="alert-note">数値予報から機械的に求めた目安です。気象庁や各社が発表している指数そのものではありません。</p>';
    }

    html += '<h3 class="sheet-h3">現在の状況</h3><dl class="stats tnum">'
      + stat("体感温度", fmtTemp(d.now.feels, 1) + unitLabel())
      + stat("湿度", fmtNum(d.now.humidity, "%"))
      + stat("風", windText(d.now.windDeg, d.now.wind) + " km/h")
      + stat("降水量", (d.now.precip == null ? "—" : d.now.precip + " mm"))
      + stat("本日の降水確率", fmtNum(t.pop, "%"))
      + stat("UV指数", (t.uv == null ? "—" : Number(t.uv).toFixed(1)))
      + stat("日の出", fmtClock(t.sunrise))
      + stat("日の入", fmtClock(t.sunset))
      + '</dl>';

    html += '<h3 class="sheet-h3">2週間予報（' + d.days.length + '日間）— 日を選ぶと詳細が出ます</h3>'
      + '<div class="days-wrap"><div class="days-scroll"><div class="days" id="daysStrip">'
      + d.days.map((day, i) => {
          const dw = wmo(day.code);
          const dt = parseLocal(day.date);
          const dow = dt ? DOW[dt.getDay()] : "";
          const cls = dt && dt.getDay() === 0 ? " sun" : (dt && dt.getDay() === 6 ? " sat" : "");
          return '<button type="button" class="day' + (i === 0 ? " today" : "") + (i >= 7 ? " far" : "") + '"'
            + ' data-day="' + i + '" aria-pressed="false">'
            + '<div class="dow' + cls + '">' + (i === 0 ? "今日" : dow) + '</div>'
            + '<div class="date tnum">' + (dt ? (dt.getMonth() + 1) + "/" + dt.getDate() : "") + '</div>'
            + icon(dw.icon, 34)
            + '<div class="tmp tnum"><span class="hi">' + fmtTemp(day.hi) + '</span>'
            + ' <span style="color:var(--text-3)">/</span> <span class="lo">' + fmtTemp(day.lo) + '</span></div>'
            + '<div class="pop tnum">' + fmtNum(day.pop, "%") + '</div></button>';
        }).join("")
      + '</div></div></div>'
      + '<div id="dayDetail"></div>'
      + '<p class="alert-note">8日目以降は数値予報の不確実性が大きく、日々変わります。傾向をつかむ目安としてご覧ください。</p>';

    if (d.hours.length > 1) {
      html += '<h3 class="sheet-h3">今後48時間の推移</h3>'
        + '<div class="chart-legend"><span><i style="background:var(--accent)"></i>気温 (' + unitLabel() + ')</span>'
        + '<span><i style="background:#7fb4dd"></i>降水確率 (%)</span></div>'
        + '<div class="chart">' + hourlyChart(d.hours) + '</div>';

      const pressures = d.hours.filter(h => typeof h.pressure === "number");
      if (pressures.length > 2) {
        html += '<h3 class="sheet-h3">気圧の変化（48時間）</h3>'
          + '<div class="chart">' + pressureChart(d.hours) + '</div>'
          + '<p class="alert-note">' + esc(pressureComment(d.hours)) + '</p>';
      }
    }

    // --- 大気質（開いたときに別 API から取得する）---
    html += '<h3 class="sheet-h3">大気の状態</h3><div id="airBox" class="air-box">'
      + '<span style="color:var(--text-3);font-size:12.5px">大気質を読み込んでいます…</span></div>';

    html += '<h3 class="sheet-h3">雨雲の様子</h3>'
      + '<button type="button" class="btn primary" data-radar="' + esc(city.id) + '">'
      + '雨雲レーダーで' + esc(city.name) + '周辺を見る</button>';

    html += '<p style="margin:18px 0 0;font-size:11.5px;color:var(--text-3);line-height:1.7">'
      + '標高 ' + (d.elevation == null ? "—" : Math.round(d.elevation) + " m")
      + ' の予報格子点の値です。数値予報のため実際の空模様とは差が出ることがあります。'
      + '出典: Open-Meteo (CC BY 4.0)</p>';
  }
  html += '</div>';

  const sheet = $("#sheet");
  sheet.innerHTML = html;
  state.openCity = cityId;
  if (state.weatherCity !== cityId) { state.weatherCity = cityId; saveState(); }
  sheet.dataset.hasData = d ? "1" : "0";
  const day = Math.min(Math.max(dayIndex || 0, 0), d && d.days.length ? d.days.length - 1 : 0);
  state.openDay = day;
  if (d && d.days.length) selectDay(cityId, day);
  if (d) loadAirBox(city);
  renderCitySwitch();
  if (!keepScroll) window.scrollTo(0, 0);
}

/** 「天気」タブ上部の地点切り替え */
function renderCitySwitch() {
  const box = document.getElementById("citySwitch");
  if (!box) return;
  box.innerHTML = orderedCities().map(c => {
    const d = state.data.get(c.id);
    const w = d ? wmo(d.now.code) : null;
    const on = c.id === state.openCity;
    return '<button type="button" class="cs-chip' + (on ? " on" : "") + '" data-open="' + esc(c.id) + '"'
      + (on ? ' aria-current="true"' : "") + '>'
      + (w ? icon(w.icon, 18) : "")
      + '<span class="cs-name">' + esc(c.name) + '</span>'
      + (d ? '<span class="cs-temp tnum">' + fmtTemp(d.now.temp) + '°</span>' : "")
      + '</button>';
  }).join("");
  const cur = box.querySelector(".on");
  if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: "nearest", inline: "center" });
}

function stat(label, value) {
  return '<div class="stat"><dt>' + esc(label) + '</dt><dd>' + esc(value) + '</dd></div>';
}

/** 「天気」タブから一覧に戻る */
function closeSheet() {
  setTab("region");
}

/** 気圧の折れ線（48時間）。既存の気温グラフと同じ作図規則にそろえる。 */
function pressureChart(hours) {
  const pts = (hours || []).filter(h => typeof h.pressure === "number");
  if (pts.length < 3) return "";
  const W = 720, H = 150, padL = 42, padR = 12, padT = 12, padB = 26;
  const vals = pts.map(p => p.pressure);
  let min = Math.min.apply(null, vals), max = Math.max.apply(null, vals);
  const margin = Math.max((max - min) * 0.2, 2);
  min -= margin; max += margin;
  const x = i => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);

  let axis = "";
  for (let k = 0; k <= 3; k++) {
    const v = min + (max - min) * (k / 3);
    axis += '<text x="' + (padL - 6) + '" y="' + (y(v) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" '
      + 'fill="var(--text-3)">' + v.toFixed(0) + '</text>'
      + '<line x1="' + padL + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y(v).toFixed(1)
      + '" stroke="var(--border)" stroke-width="1" stroke-opacity=".6"/>';
  }
  let ticks = "";
  pts.forEach((p, i) => {
    const dt = parseLocal(p.time);
    if (!dt || dt.getHours() % 6 !== 0) return;
    const midnight = dt.getHours() === 0;
    ticks += '<line x1="' + x(i).toFixed(1) + '" y1="' + padT + '" x2="' + x(i).toFixed(1) + '" y2="' + (H - padB)
      + '" stroke="var(--border)" stroke-width="1"' + (midnight ? '' : ' stroke-dasharray="2 4"') + '/>'
      + '<text x="' + x(i).toFixed(1) + '" y="' + (H - padB + 14) + '" text-anchor="middle" font-size="10" '
      + 'fill="var(--text-3)">' + (midnight ? (dt.getMonth() + 1) + "/" + dt.getDate() : dt.getHours() + "時") + '</text>';
  });
  const line = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(p.pressure).toFixed(1)).join(" ");
  // 標準気圧 1013hPa の目安線（範囲内のときだけ）
  const std = (1013 >= min && 1013 <= max)
    ? '<line x1="' + padL + '" y1="' + y(1013).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y(1013).toFixed(1)
      + '" stroke="var(--text-3)" stroke-width="1" stroke-dasharray="5 4" stroke-opacity=".7"/>'
      + '<text x="' + (W - padR) + '" y="' + (y(1013) - 4).toFixed(1) + '" text-anchor="end" font-size="9.5" fill="var(--text-3)">1013 hPa</text>'
    : "";

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="48時間の気圧の推移">'
    + axis + ticks + std
    + '<path d="' + line + '" fill="none" stroke="#8a63c9" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>'
    + '</svg>';
}

/** 気圧の下がり方から一言添える（気象病の目安として市販アプリが載せているもの） */
function pressureComment(hours) {
  const pts = (hours || []).filter(h => typeof h.pressure === "number");
  if (pts.length < 7) return "気圧の推移です。単位は hPa（海面気圧）。";
  let worst = 0, worstAt = null;
  for (let i = 0; i + 6 < pts.length; i++) {
    const drop = pts[i].pressure - pts[i + 6].pressure;   // 6時間での変化
    if (drop > worst) { worst = drop; worstAt = pts[i].time; }
  }
  const when = worstAt ? fmtClock(worstAt) + "ごろから" : "";
  if (worst >= 6) return "6時間で " + worst.toFixed(1) + " hPa 下がる時間帯があります（" + when + "）。気圧の変化に敏感な方は体調に注意してください。";
  if (worst >= 3) return "6時間で " + worst.toFixed(1) + " hPa ほど下がる時間帯があります（" + when + "）。人によっては頭痛やだるさが出やすい変化幅です。";
  return "大きな気圧の低下はない見込みです。単位は hPa（海面気圧）。";
}

/** 大気質を取得して詳細パネルに差し込む */
async function loadAirBox(city) {
  const render = html => {
    const box = document.getElementById("airBox");
    // 取得中に別の地点を開いていたら書き込まない
    if (box && state.openCity === city.id) box.innerHTML = html;
  };
  let air;
  try {
    air = await fetchAirQuality(city);
  } catch (e) {
    render('<span style="color:var(--text-3);font-size:12.5px">大気質のデータを取得できませんでした。</span>');
    return;
  }
  const band = aqiBand(air.aqi);
  const pm = pm25Band(air.pm25);
  const num = (v, unit, digits) => (typeof v === "number" ? v.toFixed(digits === undefined ? 1 : digits) + unit : "—");

  render(
    (band
      ? '<div class="air-head lv-' + band.level + '">'
        + '<span class="air-aqi tnum">' + Math.round(air.aqi) + '</span>'
        + '<div><div class="air-label">' + esc(band.label) + '</div>'
        + '<div class="air-detail">' + esc(band.detail) + '</div></div></div>'
      : "")
    + '<dl class="stats tnum" style="margin-top:10px">'
    + stat("PM2.5", num(air.pm25, " μg/m³") + (pm ? "（" + pm.label + "）" : ""))
    + stat("PM10", num(air.pm10, " μg/m³"))
    + stat("黄砂・ダスト", num(air.dust, " μg/m³"))
    + stat("オゾン", num(air.ozone, " μg/m³", 0))
    + stat("二酸化窒素", num(air.no2, " μg/m³", 0))
    + stat("二酸化硫黄", num(air.so2, " μg/m³", 0))
    + '</dl>'
    + '<p class="alert-note">出典: Open-Meteo Air Quality API（欧州 CAMS の全球モデル）。'
    + '指数は米国 EPA の AQI、PM2.5 の区分は日本の環境基準（日平均 35μg/m³）を目安にしています。'
    + '実測値ではなくモデルによる推計です。'
    + '花粉は CAMS がヨーロッパのみの提供でスギ・ヒノキを対象としていないため、表示していません。</p>');
}

/** 気温の折れ線 + 降水確率の棒グラフ（48時間） */
function hourlyChart(hours) {
  const W = 720, H = 190, padL = 34, padR = 12, padT = 12, padB = 28;
  const pts = hours.filter(h => typeof h.temp === "number");
  if (pts.length < 2) return "";
  const temps = pts.map(p => toUnit(p.temp));
  let min = Math.min.apply(null, temps), max = Math.max.apply(null, temps);
  const margin = Math.max((max - min) * 0.15, 1);
  min -= margin; max += margin;
  const x = i => padL + (i / (pts.length - 1)) * (W - padL - padR);
  const y = v => padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
  const bw = Math.max(2, (W - padL - padR) / pts.length - 2);

  // 降水確率の棒
  let bars = "";
  pts.forEach((p, i) => {
    if (typeof p.pop !== "number" || p.pop <= 0) return;
    const h = (p.pop / 100) * (H - padT - padB) * 0.72;
    bars += '<rect x="' + (x(i) - bw / 2).toFixed(1) + '" y="' + (H - padB - h).toFixed(1)
      + '" width="' + bw.toFixed(1) + '" height="' + h.toFixed(1)
      + '" rx="1.5" fill="#7fb4dd" fill-opacity=".55"/>';
  });

  // 気温の折れ線
  const line = pts.map((p, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(temps[i]).toFixed(1)).join(" ");

  // 目盛り（3時間ごと・日付境界を強調）
  let ticks = "";
  pts.forEach((p, i) => {
    const dt = parseLocal(p.time);
    if (!dt) return;
    const hh = dt.getHours();
    if (hh % 6 !== 0) return;
    const isMidnight = hh === 0;
    ticks += '<line x1="' + x(i).toFixed(1) + '" y1="' + padT + '" x2="' + x(i).toFixed(1) + '" y2="' + (H - padB)
      + '" stroke="var(--border)" stroke-width="1"' + (isMidnight ? '' : ' stroke-dasharray="2 4"') + '/>'
      + '<text x="' + x(i).toFixed(1) + '" y="' + (H - padB + 14) + '" text-anchor="middle" font-size="10" '
      + 'fill="var(--text-3)">' + (isMidnight ? (dt.getMonth() + 1) + "/" + dt.getDate() : hh + "時") + '</text>';
  });

  // 左軸（気温）
  let axis = "";
  for (let k = 0; k <= 3; k++) {
    const v = min + (max - min) * (k / 3);
    axis += '<text x="' + (padL - 6) + '" y="' + (y(v) + 3.5).toFixed(1) + '" text-anchor="end" font-size="10" '
      + 'fill="var(--text-3)">' + v.toFixed(0) + '</text>'
      + '<line x1="' + padL + '" y1="' + y(v).toFixed(1) + '" x2="' + (W - padR) + '" y2="' + y(v).toFixed(1)
      + '" stroke="var(--border)" stroke-width="1" stroke-opacity=".6"/>';
  }

  return '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="48時間の気温と降水確率の推移">'
    + axis + ticks + bars
    + '<path d="' + line + '" fill="none" stroke="var(--accent)" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>'
    + '</svg>';
}

/* ============================================================
 * 7a. 画面（タブ）の切り替え
 *   雨雲レーダー / 天気 / 地域の天気 / お知らせ / メニュー の5画面。
 *   URL の #radar などと連動させ、ブラウザの戻る操作でも行き来できるようにする。
 * ============================================================ */
const TAB_TITLES = { radar: "雨雲レーダー", weather: "天気", region: "地域の天気", news: "お知らせ", menu: "メニュー" };

function setTab(tab, opts) {
  if (TABS.indexOf(tab) < 0) tab = "region";
  const o = opts || {};
  const prev = state.tab;
  state.tab = tab;
  document.body.setAttribute("data-tab", tab);
  TABS.forEach(t => {
    const page = document.getElementById("page-" + t);
    if (page) page.hidden = t !== tab;
  });
  document.querySelectorAll(".tabbar [data-tab]").forEach(b => {
    const on = b.getAttribute("data-tab") === tab;
    b.classList.toggle("on", on);
    if (on) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current");
  });
  const title = document.getElementById("pageTitle");
  if (title) title.textContent = TAB_TITLES[tab];
  if (location.hash !== "#" + tab) {
    try { history.replaceState(null, "", "#" + tab); } catch (e) { /* file:// などでは無視 */ }
  }
  if (prev === "radar" && tab !== "radar") leaveRadar();
  saveState();
  if (o.silent) return;

  if (tab === "radar") enterRadar(o.cityId);
  else if (tab === "weather") {
    const id = o.cityId || state.weatherCity || state.pinned[0] || state.selected[0];
    if (id) openSheet(id, o.cityId ? 0 : state.openDay, { keepScroll: false });
  } else if (tab === "news") renderNews();
  else if (tab === "menu") renderMenu();
  if (tab !== "radar") window.scrollTo(0, 0);
}

/* ---- お知らせ ---- */
function newsItems() {
  const warn = [], pressure = [];
  orderedCities().forEach(c => {
    const a = alertsFor(c.id);
    if (a && a.severity && (a.source === "jma" || a.severity >= 2)) warn.push({ city: c, alert: a });
    const d = state.data.get(c.id);
    if (d) {
      const pts = d.hours.filter(h => typeof h.pressure === "number");
      let worst = 0, at = null;
      for (let i = 0; i + 6 < pts.length; i++) {
        const drop = pts[i].pressure - pts[i + 6].pressure;
        if (drop > worst) { worst = drop; at = pts[i].time; }
      }
      if (worst >= 6) pressure.push({ city: c, drop: worst, at: at });
    }
  });
  warn.sort((a, b) => b.alert.severity - a.alert.severity);
  pressure.sort((a, b) => b.drop - a.drop);
  return { warn: warn, pressure: pressure };
}

/** タブのバッジ（お知らせの赤い点）を更新する */
function updateNewsBadge() {
  const items = newsItems();
  const rain = radar.series && radar.series.headline && radar.series.headline.notify;
  const dot = document.getElementById("newsDot");
  if (dot) dot.hidden = !(items.warn.length || items.pressure.length || rain);
}

function renderNews() {
  const box = document.getElementById("newsBody");
  if (!box) return;
  const items = newsItems();
  let html = "";

  // 雨の見通し（レーダーの地点）
  const rc = CITY_BY_ID.get(radar.cityId || state.radarCity || state.pinned[0]);
  if (radar.series && radar.series.headline && rc) {
    const h = radar.series.headline;
    html += '<section class="news-card">'
      + '<div class="news-cap">雨の見通し — ' + esc(rc.name) + '</div>'
      + '<div class="news-head ' + (h.notify ? "warn" : "") + '">' + esc(h.title) + '</div>'
      + '<p class="news-text">' + esc(h.advice) + '</p>'
      + '<button type="button" class="btn" data-goto="radar">雨雲レーダーを見る</button></section>';
  }

  html += '<h3 class="sheet-h3">気象警報・注意報</h3>';
  if (!items.warn.length) {
    html += '<div class="news-empty">表示中の地点に、発表中の警報・注意報はありません。</div>';
  } else {
    html += items.warn.map(x => {
      const st = SEVERITY_STYLE[x.alert.severity];
      return '<button type="button" class="news-row" data-open="' + esc(x.city.id) + '">'
        + '<span class="news-sev ' + st.cls + '">' + esc(st.label) + '</span>'
        + '<span class="news-main"><span class="news-city">' + esc(x.city.name) + '</span>'
        + '<span class="news-tags">' + esc(uniqueAlertNames(x.alert).join("・")) + '</span></span>'
        + '<span class="news-src">' + (x.alert.source === "jma" ? "気象庁" : "目安") + '</span></button>';
    }).join("");
  }

  html += '<h3 class="sheet-h3">気圧の大きな低下（48時間以内）</h3>';
  if (!items.pressure.length) {
    html += '<div class="news-empty">6時間で 6 hPa 以上下がる見込みの地点はありません。</div>';
  } else {
    html += items.pressure.map(x =>
      '<button type="button" class="news-row" data-open="' + esc(x.city.id) + '">'
      + '<span class="news-sev sev-1">気圧</span>'
      + '<span class="news-main"><span class="news-city">' + esc(x.city.name) + '</span>'
      + '<span class="news-tags">' + esc(fmtClock(x.at)) + 'ごろから6時間で ' + x.drop.toFixed(1) + ' hPa 低下</span></span>'
      + '</button>').join("");
  }
  html += '<p class="alert-note">「目安」は気象庁の情報を取得できなかった地点で、予報値から判定したアプリ独自の注意喚起です。'
    + '防災上の判断は必ず気象庁の公式情報をご確認ください。</p>';
  box.innerHTML = html;
}

/* ---- メニュー ---- */
let installPrompt = null;
window.addEventListener("beforeinstallprompt", ev => { ev.preventDefault(); installPrompt = ev; if (state.tab === "menu") renderMenu(); });

function renderMenu() {
  const box = document.getElementById("menuSettings");
  if (!box) return;
  const seg = (name, cur, opts) => '<div class="seg menu-seg" role="group">' + opts.map(o =>
    '<button type="button" data-set="' + name + '" data-val="' + o[0] + '" aria-pressed="' + (cur === o[0]) + '">'
    + esc(o[1]) + '</button>').join("") + '</div>';
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const standalone = window.matchMedia && window.matchMedia("(display-mode: standalone)").matches;
  box.innerHTML =
    '<div class="menu-group"><div class="menu-cap">表示</div>'
    + '<div class="menu-row"><span>気温の単位</span>' + seg("unit", state.unit, [["c", "°C"], ["f", "°F"]]) + '</div>'
    + '<div class="menu-row"><span>テーマ</span>' + seg("theme", state.theme, [["auto", "自動"], ["light", "ライト"], ["dark", "ダーク"]]) + '</div>'
    + '<div class="menu-row"><span>地域の天気の表示</span>' + seg("view", state.view, [["cards", "カード"], ["table", "比較表"]]) + '</div>'
    + '<div class="menu-row"><span>雨雲レーダーの地図</span>' + seg("base", state.radarBase, [["photo", "航空写真"], ["std", "地図"], ["pale", "淡色"]]) + '</div>'
    + '</div>'
    + '<div class="menu-group"><div class="menu-cap">地点</div>'
    + '<button type="button" class="menu-link" data-geo data-geo-menu>現在地の天気を追加</button>'
    + '<button type="button" class="menu-link" data-goto="region" data-picker>地点を追加・削除</button>'
    + '<div class="search-msg" id="menuMsg" hidden></div>'
    + '</div>'
    + '<div class="menu-group"><div class="menu-cap">アプリ</div>'
    + (standalone ? '<div class="menu-note">ホーム画面から起動しています。</div>'
       : installPrompt ? '<button type="button" class="menu-link" id="installBtn">ホーム画面に追加</button>'
       : '<div class="menu-note">' + (ios
           ? "Safari の共有ボタンから「ホーム画面に追加」を選ぶと、アプリのように起動できます。"
           : "ブラウザのメニューから「アプリをインストール」または「ホーム画面に追加」を選ぶと、アプリのように起動できます。") + '</div>')
    + '</div>';
}

/* ============================================================
 * 7b. 雨雲レーダー（全画面）
 *   背景: 国土地理院タイル（航空写真 / 標準地図 / 淡色地図）
 *     https://cyberjapandata.gsi.go.jp/xyz/{layer}/{z}/{x}/{y}.{png|jpg}
 *     航空写真が提供されていないズームでは、タイルごとに標準地図へ切り替える。
 *   降水: 気象庁 高解像度降水ナウキャスト（hrpns）のタイル
 *     https://www.jma.go.jp/bosai/jmatile/data/nowc/{basetime}/none/{validtime}/surf/hrpns/{z}/{x}/{y}.png
 *     実況は basetime == validtime、予測は basetime を固定して validtime を 5 分刻みで進める。
 *   地点の「10分後・30分後・60分後」は、そのタイルの該当ピクセルの色を読み取って求める。
 *   色を読み取れない（CORS などで拒否された）場合は、Open-Meteo の1時間値に切り替えて、その旨を表示する。
 *   いずれも公式に API として提供されているものではないため、失敗しても画面は必ず出す。
 * ============================================================ */
const GSI = "https://cyberjapandata.gsi.go.jp/xyz/";
const BASEMAPS = {
  photo: { url: GSI + "seamlessphoto/{z}/{x}/{y}.jpg", fb: GSI + "std/{z}/{x}/{y}.png", label: "航空写真", dark: true },
  std:   { url: GSI + "std/{z}/{x}/{y}.png", fb: null, label: "地図", dark: false },
  pale:  { url: GSI + "pale/{z}/{x}/{y}.png", fb: GSI + "std/{z}/{x}/{y}.png", label: "淡色地図", dark: false }
};
const NOWC_BASE = "https://www.jma.go.jp/bosai/jmatile/data/nowc/";
const TILE = 256;
const RADAR_ZOOM_MIN = 5, RADAR_ZOOM_MAX = 10, SAMPLE_ZOOM = 8;

/** 雨の強さの区分。用語は気象庁の予報用語、色はナウキャストの配色にあわせる。 */
const RAIN_LEVELS = [
  { rgb: null,            label: "雨なし",         range: "0mm/h",      color: "#9aa7b8" },
  { rgb: [242, 242, 255], label: "弱い雨",         range: "1mm/h未満",  color: "#F2F2FF" },
  { rgb: [160, 210, 255], label: "弱い雨",         range: "1〜5mm/h",   color: "#A0D2FF" },
  { rgb: [33, 140, 255],  label: "雨",             range: "5〜10mm/h",  color: "#218CFF" },
  { rgb: [0, 65, 255],    label: "やや強い雨",     range: "10〜20mm/h", color: "#0041FF" },
  { rgb: [250, 245, 0],   label: "強い雨",         range: "20〜30mm/h", color: "#FAF500" },
  { rgb: [255, 153, 0],   label: "激しい雨",       range: "30〜50mm/h", color: "#FF9900" },
  { rgb: [255, 40, 0],    label: "非常に激しい雨", range: "50〜80mm/h", color: "#FF2800" },
  { rgb: [180, 0, 104],   label: "猛烈な雨",       range: "80mm/h以上", color: "#B40068" }
];

/** 地図に出す地名（内蔵地点に加えて、位置の手がかりになる主な市） */
const MAP_LABELS = [
  ["小樽", 43.1907, 140.9947], ["苫小牧", 42.6340, 141.6055], ["帯広", 42.9236, 143.1966], ["北見", 43.8030, 143.8947],
  ["室蘭", 42.3152, 140.9738], ["八戸", 40.5123, 141.4884], ["弘前", 40.6031, 140.4641], ["石巻", 38.4344, 141.3029],
  ["郡山", 37.4005, 140.3597], ["いわき", 37.0505, 140.8877], ["つくば", 36.0835, 140.0764], ["高崎", 36.3220, 139.0033],
  ["八王子", 35.6664, 139.3160], ["川崎", 35.5309, 139.7029], ["相模原", 35.5714, 139.3734], ["船橋", 35.6946, 139.9826],
  ["上越", 37.1478, 138.2360], ["松本", 36.2380, 137.9720], ["高山", 36.1461, 137.2522], ["沼津", 35.0956, 138.8634],
  ["浜松", 34.7108, 137.7261], ["豊田", 35.0826, 137.1560], ["岡崎", 34.9548, 137.1744], ["四日市", 34.9651, 136.6244],
  ["舞鶴", 35.4747, 135.3858], ["堺", 34.5733, 135.4830], ["東大阪", 34.6795, 135.6008], ["西宮", 34.7376, 135.3416],
  ["米子", 35.4281, 133.3310], ["倉敷", 34.5850, 133.7720], ["福山", 34.4858, 133.3623], ["呉", 34.2489, 132.5658],
  ["下関", 33.9575, 130.9414], ["今治", 34.0662, 132.9978], ["久留米", 33.3192, 130.5083], ["唐津", 33.4500, 129.9683],
  ["佐世保", 33.1799, 129.7151], ["平戸", 33.3681, 129.5539], ["諫早", 32.8433, 130.0533], ["大村", 32.9000, 129.9583],
  ["島原", 32.7881, 130.3697], ["五島", 32.6953, 128.8411], ["天草", 32.4586, 130.1931], ["八代", 32.5075, 130.6017],
  ["別府", 33.2846, 131.4914], ["延岡", 32.5822, 131.6650], ["都城", 31.7196, 131.0617], ["霧島", 31.7408, 130.7631],
  ["名護", 26.5916, 127.9775], ["沖縄", 26.3343, 127.8056]
];

const radar = {
  active: false, inited: false, zoom: 8, centerX: 0, centerY: 0,
  times: [], index: 0, lastObs: -1, issued: null, timesAt: 0, loadingTimes: false,
  playing: false, timer: null, refreshTimer: null, cityId: null,
  baseStore: new Map(), baseKind: null, frames: new Map(),
  series: null, seriesBusy: false, sampleFailed: null, toastTimer: null
};

function lon2px(lon, z) { return (lon + 180) / 360 * TILE * Math.pow(2, z); }
function lat2px(lat, z) {
  const r = Math.max(-85.05, Math.min(85.05, lat)) * Math.PI / 180;
  return (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * TILE * Math.pow(2, z);
}
function px2lat(py, z) {
  const n = Math.PI - 2 * Math.PI * py / (TILE * Math.pow(2, z));
  return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** "20261004T045000" (UTC) → Date */
function parseJmaTime(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})$/.exec(String(s || ""));
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
}
function jstClock(date) {
  if (!date) return "--:--";
  try {
    return new Intl.DateTimeFormat("ja-JP", { timeZone: JST, hour: "2-digit", minute: "2-digit" }).format(date);
  } catch (e) { return "--:--"; }
}
function tpl(url, z, x, y) { return url.replace("{z}", z).replace("{x}", x).replace("{y}", y); }
function nowcUrl(t, z, x, y) {
  return NOWC_BASE + t.basetime + "/none/" + t.validtime + "/surf/hrpns/" + z + "/" + x + "/" + y + ".png";
}

/** 実況（N1）の直近1時間と、予測（N2）の1時間先までを時系列に並べる */
async function loadRadarTimes() {
  const grab = async (file, kind) => {
    try {
      const arr = await getJson(NOWC_BASE + file, 12000);
      return (Array.isArray(arr) ? arr : [])
        .filter(e => e && /^\d{8}T\d{6}$/.test(String(e.basetime)) && /^\d{8}T\d{6}$/.test(String(e.validtime)))
        .map(e => ({ basetime: String(e.basetime), validtime: String(e.validtime), kind: kind }));
    } catch (e) { return []; }
  };
  const [obs, fc] = await Promise.all([grab("targetTimes_N1.json", "obs"), grab("targetTimes_N2.json", "fc")]);
  const byTime = (a, b) => a.validtime < b.validtime ? -1 : a.validtime > b.validtime ? 1 : 0;
  obs.sort(byTime);
  const lastObs = obs[obs.length - 1];
  // 予測は最新の実況より先のものだけ、同じ基準時刻のものを使う
  const fcAfter = fc.filter(t => !lastObs || t.validtime > lastObs.validtime).sort(byTime);
  const issued = fcAfter.length ? fcAfter[0].basetime : (lastObs ? lastObs.basetime : null);
  const sameBase = fcAfter.filter(t => t.basetime === issued);
  const PAST = 4;   // 現在＋15分前まで
  const times = obs.slice(-PAST).concat(sameBase.slice(0, 12));
  return { times: times, lastObs: obs.length ? Math.min(obs.length, PAST) - 1 : -1, issued: issued };
}

function radarView() {
  const map = $("#radarMap");
  const w = map.clientWidth || 640, h = map.clientHeight || 640;
  const left = radar.centerX - w / 2, top = radar.centerY - h / 2;
  return {
    w: w, h: h, left: left, top: top,
    x0: Math.floor(left / TILE), x1: Math.floor((left + w) / TILE),
    y0: Math.floor(top / TILE),  y1: Math.floor((top + h) / TILE)
  };
}

/**
 * レイヤーのタイルを差分で並べ直す。既にあるタイルは位置だけ動かすので、
 * ドラッグ中もちらつかず、読み込み直しも起きない。
 */
function syncTiles(layer, store, urlFor, fbFor, stats) {
  const v = radarView();
  const z = radar.zoom, max = Math.pow(2, z);
  const want = new Set();
  for (let y = v.y0; y <= v.y1; y++) {
    if (y < 0 || y >= max) continue;
    for (let x = v.x0; x <= v.x1; x++) {
      const tx = ((x % max) + max) % max;    // 経度方向は巡回させる
      const key = z + "/" + x + "/" + y;
      want.add(key);
      let img = store.get(key);
      if (!img) {
        img = document.createElement("img");
        img.alt = "";
        img.decoding = "async";
        img.draggable = false;
        if (stats) stats.total++;
        img.addEventListener("load", () => { if (stats) { stats.loaded++; stats.onChange && stats.onChange(); } });
        img.addEventListener("error", () => {
          const fb = fbFor ? fbFor(z, tx, y) : null;
          if (fb && !img.dataset.fb) { img.dataset.fb = "1"; img.src = fb; return; }
          img.style.visibility = "hidden";
          if (stats) { stats.failed++; stats.onChange && stats.onChange(); }
        });
        img.src = urlFor(z, tx, y);
        store.set(key, img);
        layer.appendChild(img);
      }
      img.style.left = (x * TILE - v.left) + "px";
      img.style.top = (y * TILE - v.top) + "px";
    }
  }
  store.forEach((img, key) => {
    if (!want.has(key)) { img.remove(); store.delete(key); }
  });
}

function paintBase() {
  const kind = BASEMAPS[state.radarBase] ? state.radarBase : "photo";
  const bm = BASEMAPS[kind];
  const layer = $("#radarBase");
  if (radar.baseKind !== kind) {
    radar.baseStore.forEach(img => img.remove());
    radar.baseStore.clear();
    radar.baseKind = kind;
    $("#page-radar").classList.toggle("is-photo", !!bm.dark);
  }
  syncTiles(layer, radar.baseStore, (z, x, y) => tpl(bm.url, z, x, y), bm.fb ? (z, x, y) => tpl(bm.fb, z, x, y) : null);
}

/** 時刻ごとに降水レイヤーを持ち、表示を切り替えるだけで再生できるようにする */
function frameFor(i) {
  const t = radar.times[i];
  if (!t) return null;
  let f = radar.frames.get(t.validtime);
  if (!f) {
    const el = document.createElement("div");
    el.className = "radar-layer rain-frame";
    el.hidden = true;
    $("#radarRain").appendChild(el);
    f = { el: el, store: new Map(), stats: { total: 0, loaded: 0, failed: 0 }, t: t };
    f.stats.onChange = () => { if (radar.times[radar.index] === t) checkRainFailure(f); };
    radar.frames.set(t.validtime, f);
  }
  return f;
}
function syncFrame(f) {
  syncTiles(f.el, f.store, (z, x, y) => nowcUrl(f.t, z, x, y), null, f.stats);
}
function checkRainFailure(f) {
  if (f.stats.total > 0 && f.stats.failed >= f.stats.total) {
    showRadarMsg("雨雲のタイルを取得できませんでした。気象庁側の仕様変更の可能性があります。地図のみ表示しています。");
  } else if (f.stats.loaded > 0) {
    hideRadarMsg();
  }
}

function paintRain() {
  const cur = frameFor(radar.index);
  radar.frames.forEach(f => { f.el.hidden = f !== cur; });
  if (!cur) return;
  syncFrame(cur);
  // 再生中は次のコマを先読みしておく
  if (radar.playing) {
    const next = frameFor((radar.index + 1) % radar.times.length);
    if (next && next !== cur) syncFrame(next);
  }
}

/** 地名・選択中の地点・縮尺 */
function paintOverlay() {
  const v = radarView();
  const z = radar.zoom;
  const target = CITY_BY_ID.get(radar.cityId);
  const items = [];
  CITIES.forEach(c => items.push({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, rank: c.pin ? 0 : 1 }));
  state.custom.forEach(c => { if (c.id !== CURRENT_LOCATION_ID) items.push({ id: c.id, name: c.name, lat: c.lat, lon: c.lon, rank: 1 }); });
  MAP_LABELS.forEach(l => items.push({ id: null, name: l[0], lat: l[1], lon: l[2], rank: 2 }));
  const maxRank = z <= 6 ? 0 : z <= 7 ? 1 : 2;

  const boxes = [];
  const overlaps = b => boxes.some(o => b.x1 < o.x2 && b.x2 > o.x1 && b.y1 < o.y2 && b.y2 > o.y1);
  const mr = $("#radarMap").getBoundingClientRect();
  document.querySelectorAll("#page-radar .rv-now, #page-radar .rv-legend, #page-radar .rv-tools, #page-radar .rv-cards, #page-radar .rv-timeline")
    .forEach(el => {
      const r = el.getBoundingClientRect();
      if (r.width && r.height) boxes.push({ x1: r.left - mr.left - 4, x2: r.right - mr.left + 4, y1: r.top - mr.top - 4, y2: r.bottom - mr.top + 4 });
    });
  let tx = null, ty = null;
  if (target) {
    tx = lon2px(target.lon, z) - v.left;
    ty = lat2px(target.lat, z) - v.top;
    const tw = placeName(target).length * 17 + 30;
    boxes.push({ x1: tx - tw / 2, x2: tx + tw / 2, y1: ty - 14, y2: ty + 40 });
  }
  let html = "";
  items.sort((a, b) => a.rank - b.rank).forEach(it => {
    if (it.rank > maxRank || (target && it.id === target.id)) return;
    const x = lon2px(it.lon, z) - v.left, y = lat2px(it.lat, z) - v.top;
    if (x < -40 || y < -20 || x > v.w + 40 || y > v.h + 20) return;
    const w = it.name.length * (it.rank === 0 ? 15 : 13) + 18;
    const b = { x1: x - 7, x2: x - 7 + w, y1: y - 11, y2: y + 11 };
    if (b.x1 < 2 || b.x2 > v.w - 2 || b.y1 < 2 || b.y2 > v.h - 2 || overlaps(b)) return;
    boxes.push(b);
    const tag = it.id ? "button" : "span";
    html += '<' + tag + (it.id ? ' type="button" data-rcity="' + esc(it.id) + '"' : "")
      + ' class="rv-label r' + it.rank + '" style="left:' + x.toFixed(1) + 'px;top:' + y.toFixed(1) + 'px">'
      + '<i></i>' + esc(it.name) + '</' + tag + '>';
  });
  $("#radarLabels").innerHTML = html;

  const me = $("#radarMe");
  if (target && tx !== null) {
    me.hidden = false;
    me.style.left = tx.toFixed(1) + "px";
    me.style.top = ty.toFixed(1) + "px";
    me.querySelector(".name").textContent = placeName(target);
  } else {
    me.hidden = true;
  }
  paintScale(v);
}

function paintScale(v) {
  const lat = px2lat(radar.centerY, radar.zoom);
  const mpp = 156543.03392 * Math.cos(lat * Math.PI / 180) / Math.pow(2, radar.zoom);
  const target = mpp * 90;
  const nice = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000, 200000, 500000];
  let d = nice[0];
  nice.forEach(n => { if (n <= target) d = n; });
  const el = $("#rvScale");
  el.querySelector(".bar").style.width = Math.round(d / mpp) + "px";
  el.querySelector(".txt").textContent = d >= 1000 ? (d / 1000) + " km" : d + " m";
}

function paintRadar() {
  if (!radar.active) return;
  layoutRadarTools();
  paintBase();
  paintRain();
  paintOverlay();
  updateTimeline();
}

/**
 * 右側のボタン群を、上のカードと下のパネルのあいだに収める。
 * 背の低い画面では小さい版に切り替えて、カードと重ならないようにする。
 */
function layoutRadarTools() {
  const page = $("#page-radar");
  if (page.hidden) return;
  const pr = page.getBoundingClientRect();
  const top = $("#rvNow").getBoundingClientRect().bottom - pr.top;
  const bottom = $("#rvScale").getBoundingClientRect().top - pr.top;
  const tools = $("#page-radar .rv-tools");
  page.classList.remove("tools-compact");
  let h = tools.offsetHeight;
  if (bottom - top < h + 24) {
    page.classList.add("tools-compact");
    h = tools.offsetHeight;
  }
  const room = bottom - top - h;
  tools.style.top = Math.round(top + Math.max(8, room / 2)) + "px";
}

function showRadarMsg(msg) { const el = $("#radarMsg"); el.hidden = false; el.textContent = msg; }
function hideRadarMsg() { $("#radarMsg").hidden = true; }
function radarToast(msg) {
  const el = $("#rvToast");
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(radar.toastTimer);
  radar.toastTimer = setTimeout(() => { el.hidden = true; }, 4000);
}

/* ---- 時刻スライダー ---- */
function minutesFromNow(i) {
  const t = radar.times[i], t0 = radar.times[radar.lastObs];
  if (!t || !t0) return 0;
  return Math.round((parseJmaTime(t.validtime) - parseJmaTime(t0.validtime)) / 60000);
}
function buildTicks() {
  const n = radar.times.length;
  const slider = $("#radarTime");
  slider.max = String(Math.max(0, n - 1));
  let html = "";
  if (n > 1 && radar.lastObs >= 0) {
    [0, 15, 30, 45, 60].forEach(m => {
      const i = radar.times.findIndex((t, k) => k >= radar.lastObs && minutesFromNow(k) === m);
      if (i < 0) return;
      html += '<span class="rv-tick' + (m === 0 ? " now" : "") + '" style="left:' + (i / (n - 1) * 100).toFixed(2) + '%">'
        + (m === 0 ? "現在" : m + "分後") + '</span>';
    });
  }
  $("#rvTicks").innerHTML = html;
  $("#rvIssued").textContent = radar.issued ? jstClock(parseJmaTime(radar.issued)) + " 発表" : "";
}
function updateTimeline() {
  const n = radar.times.length;
  const slider = $("#radarTime");
  slider.value = String(radar.index);
  slider.style.setProperty("--p", (n > 1 ? radar.index / (n - 1) * 100 : 0) + "%");
  const t = radar.times[radar.index];
  const clock = $("#radarClock");
  if (!t) { clock.textContent = ""; return; }
  const m = minutesFromNow(radar.index);
  clock.textContent = jstClock(parseJmaTime(t.validtime))
    + (m === 0 ? "（現在）" : m > 0 ? "（" + m + "分後の予測）" : "（" + (-m) + "分前）");
}

async function reloadRadarTimes() {
  if (radar.loadingTimes) return;
  radar.loadingTimes = true;
  const keep = radar.times[radar.index] && radar.index !== radar.lastObs ? radar.times[radar.index].validtime : null;
  try {
    const r = await loadRadarTimes();
    radar.timesAt = Date.now();
    if (!r.times.length) {
      radar.times = []; radar.lastObs = -1; radar.issued = null;
      showRadarMsg("雨雲の観測時刻を取得できませんでした。地図のみ表示しています。");
    } else {
      radar.times = r.times; radar.lastObs = r.lastObs; radar.issued = r.issued;
      const kept = keep ? radar.times.findIndex(t => t.validtime === keep) : -1;
      radar.index = kept >= 0 ? kept : Math.max(0, radar.lastObs);
      // 使わなくなった時刻のレイヤーを捨てる
      const live = new Set(radar.times.map(t => t.validtime));
      radar.frames.forEach((f, k) => { if (!live.has(k)) { f.el.remove(); radar.frames.delete(k); } });
      hideRadarMsg();
    }
  } finally {
    radar.loadingTimes = false;
  }
  buildTicks();
  paintRadar();
  radar.series = null;
  updateRadarSeries();
}

function stopRadarPlay() {
  radar.playing = false;
  if (radar.timer) { clearInterval(radar.timer); radar.timer = null; }
  const b = $("#radarPlay");
  if (b) {
    b.setAttribute("aria-label", "再生");
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13l11-6.5z"/></svg>';
  }
}
function startRadarPlay() {
  if (radar.times.length < 2) return;
  radar.playing = true;
  const b = $("#radarPlay");
  b.setAttribute("aria-label", "停止");
  b.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M7 5h3.6v14H7zM13.4 5H17v14h-3.6z"/></svg>';
  radar.timer = setInterval(() => {
    radar.index = (radar.index + 1) % radar.times.length;
    paintRain();
    updateTimeline();
  }, 650);
}

/* ---- 地点の雨の見通し（ナウキャストの色を読み取る）---- */
let sampleCanvas = null;
const sampleCache = new Map();

function nearestLevel(r, g, b) {
  let best = 0, bestD = Infinity;
  for (let i = 1; i < RAIN_LEVELS.length; i++) {
    const c = RAIN_LEVELS[i].rgb;
    const d = (r - c[0]) * (r - c[0]) + (g - c[1]) * (g - c[1]) + (b - c[2]) * (b - c[2]);
    if (d < bestD) { bestD = d; best = i; }
  }
  return best;
}

async function sampleLevel(t, lat, lon) {
  const z = SAMPLE_ZOOM;
  const px = lon2px(lon, z), py = lat2px(lat, z);
  const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE);
  const ix = Math.floor(px - tx * TILE), iy = Math.floor(py - ty * TILE);
  const url = nowcUrl(t, z, tx, ty);
  const key = url + "|" + ix + "|" + iy;
  if (sampleCache.has(key)) return sampleCache.get(key);

  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  const bmp = await createImageBitmap(await res.blob());
  if (!sampleCanvas) {
    sampleCanvas = document.createElement("canvas");
    sampleCanvas.width = TILE; sampleCanvas.height = TILE;
  }
  const ctx = sampleCanvas.getContext("2d", { willReadFrequently: true });
  ctx.clearRect(0, 0, TILE, TILE);
  ctx.drawImage(bmp, 0, 0, TILE, TILE);   // 寸法が違うタイルでも位置がずれないよう 256px に合わせる
  // 地点のまわり 5×5 ピクセル（約 3km 四方）でいちばん強い雨を採る
  const x0 = Math.max(0, Math.min(TILE - 5, ix - 2)), y0 = Math.max(0, Math.min(TILE - 5, iy - 2));
  const data = ctx.getImageData(x0, y0, 5, 5).data;
  let level = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 40) continue;
    level = Math.max(level, nearestLevel(data[i], data[i + 1], data[i + 2]));
  }
  if (sampleCache.size > 400) sampleCache.clear();
  sampleCache.set(key, level);
  return level;
}

function levelFromMm(mm) {
  if (typeof mm !== "number" || mm <= 0) return 0;
  return mm < 1 ? 1 : mm < 5 ? 2 : mm < 10 ? 3 : mm < 20 ? 4 : mm < 30 ? 5 : mm < 50 ? 6 : mm < 80 ? 7 : 8;
}

/** ナウキャストが使えないときの代わり（Open-Meteo の1時間値。前1時間の降水量なので、次の正時の値を使う） */
function modelSeries(city) {
  const d = state.data.get(city.id);
  if (!d || !d.hours.length) return null;
  const now = Date.now();
  const i = d.hours.findIndex(h => { const t = parseLocal(h.time); return t && t.getTime() > now; });
  if (i < 0) return null;
  const a = levelFromMm(d.hours[i].precip), b = levelFromMm(d.hours[i + 1] ? d.hours[i + 1].precip : null);
  return {
    forCity: city.id, source: "model", at: new Date(now),
    points: [{ min: 0, level: a }, { min: 10, level: a }, { min: 30, level: a }, { min: 60, level: b }]
  };
}

function makeHeadline(series) {
  const p = series.points;
  const cur = p[0].level;
  const later = fn => p.find((x, i) => i > 0 && fn(x));
  let title, advice, notify = false;
  if (cur === 0) {
    const start = later(x => x.level >= 2);
    if (start) {
      title = start.min + "分後に雨が降り出します";
      advice = start.level >= 5 ? "強い雨のおそれ。外出の際は雨具をご準備ください。" : "外出の際は、雨具をご準備ください。";
      notify = true;
    } else if (later(x => x.level === 1)) {
      title = "弱い雨がぱらつく程度です";
      advice = "念のため折りたたみ傘があると安心です。";
    } else {
      title = "この先1時間は雨の心配はありません";
      advice = "傘はなくても大丈夫そうです。";
    }
  } else {
    const up = later(x => x.level > cur && x.level >= 3);
    const stopAt = p.findIndex((x, i) => i > 0 && x.level === 0 && p.slice(i).every(y => y.level === 0));
    if (up) {
      title = up.min + "分後に雨が強まります";
      advice = up.level >= 5 ? "強い雨のおそれ。外出の際は雨具をご準備ください。" : "外出の際は、雨具をご準備ください。";
      notify = true;
    } else if (stopAt > 0) {
      title = p[stopAt].min + "分後に雨がやむ見込みです";
      advice = "それまでは傘をお持ちください。";
    } else {
      title = "この先1時間は雨が続く見込みです";
      advice = "外出の際は傘をお持ちください。";
      notify = cur >= 4;
    }
  }
  return { title: title, advice: advice, notify: notify };
}

async function updateRadarSeries() {
  const city = CITY_BY_ID.get(radar.cityId);
  if (!city) return;
  const t0 = radar.times[radar.lastObs];
  const key = city.id + "|" + (t0 ? t0.validtime : "none");
  if (radar.series && radar.series.key === key && radar.series.source === "nowcast") { renderRadarPanel(); return; }
  if (radar.seriesBusy === key) return;
  radar.seriesBusy = key;

  let series = null;
  // 同じ時刻で一度読み取りに失敗していたら、時刻一覧が更新されるまで再試行しない
  const sampleKey = t0 ? t0.validtime : null;
  if (t0 && radar.sampleFailed !== sampleKey) {
    const list = radar.times.slice(radar.lastObs);
    try {
      const base = parseJmaTime(t0.validtime);
      const points = await Promise.all(list.map(async t => ({
        min: Math.round((parseJmaTime(t.validtime) - base) / 60000),
        level: await sampleLevel(t, city.lat, city.lon)
      })));
      series = { forCity: city.id, source: "nowcast", at: base, points: points };
    } catch (e) {
      series = null;   // 色を読み取れない → 数値予報の1時間値に切り替える
      radar.sampleFailed = sampleKey;
    }
  }
  if (!series) series = modelSeries(city);
  if (series) { series.key = key; series.headline = makeHeadline(series); }
  if (radar.seriesBusy === key) radar.seriesBusy = false;
  if (radar.cityId !== city.id) return;     // 待っている間に地点が変わった
  radar.series = series;
  renderRadarPanel();
  updateNewsBadge();
}

/* ---- 画面上のカード ---- */
const ALERT_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#e5484d"/>'
  + '<path d="M12 6.5v7" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/><circle cx="12" cy="17.3" r="1.6" fill="#fff"/></svg>';
const OK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="#2f9e6a"/>'
  + '<path d="M7 12.4l3.2 3.2L17 8.8" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** 実況で雨が無いときに、数値予報の雨・雪のコードを「くもり」に読み替える */
function dryCode(code) {
  return typeof code === "number" && code >= 51 ? 3 : code;
}

function levelIcon(level, fallbackCode) {
  if (level <= 0) return wmo(fallbackCode === null || fallbackCode === undefined ? 1 : dryCode(fallbackCode)).icon;
  if (level === 1) return "drizzle";
  if (level <= 3) return "rain";
  return "shower";
}

function rainMeter(level) {
  let html = '<span class="rv-meter" aria-hidden="true">';
  for (let i = 1; i < RAIN_LEVELS.length; i++) {
    html += '<i style="' + (i <= level ? "background:" + RAIN_LEVELS[i].color : "") + '"></i>';
  }
  return html + '</span>';
}

/** 現在地は「現在地」ではなく最寄りの地名で見せる（位置アイコンで現在地だと分かる） */
function placeName(city) {
  return city && city.isCurrent && city.nearName ? city.nearName : city ? city.name : "";
}

function renderRadarPanel() {
  const city = CITY_BY_ID.get(radar.cityId);
  if (!city) return;
  const d = state.data.get(city.id);
  const s = radar.series && radar.series.forCity === city.id ? radar.series : null;
  const curLevel = s ? s.points[0].level : 0;
  const code = d ? d.now.code : null;
  const cond = s && curLevel > 0 ? RAIN_LEVELS[curLevel].label
    : d ? wmo(s && s.source === "nowcast" ? dryCode(code) : code).label : "—";
  const when = s ? jstClock(s.at) : d && d.now.time ? fmtClock(d.now.time) : "--:--";
  const h = s ? s.headline : null;

  $("#rvNow").innerHTML =
    '<span class="rv-now-left">'
    + '<span class="rv-now-icon">' + icon(levelIcon(curLevel, code), 64) + '</span>'
    + '<span class="rv-now-text">'
    +   '<span class="rv-place">' + (city.isCurrent
          ? '<svg viewBox="0 0 24 24" aria-label="現在地"><path d="M20.5 3.5 3.8 10.6l7 2.4 2.4 7z" fill="currentColor"/></svg>'
          : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 22s7-6.4 7-12a7 7 0 1 0-14 0c0 5.6 7 12 7 12z" fill="currentColor"/><circle cx="12" cy="10" r="2.6" fill="#16233c"/></svg>')
    +     esc(placeName(city)) + '</span>'
    +   '<span class="rv-when">' + esc(when) + ' 現在</span>'
    +   '<span class="rv-temp"><b class="tnum">' + (d ? fmtTemp(d.now.temp) : "—") + '</b><small>' + unitLabel() + '</small>'
    +     '<em>' + esc(cond) + '</em></span>'
    + '</span></span>'
    + '<span class="rv-now-right">'
    +   '<span class="rv-head">' + esc(h ? h.title : "雨の見通しを計算しています…") + '</span>'
    +   (h ? '<span class="rv-advice">' + (h.notify ? ALERT_SVG : OK_SVG) + '<span>' + esc(h.advice) + '</span></span>' : "")
    +   (s && s.source === "model" ? '<span class="rv-src">数値予報（1時間値）による目安</span>' : "")
    + '</span>'
    + '<svg class="rv-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  $("#rvNow").setAttribute("aria-label", city.name + "の天気を開く");

  $("#rvCards").innerHTML = [10, 30, 60].map(m => {
    let pt = null;
    if (s) s.points.forEach(p => { if (p.min <= m + 2 && (!pt || p.min > pt.min)) pt = p; });
    const lv = pt ? pt.level : null;
    return '<div class="rv-card">'
      + '<div class="rv-card-when">' + m + '分後</div>'
      + '<div class="rv-card-body">'
      +   '<span class="rv-card-icon">' + icon(lv === null ? "cloud" : levelIcon(lv, code), 46) + '</span>'
      +   '<span><span class="rv-card-lv">' + (lv === null ? "—" : esc(RAIN_LEVELS[lv].label)) + '</span>'
      +   '<span class="rv-card-mm tnum">' + (lv === null ? "" : esc(RAIN_LEVELS[lv].range)) + '</span></span>'
      + '</div>' + rainMeter(lv || 0) + '</div>';
  }).join("");
}

function buildLegend() {
  const segs = RAIN_LEVELS.slice(1).map(l => '<i style="background:' + l.color + '"></i>').join("");
  $("#rvLegend").innerHTML = '<div class="rv-legend-cap">降水の強さ</div>'
    + '<div class="rv-legend-bar">' + segs + '</div>'
    + '<div class="rv-legend-lbl"><span>弱い雨</span><span>やや強い雨</span><span>強い雨</span><span>非常に激しい雨</span></div>';
}

/* ---- 地点の選択・画面の出入り ---- */
function setRadarCity(id, recenter) {
  const city = CITY_BY_ID.get(id);
  if (!city) return;
  radar.cityId = id;
  if (state.radarCity !== id) { state.radarCity = id; saveState(); }
  if (recenter) {
    radar.centerX = lon2px(city.lon, radar.zoom);
    radar.centerY = lat2px(city.lat, radar.zoom);
  }
  radar.series = null;
  if (!state.data.has(id) && !state.errors.has(id)) {
    fetchCities([city]).then(() => { if (radar.cityId === id) { renderRadarPanel(); updateRadarSeries(); } });
  }
  paintRadar();
  renderRadarPanel();
  updateRadarSeries();
}

function defaultRadarCity() {
  if (state.custom.some(c => c.id === CURRENT_LOCATION_ID)) return CURRENT_LOCATION_ID;
  return state.radarCity && CITY_BY_ID.has(state.radarCity) ? state.radarCity
    : (state.pinned[0] || state.selected[0] || CITIES[0].id);
}

function enterRadar(cityId) {
  radar.active = true;
  if (!radar.inited) {
    buildLegend();
    radar.inited = true;
    setRadarCity(cityId || defaultRadarCity(), true);
  } else if (cityId) {
    setRadarCity(cityId, true);
  } else {
    paintRadar();
    renderRadarPanel();
  }
  if (!radar.times.length || Date.now() - radar.timesAt > 4 * 60 * 1000) reloadRadarTimes();
  if (!radar.refreshTimer) {
    radar.refreshTimer = setInterval(() => { if (!document.hidden && radar.active) reloadRadarTimes(); }, 5 * 60 * 1000);
  }
}

function leaveRadar() {
  stopRadarPlay();
  radar.active = false;
  if (radar.refreshTimer) { clearInterval(radar.refreshTimer); radar.refreshTimer = null; }
  $("#rvLayers").hidden = true;
}

/* ---- 操作（ドラッグ・ピンチ・ホイール・ダブルクリック）---- */
function radarZoomAt(delta, cx, cy) {
  const next = Math.max(RADAR_ZOOM_MIN, Math.min(RADAR_ZOOM_MAX, radar.zoom + delta));
  if (next === radar.zoom) return;
  const v = radarView();
  const ax = cx === undefined ? v.w / 2 : cx, ay = cy === undefined ? v.h / 2 : cy;
  const scale = Math.pow(2, next - radar.zoom);
  const wx = v.left + ax, wy = v.top + ay;
  radar.centerX = wx * scale - ax + v.w / 2;
  radar.centerY = wy * scale - ay + v.h / 2;
  radar.zoom = next;
  paintRadar();
}

function bindRadarGestures() {
  const map = $("#radarMap");
  const pts = new Map();
  let lastX = 0, lastY = 0, moved = 0, captured = false, pinchBase = 0;
  const dist = () => { const a = Array.from(pts.values()); return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };

  map.addEventListener("pointerdown", ev => {
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size === 1) { lastX = ev.clientX; lastY = ev.clientY; moved = 0; captured = false; }
    if (pts.size === 2) pinchBase = dist();
  });
  map.addEventListener("pointermove", ev => {
    if (!pts.has(ev.pointerId)) return;
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size === 2) {
      const d = dist(), r = map.getBoundingClientRect();
      const a = Array.from(pts.values());
      const mx = (a[0].x + a[1].x) / 2 - r.left, my = (a[0].y + a[1].y) / 2 - r.top;
      if (pinchBase && d / pinchBase > 1.45) { radarZoomAt(1, mx, my); pinchBase = d; }
      else if (pinchBase && d / pinchBase < 0.69) { radarZoomAt(-1, mx, my); pinchBase = d; }
      return;
    }
    const dx = ev.clientX - lastX, dy = ev.clientY - lastY;
    lastX = ev.clientX; lastY = ev.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    // 少し動いてからつかむ（そのまま離せば地名のタップとして扱える）
    if (!captured && moved > 5) {
      captured = true;
      try { map.setPointerCapture(ev.pointerId); } catch (e) { /* 取れなくても動作する */ }
      map.classList.add("dragging");
    }
    if (!captured) return;
    radar.centerX -= dx;
    radar.centerY -= dy;
    paintBase();
    paintRain();
    paintOverlay();
  });
  const end = ev => {
    pts.delete(ev.pointerId);
    if (pts.size < 2) pinchBase = 0;
    if (!pts.size) map.classList.remove("dragging");
    try { map.releasePointerCapture(ev.pointerId); } catch (e) { /* 解放済みなら無視 */ }
  };
  map.addEventListener("pointerup", end);
  map.addEventListener("pointercancel", end);

  let wheelAcc = 0, wheelAt = 0;
  map.addEventListener("wheel", ev => {
    ev.preventDefault();
    wheelAcc += ev.deltaY;
    const now = Date.now();
    if (Math.abs(wheelAcc) < 60 || now - wheelAt < 220) return;
    const r = map.getBoundingClientRect();
    radarZoomAt(wheelAcc < 0 ? 1 : -1, ev.clientX - r.left, ev.clientY - r.top);
    wheelAcc = 0; wheelAt = now;
  }, { passive: false });
  map.addEventListener("dblclick", ev => {
    const r = map.getBoundingClientRect();
    radarZoomAt(1, ev.clientX - r.left, ev.clientY - r.top);
  });
}

/* ============================================================
 * 8. イベント
 * ============================================================ */
function applyTheme() {
  document.documentElement.setAttribute("data-theme", state.theme);
  const t = state.theme;
  $("#themeBtn").title = "テーマ: " + (t === "auto" ? "OS設定に従う" : t === "light" ? "ライト" : "ダーク");
}

document.addEventListener("click", ev => {
  const pin = ev.target.closest("[data-pin]");
  if (pin) {
    const id = pin.getAttribute("data-pin");
    const i = state.pinned.indexOf(id);
    if (i >= 0) state.pinned.splice(i, 1); else state.pinned.push(id);
    saveState(); render();
    return;
  }
  const dayBtn = ev.target.closest("[data-day]");
  if (dayBtn && state.openCity) {
    selectDay(state.openCity, parseInt(dayBtn.getAttribute("data-day"), 10));
    return;
  }

  const open = ev.target.closest("[data-open]");
  if (open) { openSheet(open.getAttribute("data-open")); return; }

  const add = ev.target.closest("[data-add]");
  if (add) { addSearchedCity(add); return; }

  const rm = ev.target.closest("[data-remove]");
  if (rm) { removeCustomCity(rm.getAttribute("data-remove")); return; }

  const toggle = ev.target.closest("[data-toggle]");
  if (toggle) {
    const id = toggle.getAttribute("data-toggle");
    const i = state.selected.indexOf(id);
    if (i >= 0) {
      state.selected.splice(i, 1);
      const p = state.pinned.indexOf(id);
      if (p >= 0) state.pinned.splice(p, 1);
    } else {
      state.selected.push(id);
      saveState(); render();
      refresh(false);
      return;
    }
    saveState(); render();
    return;
  }

  const th = ev.target.closest("th.sortable");
  if (th) {
    const key = th.getAttribute("data-sort");
    state.tableSort = state.tableSort.key === key
      ? { key: key, dir: -state.tableSort.dir } : { key: key, dir: key === "name" ? 1 : -1 };
    renderTable();
    return;
  }

  if (ev.target.closest("#retryBtn")) { refresh(true); return; }

  const radarOpen = ev.target.closest("[data-radar]");
  if (radarOpen) { setTab("radar", { cityId: radarOpen.getAttribute("data-radar") }); return; }

  const rcity = ev.target.closest("[data-rcity]");
  if (rcity) { setRadarCity(rcity.getAttribute("data-rcity"), false); return; }

  const tabBtn = ev.target.closest(".tabbar [data-tab]");
  if (tabBtn) { setTab(tabBtn.getAttribute("data-tab")); return; }

  const go = ev.target.closest("[data-goto]");
  if (go) {
    setTab(go.getAttribute("data-goto"));
    if (go.hasAttribute("data-picker")) openPicker();
    return;
  }

  const geo = ev.target.closest("[data-geo]");
  if (geo && geo.id !== "rvLocate") {   // レーダーの現在地ボタンは専用の処理がある
    const inMenu = geo.hasAttribute("data-geo-menu");
    requestCurrentLocation(inMenu ? { status: msg => { const m = $("#menuMsg"); if (m) { m.hidden = false; m.textContent = msg; } } } : undefined);
    return;
  }

  const set = ev.target.closest("[data-set]");
  if (set) { applySetting(set.getAttribute("data-set"), set.getAttribute("data-val")); return; }

  if (ev.target.closest("#installBtn") && installPrompt) {
    installPrompt.prompt();
    installPrompt.userChoice.finally(() => { installPrompt = null; renderMenu(); });
    return;
  }
});

/** メニュー・レーダーの各設定を反映する */
function applySetting(name, val) {
  if (name === "unit" && (val === "c" || val === "f")) {
    state.unit = val;
    $("#unitSel").value = val;
    render();
    if (state.tab === "weather" && state.openCity) openSheet(state.openCity, state.openDay, { keepScroll: true });
  } else if (name === "theme" && ["auto", "light", "dark"].includes(val)) {
    state.theme = val;
    applyTheme();
  } else if (name === "view" && (val === "cards" || val === "table")) {
    state.view = val;
    render();
  } else if (name === "base" && BASEMAPS[val]) {
    state.radarBase = val;
    $("#rvLayers").hidden = true;
    if (radar.active) paintRadar();
  } else {
    return;
  }
  saveState();
  if (state.tab === "menu") renderMenu();
  document.querySelectorAll('#rvLayers [data-set="base"]').forEach(b =>
    b.setAttribute("aria-pressed", String(b.getAttribute("data-val") === state.radarBase)));
}

function openPicker() {
  const p = $("#picker");
  p.hidden = false;
  $("#pickerBtn").setAttribute("aria-expanded", "true");
  p.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

document.addEventListener("keydown", ev => {
  const typing = ev.target && /^(INPUT|SELECT|TEXTAREA)$/.test(ev.target.tagName) && ev.target.type !== "range";
  if (state.tab === "radar" && !typing && !ev.metaKey && !ev.ctrlKey && !ev.altKey) {
    const pan = { ArrowLeft: [-80, 0], ArrowRight: [80, 0], ArrowUp: [0, -80], ArrowDown: [0, 80] }[ev.key];
    if (pan && ev.target.type !== "range") {
      ev.preventDefault();
      radar.centerX += pan[0]; radar.centerY += pan[1];
      paintRadar();
      return;
    }
    if (ev.key === "+" || ev.key === "=") { ev.preventDefault(); radarZoomAt(1); return; }
    if (ev.key === "-") { ev.preventDefault(); radarZoomAt(-1); return; }
    if (ev.key === " " && ev.target === document.body) { ev.preventDefault(); radar.playing ? stopRadarPlay() : startRadarPlay(); return; }
    if (ev.key === "Escape") { $("#rvLayers").hidden = true; return; }
  }
  if (ev.key === "Enter" || ev.key === " ") {
    const row = ev.target.closest && ev.target.closest("tr[data-open]");
    if (row) { ev.preventDefault(); openSheet(row.getAttribute("data-open")); }
  }
});

$("#searchForm").addEventListener("submit", ev => {
  ev.preventDefault();
  const q = $("#searchInput").value.trim();
  if (q.length >= 1) searchPlaces(q);
});

$("#refreshBtn").addEventListener("click", () => refresh(true));
$("#viewCards").addEventListener("click", () => { state.view = "cards"; saveState(); render(); });
$("#viewTable").addEventListener("click", () => { state.view = "table"; saveState(); render(); });
$("#sortSel").addEventListener("change", e => { state.sort = e.target.value; saveState(); render(); });
$("#unitSel").addEventListener("change", e => applySetting("unit", e.target.value));
$("#themeBtn").addEventListener("click", () =>
  applySetting("theme", state.theme === "auto" ? "light" : state.theme === "light" ? "dark" : "auto"));
$("#radarBtn").addEventListener("click", () => setTab("radar"));
$("#radarPlay").addEventListener("click", () => { radar.playing ? stopRadarPlay() : startRadarPlay(); });
$("#radarTime").addEventListener("input", e => {
  stopRadarPlay();
  radar.index = parseInt(e.target.value, 10) || 0;
  paintRain();
  updateTimeline();
});
$("#radarIn").addEventListener("click", () => radarZoomAt(1));
$("#radarOut").addEventListener("click", () => radarZoomAt(-1));
$("#rvLocate").addEventListener("click", () => {
  const cur = CITY_BY_ID.get(CURRENT_LOCATION_ID);
  if (cur) setRadarCity(CURRENT_LOCATION_ID, true);
  requestCurrentLocation({ status: radarToast, done: city => setRadarCity(city.id, true) });
});
$("#rvLayerBtn").addEventListener("click", ev => {
  ev.stopPropagation();
  const box = $("#rvLayers");
  box.hidden = !box.hidden;
  box.querySelectorAll('[data-set="base"]').forEach(b =>
    b.setAttribute("aria-pressed", String(b.getAttribute("data-val") === state.radarBase)));
});
$("#rvNow").addEventListener("click", () => { if (radar.cityId) setTab("weather", { cityId: radar.cityId }); });
bindRadarGestures();

$("#pickerBtn").addEventListener("click", () => {
  const p = $("#picker");
  p.hidden = !p.hidden;
  $("#pickerBtn").setAttribute("aria-expanded", String(!p.hidden));
  if (!p.hidden) p.scrollIntoView({ behavior: "smooth", block: "nearest" });
});

/* ============================================================
 * 9. 起動
 * ============================================================ */
loadState();
applyTheme();
$("#sortSel").value = state.sort;
$("#unitSel").value = state.unit;
loadCache();          // 直近のキャッシュがあれば即座に表示（オフラインでも中身が見える）
render();
const hashTab = (location.hash || "").slice(1);
setTab(TABS.indexOf(hashTab) >= 0 ? hashTab : state.tab);
refresh(false);

window.addEventListener("hashchange", () => {
  const t = (location.hash || "").slice(1);
  if (TABS.indexOf(t) >= 0 && t !== state.tab) setTab(t);
});

let radarResizeTimer = null;
window.addEventListener("resize", () => {
  if (!radar.active) return;
  clearTimeout(radarResizeTimer);
  radarResizeTimer = setTimeout(paintRadar, 150);
});

// ホーム画面に追加して、オフラインでも開けるようにする（file:// では登録しない）
if ("serviceWorker" in navigator && location.protocol.indexOf("http") === 0) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => { /* 登録できなくても通常動作する */ });
  });
}

setInterval(() => { if (!document.hidden) refresh(false); }, AUTO_REFRESH_MS);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.fetchedAt && Date.now() - state.fetchedAt > AUTO_REFRESH_MS) refresh(false);
});
