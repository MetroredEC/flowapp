# FlowApp  Plataforma de aprobaciones

Sistema de aprobaciones internas integrado con Microsoft Entra ID.
Los aprobadores pueden **aprobar o rechazar directamente desde el correo**, sin necesidad de login.

## Stack

| Capa | Tecnolog­a |
|---|---|
| Frontend | React 18 + Vite + TypeScript   GitHub Pages |
| Backend | Cloudflare Workers + Hono |
| Base de datos | Cloudflare D1 (SQLite edge) |
| Archivos | Cloudflare R2 |
| Auth | Microsoft Entra ID  MSAL (SPA) + JWT (Worker) |
| Correo | Microsoft Graph API `mail.send` |
| CI/CD | GitHub Actions |

## Estructura

```
flowapp/
 backend/
    src/
       index.ts                 Entry point Hono
       types.ts                 Tipos globales
       middleware/
          auth.ts              JWT Entra ID
          cors.ts
       auth/
          tokens.ts            Magic links HMAC-SHA256
       db/
          schema.sql           Schema D1 completo
       email/
          template.ts          HTML del correo
       utils/
          graph.ts             MS Graph (users + mail)
          approvals.ts         Motor de flujo de aprobaci³n
       routes/
           requests.ts          CRUD solicitudes
           admin.ts             Panel admin + buscador
           email-actions.ts     /approve y /reject magic links
    wrangler.toml
    package.json

 frontend/
    src/
       main.tsx
       App.tsx                  Router + login gate
       auth/msal.ts             Configuraci³n MSAL
       lib/api.ts               API client tipado
       components/
          layout/Layout.tsx    Sidebar + nav
          ui/index.tsx         Componentes reutilizables
       pages/
           Dashboard.tsx
           RequestList.tsx
           RequestDetail.tsx
           NewRequest.tsx
           AdminPanel.tsx       Tipos + flujos + buscador Entra ID
    vite.config.ts
    package.json

 scripts/setup.sh                 Setup automtico de recursos CF
 .github/workflows/deploy.yml     CI/CD completo
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
Esto crea automticamente D1, R2, KV y aplica el schema.

### 3. Configurar secretos del Worker
```bash
cd backend

# Clave HMAC para magic links
wrangler secret put TOKEN_SECRET
#   genera con: openssl rand -base64 48

# Client secret de Entra ID (Azure Portal > App Registrations > tu app > Certificates & secrets)
wrangler secret put ENTRA_CLIENT_SECRET
```

### 4. Permisos requeridos en Entra ID

En Azure Portal > App Registrations > `66130291-fc50-43f1-943c-6818dac1ba99`:

| Permiso | Tipo | Uso |
|---|---|---|
| `Mail.Send` | Application | Env­o de correos de notificaci³n |
| `User.Read.All` | Application | Buscador de aprobadores |

### 5. Instalar dependencias y desarrollo local
```bash
# Terminal 1  Backend
cd backend && npm install && npm run dev
#   http://localhost:8787

# Terminal 2  Frontend
cd frontend && npm install && npm run dev
#   http://localhost:5173/flowapp
```

### 6. Deploy a producci³n
```bash
# Aplicar schema en producci³n
cd backend && npm run db:init:prod

# Deploy Worker
npm run deploy:prod
```

## GitHub Actions  CI/CD

Configura estos secrets en tu repositorio (Settings   Secrets   Actions):

| Secret | Valor |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Token con permisos Workers Edit, D1 Edit, R2 Edit |
| `CLOUDFLARE_ACCOUNT_ID` | Tu Account ID de Cloudflare |
| `VITE_API_URL` | URL del Worker en producci³n |
| `VITE_ENTRA_CLIENT_ID` | `66130291-fc50-43f1-943c-6818dac1ba99` |
| `VITE_ENTRA_TENANT_ID` | `480bd49c-6f89-4faa-b39e-c7728d95d130` |
| `VITE_ENTRA_SCOPE` | `api://66130291-fc50-43f1-943c-6818dac1ba99/basedeconocimiento` |

Habilita GitHub Pages en Settings   Pages   Source: **GitHub Actions**.

## Flujo de aprobaci³n por correo (sin login)

```
Solicitante   crea solicitud con adjuntos
     
Worker   genera token HMAC (UUID + firma, 72h, un solo uso)
     
MS Graph   env­a correo HTML al aprobador nivel 1
     
Aprobador   clic en "Aprobar" o "Rechazar" desde su correo
     
Worker   valida token   consume (invalida)   registra decisi³n
     
Si aprueba y hay ms niveles   notifica al siguiente aprobador
Si aprueba en nivel 4 (ºltimo)   solicitud aprobada   notifica solicitante
Si rechaza   solicitud rechazada   notifica solicitante con comentario
```

## API endpoints

| M©todo | Path | Auth | Descripci³n |
|---|---|---|---|
| GET | `/health` |  | Health check |
| GET | `/approve?token=` | Token | Aprobar desde correo |
| GET | `/reject?token=` | Token | Rechazar desde correo |
| GET | `/api/files/:key` |  | Descargar adjunto R2 |
| GET | `/api/requests` | JWT | Listar solicitudes |
| POST | `/api/requests` | JWT | Crear solicitud |
| GET | `/api/requests/:id` | JWT | Detalle solicitud |
| PATCH | `/api/requests/:id/cancel` | JWT | Cancelar |
| POST | `/api/requests/:id/attachments` | JWT | Subir adjunto |
| GET | `/api/admin/request-types` | JWT | Tipos de solicitud |
| PUT | `/api/admin/flows/:typeId` | JWT | Configurar flujo |
| GET | `/api/admin/users/search?q=` | JWT | Buscar usuarios Entra ID |
| POST | `/api/admin/campaign-costs` | JWT | Registrar costo campaa |

## Deploy con PowerShell

El repositorio incluye `scripts/deploy.ps1` para desplegar el Worker en Cloudflare y construir el frontend para GitHub Pages desde Windows PowerShell o PowerShell 7.

```powershell
# Desde la ra­z del repositorio
./scripts/deploy.ps1 -ApiUrl "https://flowapp.dbermeo.workers.dev"
```

Opciones ºtiles:

```powershell
# Aplica schema D1 y despliega el Worker de producci³n definido en wrangler.toml
./scripts/deploy.ps1 -Production -ApplyDbSchema -ApiUrl "https://flowapp-production.dbermeo.workers.dev"

# Publica el contenido de frontend/dist en la rama gh-pages
./scripts/deploy.ps1 -PublishPagesBranch
```

Para evitar que los enlaces de correo apunten a GitHub Pages por error, el Worker usa dos URLs separadas:

| Variable | Uso |
|---|---|
| `PUBLIC_API_URL` | Worker pºblico para `/approve`, `/reject` y `/api/files/*` |
| `FRONTEND_URL` | SPA publicada en GitHub Pages para `/requests/:id` |
| `PLATFORM_URL` | Alias de compatibilidad; se mantiene apuntando al frontend |

Si configuras un dominio personalizado de Cloudflare, cambia `PUBLIC_API_URL` en `backend/wrangler.toml` y en el secret `VITE_API_URL` de GitHub Actions.
