# Anicca public deployment

Both `https://aitoshuu.me/Anicca` and `https://tongye.me/Anicca` use the same
application on Tencent Lighthouse (`122.51.59.89`). The existing public ingress
(`47.103.120.24`) terminates HTTPS and proxies each domain's `/Anicca` paths to
that source. Each browser keeps its requested domain. Workspace data continues
to use local storage, independently for each origin.

## Build and runtime

Use the existing `ubuntu@122.51.59.89` SSH account and `sudo` for release operations.

- `npm run build:deploy` builds Next.js with `NEXT_PUBLIC_BASE_PATH=/Anicca`.
  This is a build-time setting; changing it requires another build.
- `/Anicca` and `/Anicca/dialogue` render the same dialogue. The entry does not
  redirect to a different path or domain. Next links and legacy redirects use
  the framework prefix; browser fetches and plain anchors use `appPath`.
- Run `npm run check` before packaging. On a small build host, set
  `ANICCA_BUILD_CPUS=1` and limit the build process's memory and CPU separately
  from the running application.
- Build and package on Linux x64 with Node.js 22. The release includes the
  platform's traced dependencies, static chunks and runtime prompt files.

```sh
npm ci
npm run check
ANICCA_BUILD_CPUS=1 npm run build:deploy
node scripts/deploy/package-release.mjs /opt/anicca/releases/RELEASE_ID
```

The packaging script rejects a build without `/Anicca` and excludes dotenv
files. Production provider credentials belong in `/etc/anicca/anicca.env`,
owned by root with mode `0600`, under a directory with mode `0700`. Use the
existing `OPENAI_*`, `ANICCA_DEFAULT_MODEL`, and `DEEPSEEK_*` configuration;
never put those credentials in an archive or a Git commit.

`anicca.service` runs as the dedicated `anicca` user using
`/opt/anicca/runtime/bin/node`, with `/opt/anicca/current` pointing at a release.
It binds only `127.0.0.1:3250`. The release's `.next/cache` directory must exist
and be writable by that user; the other release files remain read-only to the
service. The standalone build uses the default `.next` directory in production.

## Reverse proxy

On Tencent, install `nginx/anicca-origin.conf` as
`/www/server/panel/vhost/nginx/anicca-origin.conf` and
`nginx/anicca-upstream.inc` as
`/www/server/panel/vhost/snippets/anicca-upstream.inc`. This adds a separate
`anicca-origin.internal` vhost. It accepts only the public ingress and loopback.

On the public ingress, install `nginx/anicca-public-upstream.inc` as
`/www/server/panel/vhost/snippets/anicca-public-upstream.inc` and
`nginx/anicca-public.locations.conf` as
`/www/server/panel/vhost/snippets/anicca-public.locations.inc`. Include the
locations snippet in the existing HTTPS server blocks for `aitoshuu.me` and
`tongye.me` in `html_aitoshuu.me.conf` and `html_tongye.me.conf`, respectively.
Keep the request URI intact; the application expects the `/Anicca` prefix.
Forward the incoming domain and HTTPS scheme through both proxy layers. Keep
the existing homepages and other project routes in their current vhosts.

Validate the complete Nginx configuration before each reload. Start and probe
the Tencent service before adding either public location. Once both domains
work, enable the application service for boot.

## Verification and rollback

Verify both public entries keep their hostname and `/Anicca` path, including a
hard refresh. Check prefixed scripts, styles, lazy TSL chunks and API requests.
Exercise desktop and mobile reading, quoted inquiry, polarity, dragging,
synthesis, refresh, and continuing from the synthesized idea. Preserve desktop
TSL auto, mobile original, manual renderer selection and automatic fallback.

For an application rollback, point `/opt/anicca/current` back at the previous
release and restart only `anicca.service`. For the first release, stop that
service and restore the saved vhost configurations. Validate Nginx before
reloading. Retain the previous release and configuration backups until public
verification passes. Credentials stay outside all release directories.

Public browser checks use fresh Chromium contexts with desktop and mobile
viewports. These checks do not replace physical-device performance testing.

```sh
node scripts/visual-smoke/deployment.mjs
node scripts/visual-smoke/deployment.mjs --live
node scripts/visual-smoke/deployment.mjs --renderer-only
```

The first command uses controlled browser responses to check recovery and
pointer synthesis. `--live` verifies the full quoted inquiry, polarity,
synthesis, refresh, and continuation flow against the deployed model API.
All commands write evidence under `/tmp` by default; they never clear a
user's existing workspace.

`--renderer-only` checks all three manual choices on desktop and mobile,
selection persistence, the prefixed lab link, and a simulated graphics-loss
fallback to the original. It does not call model APIs. The default controlled
suite includes these renderer checks as well.

The app-experience scenario also runs in production visual CI. It checks the
680/681 and 980/981 layout boundaries, tablet and landscape input hit areas
before filling, draft refresh, and one-layer Escape behavior from the menu,
polarity heading, return button and radio controls. To run it against both entries:

```sh
ANICCA_QA_URLS=https://aitoshuu.me/Anicca,https://tongye.me/Anicca node scripts/visual-smoke/app-experience.mjs
```

This scenario uses isolated synthetic workspaces and does not call model APIs.

The reading-continuity scenario also checks user reading during delayed inquiry
responses, idle and programmatic-scroll controls, explicit arrival opening,
draft preservation, the persistent return action at small sizes, refresh, and
rename ownership when creating or switching workspaces:

```sh
ANICCA_QA_URLS=https://aitoshuu.me/Anicca,https://tongye.me/Anicca node scripts/visual-smoke/reading-continuity.mjs
```

Surface checks cover the line input, shared primary operations, navigation
boundaries, pending surface grain, cancellation and failure cleanup, and static
grain under reduced motion. A temporary renderer harness checks 108 fusion,
occlusion and separation frames using the actual original and TSL modules:

```sh
ANICCA_QA_URLS=https://aitoshuu.me/Anicca,https://tongye.me/Anicca node scripts/visual-smoke/surface-controls.mjs
```

The harness uses the already installed Vite and Sharp dependencies; it adds no
application route and closes its temporary local server after validation.

Visual CI partitions the viewport and interaction checks into six
groups, with at most two running concurrently. Every viewport and scenario is
retained, with the existing 30-minute smoke deadline and per-group evidence.

Deployment evidence: [2026-10-28 verification](../docs/reviews/2026-10-28-public-deployment.md).
