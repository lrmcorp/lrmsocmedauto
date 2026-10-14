# LRM Corporation Social Studio

This application is based on [Postiz](https://github.com/gitroomhq/postiz-app),
revision `d5615020322d6f6197122af871efcadc98f6ff48`. The upstream source is
licensed under [AGPL-3.0](LICENSE). Keep the license and make the corresponding
source available to people using a deployed, modified version over a network.

The LRM channel catalog contains Instagram (Facebook Login and Instagram
Login), TikTok (personal and business integrations), and Threads. The Postiz
account, calendar, media, scheduling, and analytics features remain in the
source. More than one channel account can be connected after the platform apps
are approved and configured. The visible LRM mark is temporary text; replace
the components in `apps/frontend/src/components/new-layout/logo.tsx` and
`apps/frontend/src/components/ui/logo-text.component.tsx`, plus
`apps/frontend/public/lrm-mark.svg`, when the official logo is supplied.

## VPS setup

Untuk VPS bersama dengan Nginx Proxy Manager dan deployment otomatis, gunakan
[panduan deployment Bahasa Indonesia](docs/DEPLOY_VPS_ID.md) dan stack khusus
`deploy/compose.yaml`. Stack ini terpisah dari contoh Compose upstream di bawah.

Use a VPS with Docker Compose and enough disk and memory to build the Postiz
monorepo and run PostgreSQL, Redis, Temporal, and Elasticsearch. Point a public
HTTPS hostname to a reverse proxy on the VPS; forward it to port 4007. The
hostname must be final before registering OAuth callback URLs or building the
frontend.

1. Copy `.env.lrm.example` to `.env.lrm`. Set `PUBLIC_URL` to the HTTPS origin
   without a trailing slash. Set unique `JWT_SECRET`, `POSTGRES_PASSWORD`, and
   `TEMPORAL_POSTGRES_PASSWORD` values. Use URL-safe characters for the Postgres
   password, since Compose inserts it into `DATABASE_URL`. Keep `.env.lrm`
   private; it is ignored by Git.
2. Create developer apps with Meta and TikTok and enter the applicable IDs and
   secrets in `.env.lrm`. Configure the callback URLs below and request the
   permissions and review required for publishing and analytics. The Postiz
   self-hosted edition cannot use Postiz Cloud's preapproved app credentials.
3. Build and start the stack:

   ```sh
   docker compose --env-file .env.lrm -f docker-compose.yaml -f docker-compose.lrm.yaml build postiz
   docker compose --env-file .env.lrm -f docker-compose.yaml -f docker-compose.lrm.yaml up -d postiz temporal
   docker compose --env-file .env.lrm -f docker-compose.yaml -f docker-compose.lrm.yaml ps
   ```

4. Check `https://your-host/auth/login`, create the first user, and connect
   accounts from **Add Channel**. Verify an Instagram post in the calendar
   before using scheduled publishing. New registrations are disabled after
   the first organization is created. Keep the VPS, database, and uploads
   backed up. Add LRM Corporation's own terms and privacy pages before opening
   registration to others.

The callback URLs are based on `PUBLIC_URL`:

| Integration | Callback URL |
| --- | --- |
| Instagram with Facebook Login | `${PUBLIC_URL}/integrations/social/instagram` |
| Instagram Login | `${PUBLIC_URL}/integrations/social/instagram-standalone` |
| TikTok | `${PUBLIC_URL}/integrations/social/tiktok` |
| TikTok Business | `${PUBLIC_URL}/integrations/social/tiktok-business/` |
| Threads | `${PUBLIC_URL}/integrations/social/threads` |

If `PUBLIC_URL` changes, rebuild the app because the frontend receives its
public backend URL during the build. On a new host, `docker compose` pulls
upstream service images and the build fetches verified Prisma engines from
`binaries.prisma.sh` and Plus Jakarta Sans from Google Fonts.

## Local source development

Use Node 22 and pnpm 10.6.1. Start the upstream development services with
`docker compose -f docker-compose.dev.yaml up -d postiz-postgres postiz-redis temporal`.
In the Codex cloud runner, add `-f docker-compose.cloud.yaml` to that command;
it keeps Temporal's private container traffic off the runner's outbound proxy.
Set `DATABASE_URL`, `REDIS_URL`, `TEMPORAL_ADDRESS`, `JWT_SECRET`, `FRONTEND_URL`,
and `NEXT_PUBLIC_BACKEND_URL` in the ignored `.env` file using `.env.example`
as the reference. For local HTTP development, set `NOT_SECURED=true`; omit this
setting on the VPS with HTTPS. Set `DISABLE_REGISTRATION=true` to allow the first
organization and prevent further public registrations. Set
`NEXT_PUBLIC_UPLOAD_STATIC_DIRECTORY=/uploads` and `UPLOAD_DIRECTORY` to an
ignored local directory such as `/workspace/lrmsocmedauto/.uploads`.
Run `pnpm install --frozen-lockfile`, `pnpm run prisma-db-push`,
then `pnpm run dev-backend` and `pnpm run dev:orchestrator` in separate shells.
The local site runs at `http://localhost:4200`; public HTTPS and approved apps
are needed to exercise social OAuth and publishing.

For a production source build outside Docker, load the root configuration into
the build process:

```sh
pnpm exec dotenv -e .env -- pnpm run build
```

The worker readiness endpoint is `http://localhost:3002/health/status`. A 200
response with `{"status":"ok"}` verifies its connection to the Temporal namespace.

## Validation completed

The cloud instance completed a frozen dependency installation, Prisma client
generation, database setup, and production builds of the frontend, backend, and
scheduling worker. Local functional checks passed for the restricted channel
catalog, first-user registration, valid and invalid login, closing subsequent
registration, authenticated calendar APIs, and media upload and download. Login,
calendar, and media pages rendered with LRM branding. Two disposable account
records per network were returned independently by the account API; all test
users, account records, and media were removed afterward.

These checks validate the local application. Live OAuth, publishing, and social
analytics still require the VPS HTTPS address, platform app credentials, and the
appropriate platform permissions. A VPS deployment and Docker image build have
not yet been verified.
