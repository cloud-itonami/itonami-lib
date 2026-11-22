// The source and non-endorsement lines a series app must show for its
// classification. This is the one place the wording lives: the app view
// (src/view.js, the "この app について" tab) shows what build.mjs puts in
// data.identity.attribution, and README text elsewhere quotes the same lines.
// The text is chosen by the blueprint's classification key, and the code is
// the repository's own code (identity.mjs checks it against blueprint.edn).
//
// - :itonami.blueprint/isco-08: Legal's final ILO wording (AWAI-3629). No ILO
//   logo or ILO imagery anywhere in the app.
// - :itonami.blueprint/unspsc-segment: Legal's UNSPSC source and trademark
//   lines (unspsc-redistribution memo, 2026-11-22). The Japanese line leaves
//   out "日本語の名称は当方の訳です。": the memo adds it only when the app
//   shows a Japanese name, and the series app shows the blueprint name as it
//   is. One app carries one code and its name; no UNDP emblem.
// - The other keys (ISIC, JSIC, COFOG) have no wording yet: Legal is asked
//   first, then the lines are added here.

export const ATTRIBUTIONS = {
  "itonami.blueprint/isco-08": (code) => ({
    ja: `職業の参照: ISCO-08（国際労働機関 ILO、2012 年）のコード ${code}。日本語の名称は当方の訳です。この app は ILO が作成・確認・推奨したものではありません。`,
    en: `Occupation reference: ISCO-08 (International Labour Organization, 2012), code ${code}. This app is not produced, reviewed or endorsed by the ILO.`,
  }),
  "itonami.blueprint/unspsc-segment": (code) => ({
    ja: `分類の参照: UNSPSC®（国連標準製品・サービス分類）のコード ${code}。© 国連開発計画（UNDP）。UNSPSC® は UNDP の登録商標です。この app は UNDP が作成・確認・推奨したものではありません。`,
    en: `Classification reference: UNSPSC® (United Nations Standard Products and Services Code), code ${code}. © United Nations Development Programme (UNDP). UNSPSC® is a registered trademark of UNDP. This app is not produced, reviewed or endorsed by UNDP.`,
  }),
};

/** The { ja, en } lines for a classification key and code, or null when the key needs none (yet). */
export function attributionFor(key, code) {
  if (typeof code !== "string" || !code) return null;
  const make = ATTRIBUTIONS[key];
  return make ? make(code) : null;
}
