// Starter plan の call limit がリセットされた後、これを Figma MCP use_figma に貼り付ける。
// Target file: https://www.figma.com/design/UK9jDUA7VnwLW2zU3g72CU
// Skill names: figma-use,figma-generate-design

await figma.loadFontAsync({ family: "Inter", style: "Regular" });
await figma.loadFontAsync({ family: "Inter", style: "Semi Bold" });
await figma.loadFontAsync({ family: "Inter", style: "Bold" });
await figma.loadFontAsync({ family: "Inter", style: "Extra Bold" });

const createdNodeIds = [];
const colors = {
  bg: { r: 0.035, g: 0.027, b: 0.051 },
  panel: { r: 0.078, g: 0.055, b: 0.105 },
  text: { r: 0.973, g: 0.949, b: 1 },
  muted: { r: 0.725, g: 0.663, b: 0.784 },
  gold: { r: 0.965, g: 0.78, b: 0.435 },
  magenta: { r: 1, g: 0.31, b: 0.75 },
  line: { r: 1, g: 1, b: 1 },
};

function solid(color, opacity = 1) {
  return [{ type: "SOLID", color, opacity }];
}

function gradient(a, b) {
  const withAlpha = (color) => {
    const { a: alpha, ...rgb } = color;
    return { ...rgb, a: alpha ?? 1 };
  };

  return [
    {
      type: "GRADIENT_LINEAR",
      gradientTransform: [
        [1, 0, 0],
        [0, 1, 0],
      ],
      gradientStops: [
        { position: 0, color: withAlpha(a) },
        { position: 1, color: withAlpha(b) },
      ],
    },
  ];
}

function addText(parent, name, value, x, y, w, size, style = "Regular", fill = colors.text, lineHeight = Math.round(size * 1.32)) {
  const node = figma.createText();
  node.name = name;
  node.fontName = { family: "Inter", style };
  node.fontSize = size;
  node.lineHeight = { unit: "PIXELS", value: lineHeight };
  node.fills = solid(fill);
  node.characters = value;
  node.resize(w, node.height);
  node.x = x;
  node.y = y;
  parent.appendChild(node);
  createdNodeIds.push(node.id);
  return node;
}

function addBox(parent, name, x, y, w, h, fills, radius = 18, strokeOpacity = 0.12) {
  const node = figma.createRectangle();
  node.name = name;
  node.resize(w, h);
  node.x = x;
  node.y = y;
  node.cornerRadius = radius;
  node.fills = fills;
  node.strokes = solid(colors.line, strokeOpacity);
  node.strokeWeight = 1;
  parent.appendChild(node);
  createdNodeIds.push(node.id);
  return node;
}

function addPhone({ parent, name, x, y, eyebrow, title, copy, cta, activeTab, cards }) {
  const frame = figma.createFrame();
  frame.name = name;
  frame.resize(390, 844);
  frame.x = x;
  frame.y = y;
  frame.cornerRadius = 36;
  frame.clipsContent = true;
  frame.fills = [
    {
      type: "GRADIENT_LINEAR",
      gradientTransform: [
        [0, 1, 0],
        [-1, 0, 1],
      ],
      gradientStops: [
        { position: 0, color: { ...colors.bg, a: 1 } },
        { position: 0.55, color: { r: 0.083, g: 0.047, b: 0.12, a: 1 } },
        { position: 1, color: { r: 0.032, g: 0.027, b: 0.043, a: 1 } },
      ],
    },
  ];
  frame.strokes = solid(colors.gold, 0.24);
  frame.strokeWeight = 1;
  frame.effects = [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.34 },
      offset: { x: 0, y: 24 },
      radius: 48,
      spread: 0,
      visible: true,
      blendMode: "NORMAL",
    },
  ];
  parent.appendChild(frame);
  createdNodeIds.push(frame.id);

  addBox(frame, "Dynamic island", 150, 13, 90, 24, solid({ r: 0.018, g: 0.016, b: 0.025 }), 999, 0.08);
  addText(frame, "Brand", name.startsWith("02") ? "接続" : name.startsWith("03") ? "保全" : name.startsWith("04") ? "証明" : name.startsWith("05") ? "設定" : "XGuard", 24, 58, 170, 22, "Extra Bold");
  addBox(frame, "Status pill", 286, 55, 80, 30, solid(colors.line, 0.06), 999, 0.12);
  addText(frame, "Status label", name.startsWith("02") ? "読取専用" : name.startsWith("03") ? "正常" : name.startsWith("05") ? "控えめ" : "非公開", 302, 63, 62, 11, "Semi Bold", colors.muted, 14);

  addBox(frame, "Hero panel", 24, 112, 342, 190, gradient({ ...colors.gold, a: 0.22 }, { ...colors.magenta, a: 0.14 }), 26, 0.22);
  addText(frame, "Hero eyebrow", eyebrow, 44, 136, 270, 12, "Bold", colors.gold, 15);
  addText(frame, "Hero title", title, 44, 164, 286, 30, "Extra Bold", colors.text, 35);
  addText(frame, "Hero copy", copy, 44, 236, 292, 13, "Regular", colors.muted, 18);
  addBox(frame, "Primary CTA", 44, 324, 302, 48, gradient(colors.gold, { r: 1, g: 0.56, b: 0.84 }), 999, 0);
  addText(frame, "CTA label", cta, 102, 338, 210, 14, "Extra Bold", { r: 0.09, g: 0.047, b: 0.09 }, 17);

  let cy = 394;
  for (const card of cards) {
    addBox(frame, `Card ${card.title}`, 24, cy, 342, card.height || 96, solid(colors.line, 0.055), 18, 0.12);
    addText(frame, `Card title ${card.title}`, card.title, 42, cy + 18, 210, 13, "Bold", colors.text, 17);
    addText(frame, `Card meta ${card.title}`, card.meta, 280, cy + 18, 66, 12, "Semi Bold", card.accent || colors.gold, 16);
    addText(frame, `Card body ${card.title}`, card.body, 42, cy + 45, 286, 12, "Regular", colors.muted, 17);
    cy += (card.height || 96) + 14;
  }

  const navY = 772;
  addBox(frame, "Bottom nav rail", 20, navY, 350, 52, solid(colors.line, 0.035), 20, 0.1);
  ["ホーム", "保全", "証明", "自分"].forEach((label, i) => {
    const nx = 34 + i * 84;
    if (label === activeTab) {
      addBox(frame, `Nav active ${label}`, nx - 8, navY + 8, 70, 36, solid(colors.gold, 0.12), 14, 0.1);
    }
    addText(frame, `Nav ${label}`, label, nx, navY + 20, 58, 11, "Semi Bold", label === activeTab ? colors.gold : colors.muted, 14);
  });
}

const board = figma.createFrame();
board.name = "XGuard 夜職ペルソナワイヤーフレームボード";
board.resize(2140, 1440);
board.x = 80;
board.y = 80;
board.cornerRadius = 28;
board.fills = solid(colors.bg);
figma.currentPage.appendChild(board);
createdNodeIds.push(board.id);

addText(board, "Board title", "夜職ユーザー向け XGuard モバイルファーストワイヤーフレーム", 36, 32, 1060, 34, "Extra Bold", colors.text, 42);
addText(board, "Board copy", "dark lounge の visual direction: champagne gold、magenta neon、glossy black。phone を primary use case とし、desktop は proof review と operations の companion surface として扱う。", 38, 84, 1120, 16, "Regular", colors.muted, 24);

addPhone({
  parent: board,
  name: "01 Landing / Risk Snapshot",
  x: 120,
  y: 210,
  eyebrow: "アカウントリスク概要",
  title: "消える前に、証明を残す。",
  copy: "本人性、活動実績、再起動リンクのための上質で控えめなバックアップ。",
  cta: "Xを安全に接続",
  activeTab: "ホーム",
  cards: [
    { title: "バックアップ準備", meta: "72%", body: "プロフィール、直近投稿、証明ページ下書きを準備済み。" },
    { title: "初期状態は非公開", meta: "安全", body: "証明ページは非公開から始まり、いつでも失効できる。" },
    { title: "自動化リスクなし", meta: "読取専用", body: "投稿、DM、follow/unfollow actions は行わない。" },
  ],
});

addPhone({
  parent: board,
  name: "02 Connect X / Permission Reassurance",
  x: 540,
  y: 210,
  eyebrow: "権限確認",
  title: "読み取り専用は、読み取り専用。",
  copy: "OAuth 前に permission boundary を説明する。XGuard は audience や messages に触れない。",
  cta: "Xで続ける",
  activeTab: "ホーム",
  cards: [
    { title: "許可する scopes", meta: "3", body: "tweet.read、users.read、offline.access は scheduled backup のみに使う。" },
    { title: "含めないもの", meta: "遮断", body: "自動 DM、posting、follow、unfollow、ban evasion flows は作らない。" },
    { title: "Token 安全性", meta: "Backend", body: "Tokens は backend repository boundaries の内側に留める。" },
  ],
});

addPhone({
  parent: board,
  name: "03 Backup Dashboard",
  x: 960,
  y: 210,
  eyebrow: "今夜は保全済み",
  title: "今夜の分は、もう残っている。",
  copy: "勤務後でも親指 1 本で backup を実行し、proof readiness を確認できる。",
  cta: "今すぐバックアップ",
  activeTab: "保全",
  cards: [
    { title: "保存済み snapshots", meta: "148", body: "プロフィールと直近公開投稿を redacted proof generation 用に保存済み。" },
    { title: "API費用ガード", meta: "18%", body: "画面を technical にしすぎず usage limits を見せる。" },
    { title: "アカウント状態", meta: "OK", body: "revoked または expired auth states を早めに surface する。" },
  ],
});

addPhone({
  parent: board,
  name: "04 証明ページ作成",
  x: 1380,
  y: 210,
  eyebrow: "証明ページ作成",
  title: "見せる情報を、自分で選ぶ。",
  copy: "共有前に redacted proof を review する。public と unlisted modes は opt-in。",
  cta: "非公開リンクを作成",
  activeTab: "証明",
  cards: [
    { title: "公開範囲", meta: "非公開", body: "初期状態は非公開。preview 後にのみ unlisted または public を選ぶ。" },
    { title: "赤入れ", meta: "有効", body: "Raw X payloads は public proof page に expose しない。" },
    { title: "失効操作", meta: "1 tap", body: "Proof pages の revoke と deletion requests の開始ができる。" },
  ],
});

addPhone({
  parent: board,
  name: "05 Settings / Discreet Controls",
  x: 1800,
  y: 210,
  eyebrow: "控えめな操作",
  title: "プライバシー操作を近くに置く。",
  copy: "deletion、revoke、billing、notification settings に phone から届くようにする。",
  cta: "設定を確認",
  activeTab: "自分",
  cards: [
    { title: "証明の初期状態", meta: "非公開", body: "explicit review なしで public proof page は作成しない。" },
    { title: "手動再起動", meta: "手動", body: "new account と link collection は共有前に user が review する。" },
    { title: "削除依頼", meta: "準備済み", body: "Deletion と proof revocation は first-class user actions。" },
  ],
});

const desktop = figma.createFrame();
desktop.name = "06 デスクトップ補助画面 / 運用レビュー";
desktop.resize(780, 430);
desktop.x = 540;
desktop.y = 1090;
desktop.cornerRadius = 28;
desktop.fills = solid(colors.line, 0.055);
desktop.strokes = solid(colors.gold, 0.22);
board.appendChild(desktop);
createdNodeIds.push(desktop.id);
addText(desktop, "Desktop title", "Desktop は主役ではなく補助画面", 28, 28, 570, 26, "Extra Bold", colors.text, 34);
addText(desktop, "Desktop body", "広い画面は proof preview、compliance queues、API usage review、billing guardrails に使う。日々の recovery-prep flow は mobile に最適化しておく。", 30, 76, 690, 15, "Regular", colors.muted, 24);
["証明プレビュー", "コンプライアンスキュー", "課金とAPIガード"].forEach((label, i) => {
  const x = 30 + i * 240;
  addBox(desktop, `Desktop panel ${label}`, x, 150, 210, 220, solid(colors.bg, 0.72), 20, 0.12);
  addText(desktop, `Desktop panel title ${label}`, label, x + 18, 174, 160, 15, "Bold", colors.gold, 19);
  addText(
    desktop,
    `Desktop panel body ${label}`,
    i === 0 ? "共有前に redacted public proof を review する。" : i === 1 ? "deletion、protected、withheld、suspended events を track する。" : "monthly usage と cost stop rules を監視する。",
    x + 18,
    214,
    158,
    13,
    "Regular",
    colors.muted,
    20,
  );
});

figma.viewport.scrollAndZoomIntoView([board]);
return {
  boardNodeId: board.id,
  createdNodeIds,
  screenFrames: 6,
  source: "docs/design/figma-night-work-wireframe-import.js",
};
