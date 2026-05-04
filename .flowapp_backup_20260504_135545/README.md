# FlowApp — Plataforma de aprobaciones

Sistema de aprobaciones internas integrado con Microsoft Entra ID.
Los aprobadores pueden **aprobar o rechazar directamente desde el correo**, sin necesidad de login.

## Stack

| Capa | Tecnología |
|---|---|
| Frontend | React 18 + Vite + TypeScript → GitHub Pages |
| Backend | Cloudflare Workers + Hono |
| Base de datos | Cloudflare D1 (SQLite edge) |
| Archivos | Cloudflare R2 |
| Auth | Microsoft Entra ID — MSAL (SPA) + JWT (Worker) |
| Correo | Microsoft Graph API `mail.send` |
| CI/CD | GitHub Actions |

## Estructura

```
flowapp/
├── backend/
│   ├── src/
│   │   ├── index.ts               ← Entry point Hono
│   │   ├── types.ts               ← Tipos globales
│   │   ├── middleware/
│   │   │   ├── auth.ts            ← JWT Entra ID
│   │   │   └── cors.ts
│   │   ├── auth/
│   │   │   └── tokens.ts          ← Magic links HMAC-SHA256
│   │   ├── db/
│   │   │   └── schema.sql         ← Schema D1 completo
│   │   ├── email/
│   │   │   └── template.ts        ← HTML del correo
│   │   ├── utils/
│   │   │   ├── graph.ts           ← MS Graph (users + mail)
│   │   │   └── approvals.ts       ← Motor de flujo de aprobación
│   │   └── routes/
│   │       ├── requests.ts        ← CRUD solicitudes
│   │       ├── admin.ts           ← Panel admin + buscador
│   │       └── email-actions.ts   ← /approve y /reject magic links
│   ├── wrangler.toml
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx                ← Router + login gate
│   │   ├── auth/msal.ts           ← Configuración MSAL
│   │   ├── lib/api.ts             ← API client tipado
│   │   ├── components/
│   │   │   ├── layout/Layout.tsx  ← Sidebar + nav
│   │   │   └── ui/index.tsx       ← Componentes reutilizables
│   │   └── pages/
│   │       ├── Dashboard.tsx
│   │       ├── RequestList.tsx
│   │       ├── RequestDetail.tsx
│   │       ├── NewRequest.tsx
│   │       └── AdminPanel.tsx     ← Tipos + flujos + buscador Entra ID
│   ├── vite.config.ts
│   └── package.json
│
├── scripts/setup.sh               ← Setup automático de recursos CF
└── .github/workflows/deploy.yml   ← CI/CD completo
```

## Setup desde cero (primera vez)

### 1. Instalar dependencias globales
```bash
npm install -g wrangler
wrangler login
```

### 2. Ejecutar script de setup
```bash
bash scripts/setup.sh
```
Esto crea automáticamente D1, R2, KV y aplica el schema.

### 3. Configurar secretos del Worker
```bash
cd backend

# Clave HMAC para magic links
wrangler secret put TOKEN_SECRET
# → genera con: openssl rand -base64 48

# Client secret de Entra ID (Azure Portal > App Registrations > tu app > Certificates & secrets)
wrangler secret put ENTRA_CLIENT_SECRET
```

### 4. Permisos requeridos en Entra ID

En Azure Portal > App Registrations > `66130291-fc50-43f1-943c-6818dac1ba99`:

| Permiso | Tipo | Uso |
|---|---|---|
| `Mail.Send` | Application | Envío de correos de notificación |
| `User.Read.All` | Application | Buscador de aprobadores |

### 5. Instalar dependencias y desarrollo local
```bash
# Terminal 1 — Backend
cd backend && npm install && npm run dev
# → http://localhost:8787

# Terminal 2 — Frontend
cd frontend && npm install && npm run dev
# → http://localhost:5173/flowapp
```

### 6. Deploy a producción
```bash
# Aplicar schema en producción
cd backend && npm run db:init:prod

# Deploy Worker
npm run deploy:prod
```

## GitHub Actions — CI/CD

Configura estos secrets en tu repositorio (Settings → Secrets → Actions):

| Secret | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token con permisos Workers Edit, D1 Edit, R2 Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Tu Account ID de Cloudflare |
| `VITE_API_URL` | URL del Worker en producción |
| `VITE_ENTRA_CLIENT_ID` | `66130291-fc50-43f1-943c-6818dac1ba99` |
| `VITE_ENTRA_TENANT_ID` | `480bd49c-6f89-4faa-b39e-c7728d95d130` |
| `VITE_ENTRA_SCOPE` | `api://66130291-fc50-43f1-943c-6818dac1ba99/basedeconocimiento` |

Habilita GitHub Pages en Settings → Pages → Source: **GitHub Actions**.

## Flujo de aprobación por correo (sin login)

```
Solicitante → crea solicitud con adjuntos
    ↓
Worker → genera token HMAC (UUID + firma, 72h, un solo uso)
    ↓
MS Graph → envía correo HTML al aprobador nivel 1
    ↓
Aprobador → clic en "Aprobar" o "Rechazar" desde su correo
    ↓
Worker → valida token → consume (invalida) → registra decisión
    ↓
Si aprueba y hay más niveles → notifica al siguiente aprobador
Si aprueba en nivel 4 (último) → solicitud aprobada → notifica solicitante
Si rechaza → solicitud rechazada → notifica solicitante con comentario
```

## API endpoints

| Método | Path | Auth | Descripción |
|---|---|---|---|
| GET | `/health` | — | Health check |
| GET | `/approve?token=` | Token | Aprobar desde correo |
| GET | `/reject?token=` | Token | Rechazar desde correo |
| GET | `/api/files/:key` | — | Descargar adjunto R2 |
| GET | `/api/requests` | JWT | Listar solicitudes |
| POST | `/api/requests` | JWT | Crear solicitud |
| GET | `/api/requests/:id` | JWT | Detalle solicitud |
| PATCH | `/api/requests/:id/cancel` | JWT | Cancelar |
| POST | `/api/requests/:id/attachments` | JWT | Subir adjunto |
| GET | `/api/admin/request-types` | JWT | Tipos de solicitud |
| PUT | `/api/admin/flows/:typeId` | JWT | Configurar flujo |
| GET | `/api/admin/users/search?q=` | JWT | Buscar usuarios Entra ID |
| POST | `/api/admin/campaign-costs` | JWT | Registrar costo campaña |
