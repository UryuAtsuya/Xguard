// Paste this into Figma MCP use_figma after the Starter plan call limit resets.
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
  addText(frame, "Brand", name.startsWith("02") ? "接続" : name.startsWith("03") ? "Backup" : name.startsWith("04") ? "Proof" : name.startsWith("05") ? "Settings" : "XGuard", 24, 58, 170, 22, "Extra Bold");
  addBox(frame, "Status pill", 286, 55, 80, 30, solid(colors.line, 0.06), 999, 0.12);
  addText(frame, "Status label", name.startsWith("02") ? "Read only" : name.startsWith("03") ? "Healthy" : name.startsWith("05") ? "Discreet" : "Private", 302, 63, 62, 11, "Semi Bold", colors.muted, 14);

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
  ["Home", "Backup", "Proof", "Me"].forEach((label, i) => {
    const nx = 34 + i * 84;
    if (label === activeTab) {
      addBox(frame, `Nav active ${label}`, nx - 8, navY + 8, 70, 36, solid(colors.gold, 0.12), 14, 0.1);
    }
    addText(frame, `Nav ${label}`, label, nx, navY + 20, 58, 11, "Semi Bold", label === activeTab ? colors.gold : colors.muted, 14);
  });
}

const board = figma.createFrame();
board.name = "XGuard night-work persona wireframe board";
board.resize(2140, 1440);
board.x = 80;
board.y = 80;
board.cornerRadius = 28;
board.fills = solid(colors.bg);
figma.currentPage.appendChild(board);
createdNodeIds.push(board.id);

addText(board, "Board title", "XGuard mobile-first wireframes for night-work users", 36, 32, 1060, 34, "Extra Bold", colors.text, 42);
addText(board, "Board copy", "Dark lounge visual direction: champagne gold, magenta neon, glossy black. Phone is the primary use case; desktop is a companion surface for proof review and operations.", 38, 84, 1120, 16, "Regular", colors.muted, 24);

addPhone({
  parent: board,
  name: "01 Landing / Risk Snapshot",
  x: 120,
  y: 210,
  eyebrow: "ACCOUNT RISK SNAPSHOT",
  title: "Proof before your account disappears.",
  copy: "Premium, discreet backup for identity, activity proof, and restart links.",
  cta: "Connect X safely",
  activeTab: "Home",
  cards: [
    { title: "Backup readiness", meta: "72%", body: "Profile, recent posts, and proof page draft are prepared." },
    { title: "Private by default", meta: "Safe", body: "Proof pages start private and can be revoked at any time." },
    { title: "No automation risk", meta: "Read-only", body: "No posting, no DM, no follow or unfollow actions." },
  ],
});

addPhone({
  parent: board,
  name: "02 Connect X / Permission Reassurance",
  x: 540,
  y: 210,
  eyebrow: "PERMISSION CHECK",
  title: "Read-only means read-only.",
  copy: "Explain the permission boundary before OAuth. XGuard will not touch audience or messages.",
  cta: "Continue with X",
  activeTab: "Home",
  cards: [
    { title: "Allowed scopes", meta: "3", body: "tweet.read, users.read, offline.access for scheduled backup only." },
    { title: "Never included", meta: "Blocked", body: "No automatic DM, posting, follow, unfollow, or ban evasion flows." },
    { title: "Token safety", meta: "Backend", body: "Tokens stay behind backend repository boundaries." },
  ],
});

addPhone({
  parent: board,
  name: "03 Backup Dashboard",
  x: 960,
  y: 210,
  eyebrow: "TONIGHT IS SAFE",
  title: "Tonight is already backed up.",
  copy: "One-thumb access to run backup and confirm proof readiness after a shift.",
  cta: "Run backup now",
  activeTab: "Backup",
  cards: [
    { title: "Saved snapshots", meta: "148", body: "Profile and recent public posts are stored for redacted proof generation." },
    { title: "API cost guard", meta: "18%", body: "Usage limits are visible without making the screen feel technical." },
    { title: "Account health", meta: "OK", body: "Revoked or expired auth states are surfaced early." },
  ],
});

addPhone({
  parent: board,
  name: "04 Proof Page Builder",
  x: 1380,
  y: 210,
  eyebrow: "PROOF PAGE BUILDER",
  title: "Choose what the public can see.",
  copy: "Review redacted proof before sharing. Public and unlisted modes are opt-in.",
  cta: "Create private link",
  activeTab: "Proof",
  cards: [
    { title: "Visibility", meta: "Private", body: "Private by default, then unlisted or public only after preview." },
    { title: "Redaction", meta: "On", body: "Raw X payloads are never exposed on the public proof page." },
    { title: "Revoke controls", meta: "1 tap", body: "Proof pages can be revoked and deletion requests can be started." },
  ],
});

addPhone({
  parent: board,
  name: "05 Settings / Discreet Controls",
  x: 1800,
  y: 210,
  eyebrow: "DISCREET CONTROLS",
  title: "Privacy controls stay close.",
  copy: "Deletion, revoke, billing, and notification settings are reachable from the phone.",
  cta: "Review settings",
  activeTab: "Me",
  cards: [
    { title: "Proof default", meta: "Private", body: "No public proof page is created without explicit review." },
    { title: "Manual restart", meta: "Manual", body: "New account and link collection are reviewed by the user before sharing." },
    { title: "Deletion request", meta: "Ready", body: "Deletion and proof revocation are first-class user actions." },
  ],
});

const desktop = figma.createFrame();
desktop.name = "06 Desktop companion / operations review";
desktop.resize(780, 430);
desktop.x = 540;
desktop.y = 1090;
desktop.cornerRadius = 28;
desktop.fills = solid(colors.line, 0.055);
desktop.strokes = solid(colors.gold, 0.22);
board.appendChild(desktop);
createdNodeIds.push(desktop.id);
addText(desktop, "Desktop title", "Desktop is a companion, not the main product", 28, 28, 570, 26, "Extra Bold", colors.text, 34);
addText(desktop, "Desktop body", "Use the larger screen for proof preview, compliance queues, API usage review, and billing guardrails. Keep the daily recovery-prep flow optimized for mobile.", 30, 76, 690, 15, "Regular", colors.muted, 24);
["Proof preview", "Compliance queue", "Billing and API guard"].forEach((label, i) => {
  const x = 30 + i * 240;
  addBox(desktop, `Desktop panel ${label}`, x, 150, 210, 220, solid(colors.bg, 0.72), 20, 0.12);
  addText(desktop, `Desktop panel title ${label}`, label, x + 18, 174, 160, 15, "Bold", colors.gold, 19);
  addText(
    desktop,
    `Desktop panel body ${label}`,
    i === 0 ? "Review redacted public proof before sharing." : i === 1 ? "Track deletion, protected, withheld, and suspended events." : "Watch monthly usage and cost stop rules.",
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
