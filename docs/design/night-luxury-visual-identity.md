# Night Luxury visual identity

## 目的

XGuard customer UIは、夜の活動に近い華やかさと、記録を預けられる静けさを両立する。人物・店舗・シャンパンの写真には依存せず、**Night Luxury × Private Vault**を光、余白、タイポグラフィで表現する。

## 基本比率

- 華やかさ: 30%
- 高級感: 40%
- 安心感: 30%

「求人・店舗LPの派手さ」「汎用SaaSのカード反復」「青黒いサイバーセキュリティ表現」は避ける。

## Color roles

| Role | Token | 用途 |
| --- | --- | --- |
| Base | `--canvas`, `--plum-deep` | near-black plumの夜。ページとHeroの基底 |
| Primary | `--wine`, `--wine-strong` | CTA、現在地、入力focus |
| Accent | `--champagne`, `--champagne-soft` | 光、番号、短い強調。広い面には使わない |
| Surface | `--paper`, `--paper-raised` | 操作領域。温かいivoryで安心感を作る |
| Success | `--success` | 本人確認済み、保全完了、非公開状態 |

pinkを主役にしない。gradientは夜の光や反射を作る背景だけに限定し、CTAはsolid colorにする。

## Light and material

- Heroはneon reflection、mirror edge、blurred lightをCSSの抽象表現で作る。
- 人物写真、店舗写真、シャンパン写真を主要visualにしない。
- 半透明materialは階層を示す場所だけで使い、glass surfaceを重ねない。
- light edgeはchampagneを低いopacityで使い、文字contrastを損なわない。

## Surface hierarchy

- 大きな世界観は1つのstageで見せ、Heroと手続きを左右の独立cardに分割しない。
- `border-radius`はpage stage 24–36px、入力/CTA 0–4pxを基本とする。
- shadowはstageの奥行きにだけ使い、各articleやbuttonへ反復しない。
- 情報の区切りはcardよりも余白、罫線、number、type scaleを優先する。

## Typography and copy

- display headingはtight leadingとnegative trackingで静かな存在感を作る。
- bodyは日本語を中心に、短く具体的に書く。
- 英語eyebrowはcustomer UIで常用しない。
- 「保全」「本人確認」「非公開」「読み取り専用」の意味を統一する。
- 不安を煽らず、利用者が何を選べるかを先に伝える。

## Components

- iconはbrand、primary action、状態確認など意味がある箇所だけに使う。
- pill badgeは常用せず、短いprivacy stateだけに限定する。
- 3列feature cardは使わず、editorialな縦のledgerで情報を読ませる。
- CTAはsolid wine、明確なfocus、disabled、pressed stateを持つ。
- journey notice、privacy表示、progress、success stateは機能情報として維持する。

## Responsive and accessibility

- desktopはHeroから手続き、保全対象、安全性、FAQへ縦のstoryとして読む。
- mobileは同じ順序を維持し、CTAと入力を1 columnにする。
- keyboard focus、contrast、`aria-live`、semantic headingを維持する。
- `prefers-reduced-motion`、`prefers-reduced-transparency`、`prefers-contrast`に対応する。

## 対応Issue

- #48 Night Luxury × Private Vault再設計
- #49 visual identity
- #50 Hero / 情報設計
- #51 日本語brand copy
- #52 component表現とaccessibility
