# frontend directory boundary

更新日: 2026-07-19

## 結論

customerとadminは、同じrepository内の独立したVite applicationとして管理する。

```text
frontend/
├── customer/
│   ├── index.html
│   └── src/
│       ├── CustomerApp.tsx
│       ├── CustomerPortal.tsx
│       ├── api.ts
│       └── customer.css
├── admin/
│   ├── index.html
│   └── src/
│       ├── AdminApp.tsx
│       ├── auth.ts
│       ├── api.ts
│       └── admin.css
├── shared/
│   ├── styles/tokens.css
│   └── test/setup.ts
├── vite.customer.config.ts
├── vite.admin.config.ts
└── tsconfig.json
```

## Import rule

```text
customer -> root shared DTO / frontend shared token
admin    -> root shared DTO / frontend shared token
shared   -> external package only
```

customerとadminの相互importは禁止する。audience固有のHTTP function、state、component、CSSは共有しない。Supabase auth clientはadminだけが所有し、X OAuth clientはcustomerだけが所有する。

## Commands

```bash
npm run dev:web:customer
npm run dev:web:admin
npm run build:web:customer
npm run build:web:admin
npm run test:web:customer
npm run test:web:admin
npm run check:bundle-separation
```

`npm run dev:web`は互換性のためcustomer appを起動する。両appを確認する場合はAPIを起動したうえでcustomerをport 5173、adminをport 5174で別々に起動する。

## 完了条件

- customer `/admin`と未知pathがHTTP 404になる。
- adminの既知route以外がHTTP 404になる。
- customer buildに管理API path、管理component、管理画面文言がない。
- admin buildにcustomer OAuth path、customer component、顧客入力文言がない。
- customer/adminそれぞれのbuild、component test、route testが通る。
