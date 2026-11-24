/**
 * Official market catalog contract. A catalog is deliberately empty until an
 * approved source supplies verified market names and stable identifiers.
 * Do not infer official IDs from user-entered market names.
 */
export type MarketCatalogEntry = {
  id: string;
  prefecture: string;
  name: string;
  aliases: string[];
  source: 'nbafa' | 'alic' | 'market-organizer' | 'maff';
  sourceUrl: string;
  verifiedAt: string;
  active: boolean;
};

export type MarketResultPeriod = {
  marketId: string;
  periodStart: string;
  periodEnd: string;
  publishedAt: string;
  sourceUrl: string;
  sex: 'female' | 'castrated' | 'male' | 'unknown';
  breed: string;
  headCount: number | null;
  averagePriceYen: number | null;
  priceIncludesTax: boolean | null;
  status: 'preliminary' | 'final';
};

// Source: MAFF livestock market list as of July 2025, not a live calf-market status.
const MAFF_LIST_URL = 'https://www.maff.go.jp/j/syouan/tikusui/trace/attach/pdf/index-69.pdf';
function maffMarket(id: string, prefecture: string, name: string): MarketCatalogEntry {
  return { id: `maff-${id}`, prefecture, name, aliases: [], source: 'maff',
    sourceUrl: MAFF_LIST_URL, verifiedAt: '2025-07-31', active: true };
}
// 'active' means selectable, not proof of a currently operating calf market.
// Source-backed seed markets (not a nationwide complete directory).
export const verifiedMarketCatalog: readonly MarketCatalogEntry[] = Object.freeze([{
  id: 'alic-iwate-kennan',
  prefecture: '岩手県',
  name: '県南家畜市場',
  aliases: ['岩手県 県南家畜市場', '全農岩手県本部県南家畜市場'],
  source: 'alic',
  sourceUrl: 'https://www.alic.go.jp/n-jigyo/koushigeppou/koushi01kuro.pdf',
  verifiedAt: '2026-11-24',
  active: true,
},
maffMarket('iwate-hanamaki', '岩手県', '岩手花巻家畜市場'),
maffMarket('iwate-chuo', '岩手県', '全農岩手県本部中央家畜市場'),
maffMarket('miyagi-sogo', '宮城県', '全農みやぎ総合家畜市場'),
maffMarket('akita-akita', '秋田県', 'あきた総合家畜市場'),
maffMarket('aomori-chiiki', '青森県', '青森県地域家畜市場'),
maffMarket('aomori-sanbongi', '青森県', '三本木産地家畜市場'),
maffMarket('yamagata-okitama', '山形県', '置賜家畜市場'),
maffMarket('yamagata-chuo', '山形県', '山形中央家畜市場'),
maffMarket('yamagata-mogami', '山形県', '山形最上家畜市場'),
maffMarket('fukushima', '福島県', '福島県家畜市場'),
maffMarket('ibaraki-chuo', '茨城県', '茨城県中央家畜市場'),
maffMarket('tochigi-nasu', '栃木県', '那須家畜市場'),
maffMarket('tochigi-yaita', '栃木県', '矢板家畜市場'),
maffMarket('gunma-shibukawa', '群馬県', '渋川家畜市場'),
maffMarket('chiba', '千葉県', '千葉家畜市場'),
maffMarket('nagano-komoro', '長野県', '小諸家畜市場'),
maffMarket('nagano-chuo', '長野県', '長野県中央家畜市場'),
maffMarket('hyogo-awaji', '兵庫県', '淡路家畜市場'),
maffMarket('hyogo-tajima', '兵庫県', '但馬家畜市場'),
maffMarket('tottori-chuo', '鳥取県', '鳥取県中央家畜市場'),
maffMarket('list-1', '北海道', '上川家畜商業協同組合道北名寄集散地家畜市場'),
maffMarket('list-2', '北海道', '北見集散地家畜市場'),
maffMarket('list-3', '北海道', '十勝中央家畜市場'),
maffMarket('list-4', '北海道', '根室集散地家畜市場'),
maffMarket('list-5', '北海道', 'ホクレン北見地区総合家畜市場'),
maffMarket('list-6', '北海道', 'ホクレン釧路地区家畜市場'),
maffMarket('list-7', '北海道', 'ホクレン十勝地区家畜市場'),
maffMarket('list-8', '北海道', 'ホクレン根室地区家畜市場'),
maffMarket('list-9', '北海道', 'ホクレン豊富地域家畜市場'),
maffMarket('list-10', '北海道', 'ホクレン北海道中央地域家畜市場'),
maffMarket('list-11', '北海道', 'ホクレン南北海道家畜市場'),
maffMarket('list-12', '北海道', '北海道ホルスタイン家畜市場'),
maffMarket('list-13', '北海道', '紋別集散地家畜市場'),
maffMarket('list-20', '秋田県', '秋田県畜産農業協同組合　鹿角支所'),
maffMarket('list-27', '茨城県', '全農茨城県本部家畜市場'),
maffMarket('list-28', '茨城県', '大子町畜産農業協同組合（大子家畜市場）'),
maffMarket('list-32', '群馬県', '館林家畜市場'),
maffMarket('list-33', '群馬県', '前橋家畜市場'),
maffMarket('list-35', '神奈川県', '神奈川県家畜商業協同組合'),
maffMarket('list-36', '山梨県', '山梨北部家畜市場'),
maffMarket('list-39', '静岡県', '静岡県家畜市場'),
maffMarket('list-40', '静岡県', '静岡県経済連袋井常設家畜市場'),
maffMarket('list-41', '静岡県', '静岡県経済連三島常設家畜市場'),
maffMarket('list-42', '新潟県', 'ＪＡ全農にいがた素牛市場'),
maffMarket('list-43', '新潟県', '高千家畜市場'),
maffMarket('list-44', '新潟県', '新潟県家畜商協同組合中央家畜市場'),
maffMarket('list-45', '石川県', '北陸三県家畜市場'),
maffMarket('list-46', '岐阜県', '岐阜県中央家畜市場'),
maffMarket('list-47', '岐阜県', '全農岐阜県本部関家畜流通センター'),
maffMarket('list-48', '岐阜県', '全農岐阜県本部飛騨家畜流通センター'),
maffMarket('list-49', '愛知県', 'あいち家畜市場'),
maffMarket('list-50', '三重県', '全農三重県本部伊賀家畜市場'),
maffMarket('list-51', '三重県', '全農三重県本部松阪家畜市場'),
maffMarket('list-52', '滋賀県', '高島総合家畜市場'),
maffMarket('list-53', '京都府', '中丹家畜市場'),
maffMarket('list-54', '京都府', '福知山市営家畜市場'),
maffMarket('list-57', '兵庫県', '丹波家畜集散市場'),
maffMarket('list-58', '奈良県', '宇陀家畜市場'),
maffMarket('list-59', '和歌山県', '和歌山県熊野牛子牛市場'),
maffMarket('list-61', '島根県', '海士家畜市場'),
maffMarket('list-62', '島根県', '西郷家畜市場'),
maffMarket('list-63', '島根県', '島根西部家畜市場'),
maffMarket('list-64', '島根県', '島根中央家畜市場'),
maffMarket('list-65', '島根県', '知夫家畜市場'),
maffMarket('list-66', '島根県', '西ノ島家畜市場'),
maffMarket('list-67', '岡山県', '全農岡山県本部　総合家畜市場'),
maffMarket('list-68', '広島県', '全国農業協同組合連合会広島県本部三次家畜市場'),
maffMarket('list-69', '山口県', '高森臨時家畜市場'),
maffMarket('list-70', '山口県', '山口中央家畜市場'),
maffMarket('list-71', '徳島県', '全農徳島県本部上板畜産センター'),
maffMarket('list-72', '香川県', '香川県家畜市場'),
maffMarket('list-73', '愛媛県', '野村臨時家畜市場'),
maffMarket('list-74', '高知県', '高原家畜市場'),
maffMarket('list-75', '高知県', '嶺北家畜市場'),
maffMarket('list-76', '佐賀県', '中央家畜市場（佐賀県）'),
maffMarket('list-77', '長崎県', '壱岐市農業協同組合畜産部（壱岐家畜市場）'),
maffMarket('list-78', '長崎県', '県南家畜市場'),
maffMarket('list-79', '長崎県', 'ごとう農業協同組合（五島家畜市場）'),
maffMarket('list-80', '長崎県', '対馬農協営農部（対馬家畜市場）'),
maffMarket('list-81', '長崎県', '平戸口中央家畜市場'),
maffMarket('list-82', '熊本県', '熊本県畜産農業協同組合（天草家畜市場）'),
maffMarket('list-83', '熊本県', '熊本県畜産農業協同組合（熊本県家畜市場）'),
maffMarket('list-84', '熊本県', '熊本県畜産農業協同組合（球磨家畜市場）'),
maffMarket('list-85', '熊本県', '熊本市農業協同組合（熊本市家畜市場）'),
maffMarket('list-86', '大分県', '豊後玖珠市場'),
maffMarket('list-87', '大分県', '豊後豊肥市場'),
maffMarket('list-88', '大分県', '豊後北部市場'),
maffMarket('list-89', '宮崎県', 'ＪＡみやざき　高千穂家畜市場'),
maffMarket('list-90', '宮崎県', 'ＪＡみやざき　南那珂地域家畜市場'),
maffMarket('list-91', '宮崎県', 'ＪＡみやざき　都城地域家畜市場'),
maffMarket('list-92', '宮崎県', 'ＪＡみやざき　宮崎中央家畜市場'),
maffMarket('list-93', '宮崎県', 'ＪＡみやざき　小林地域家畜市場'),
maffMarket('list-94', '宮崎県', 'ＪＡみやざき　児湯地域家畜市場'),
maffMarket('list-95', '宮崎県', 'ＪＡみやざき　延岡家畜市場'),
maffMarket('list-96', '宮崎県', '都城一般家畜市場'),
maffMarket('list-97', '鹿児島県', '姶良中央家畜市場'),
maffMarket('list-98', '鹿児島県', '奄美大島家畜市場'),
maffMarket('list-99', '鹿児島県', '出水中央家畜市場'),
maffMarket('list-100', '鹿児島県', '指宿中央家畜市場'),
maffMarket('list-101', '鹿児島県', '沖永良部家畜市場'),
maffMarket('list-102', '鹿児島県', '鹿児島中央家畜市場'),
maffMarket('list-103', '鹿児島県', '喜界家畜市場'),
maffMarket('list-104', '鹿児島県', '肝属中央家畜市場'),
maffMarket('list-105', '鹿児島県', '薩摩中央家畜市場'),
maffMarket('list-106', '鹿児島県', '瀬戸内家畜市場'),
maffMarket('list-107', '鹿児島県', '曽於中央家畜市場'),
maffMarket('list-108', '鹿児島県', '種子島家畜市場'),
maffMarket('list-109', '鹿児島県', '徳之島中央家畜市場'),
maffMarket('list-110', '鹿児島県', '与論家畜市場'),
maffMarket('list-111', '沖縄県', '伊江村家畜市場'),
maffMarket('list-112', '沖縄県', '久米島家畜市場'),
maffMarket('list-113', '沖縄県', '黒島家畜市場'),
maffMarket('list-114', '沖縄県', '多良間家畜市場'),
maffMarket('list-115', '沖縄県', '今帰仁家畜市場'),
maffMarket('list-116', '沖縄県', '南部家畜市場'),
maffMarket('list-117', '沖縄県', '宮古家畜市場'),
maffMarket('list-118', '沖縄県', '八重山家畜市場')
]);

/**
 * Conservative resolution: never silently map a free-text selection to
 * another official market. Only an exact, unique verified match qualifies.
 */
export function findVerifiedMarket(
  catalog: readonly MarketCatalogEntry[],
  prefecture: string,
  selectedName: string
): MarketCatalogEntry | null {
  const name = selectedName.trim().normalize('NFKC');
  if (!name) return null;
  const matches = catalog.filter(m =>
    m.active && m.prefecture === prefecture &&
    [m.name, ...m.aliases].some(alias => alias.trim().normalize('NFKC') === name)
  );
  return matches.length === 1 ? matches[0] : null;
}
