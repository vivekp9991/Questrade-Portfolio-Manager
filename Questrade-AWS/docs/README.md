# Questrade-AWS — System Reference (single source of truth)

Everything about the live AWS app is in this one document. Last updated 2026-06-09.

**Contents**
1. [What's live](#1-whats-live)
2. [Questrade API constraints](#2-questrade-api-constraints)
3. [Data ownership rules](#3-data-ownership-rules)
4. [What was built & fixed](#4-what-was-built--fixed)
5. [Deployment runbook](#5-deployment-runbook)
6. [Current verified state](#6-current-verified-state)
7. [Deferred / known issues](#7-deferred--known-issues)
8. [Legacy (not live)](#8-legacy-not-live)

---

## 1. What's live

Serverless, fully pay-per-use. ~2-3 users. Cost priority #1, then performance, then features.

- **Frontend:** SolidJS + Vite → S3 bucket `questrade-portfolio-frontend` → CloudFront **`EYF4I6U6GTF64`** = **https://dr1yvcko8rmxu.cloudfront.net**. Source: `Questrade-AWS/aws-frontend/`.
- **Backend:** AWS SAM — Lambda (Node 20, ARM64) + DynamoDB (on-demand) + HTTP API Gateway + JWT authorizer. Source: `Questrade-AWS/AWS-Backend/`.
  - API: **https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev**
  - CloudFormation stack: **`questrade-portfolio-backend`** (us-east-1), account `112312239796`.
- **Daily sync:** Step Functions Standard state machine **`questrade-portfolio-sync-dev`**, scheduled `cron(0 22 ? * MON-FRI *)` (after market close). Maps over eligible logins, syncing each in isolation with retry/backoff. Manual "Sync now" in the UI hits `POST /api/sync/person/{name}`.
- **Schedules kept:** master-candles (`PrevDayCloseSync`, prev-day close for P&L), monthly-dividend, token keepalive (`rate(12 hours)`).

**Status (all deployed & verified):** Phase 1 token service ✅ · Phase 1b WebSocket fix ✅ · Phase 2 sync correctness + 3yr activities + Step Functions orchestration + status badges ✅ · Phase 3 re-onboard ✅ (incremental) · Phase 4 docs ✅, IaC reconcile deferred, WebSocket left as-is.
**Nothing committed to git yet** (per owner instruction) — all changes staged in the working tree.

**Active initiative:** Dividend Manager + Dividend Analysis rework — requirements & build plan in [`dividend-system-requirements.md`](dividend-system-requirements.md).

---

## 2. Questrade API constraints

> Docs (`questrade.com/api/documentation/`) return 403 to bots; figures confirmed via search.

**Tokens** — access token **30 min** (`expires_in: 1800`), returned with an `api_server` host. Refresh token **3 days, SINGLE-USE** (every refresh returns a new one and invalidates the old). Dead refresh token → `invalid_grant` (HTTP 400) → manual re-auth from the Questrade app hub.

**Rate limits** — account calls ≈ 30/s, 30,000/hr; market data ≈ 20/s, 15,000/hr. Over limit → HTTP **429** with `X-RateLimit-Remaining` / `X-RateLimit-Reset` headers. At 2-3 users this is never the bottleneck; token mismanagement was.

---

## 3. Data ownership rules

**Hard rule the sync obeys:**
- **Questrade-owned (disposable, re-syncable):** accounts, positions, activities, balances. Sync may wipe & rebuild these.
- **User-owned (NEVER written/overwritten by sync):** `symbol-categories` (dividend/non-dividend), manual `symbol-dividends` overrides (corrected yields, `isManualOverride`), `yield-exclusions`. All symbol-keyed. Sync only **reads** them and layers **manual override → Questrade → historical**.
- Backups: `AWS-Backend/backups/curated-*.json` (2026-06-09).

---

## 4. What was built & fixed

Original symptoms: wrong account/holding counts, scheduled sync unreliable, token lockouts, "ws disconnected".

### 4.1 Token service (Phase 1)
Canonical shared service `AWS-Backend/shared/utils/tokenManager.js` (re-exported by per-function copies).
- **Root causes fixed:** (a) any transient refresh error set `hasValidToken=false` → a single blip dropped a whole login; (b) the scheduler refreshed every **4 minutes**, rotating the single-use refresh token ~360×/day with no locking → races invalidated tokens; (c) refresh lifetime hardcoded 7d (really 3d).
- **Now:** access token cached its full 30 min; refresh only near expiry; **serialized via a DynamoDB conditional-write lock** (`conditionalUpdate` in `shared/utils/dynamodb.js`); error classification — only `invalid_grant` sets `needsReauth`, transient (429/5xx/network) is retried and never disables a login; correct 3-day rotation persisted atomically (refresh row first).
- **Scheduler** (`token-refresh-scheduler`) → `rate(12 hours)` keepalive-if-stale (refresh only if the refresh token is >2 days old / expiring within 36h), via the same locked path. Also updates the USD/CAD exchange rate.
- **Gotcha:** any Lambda using the shared token service needs **DynamoDBCrudPolicy on tokens + persons** (it does on-demand `UpdateItem` for the lock). market-data was read-only and 500'd until upgraded.

### 4.2 WebSocket stream-port (Phase 1b)
Browser opens the Questrade WS directly but first calls backend for (1) an access token (`/api/auth/access-token/{name}`) and (2) a stream port (`POST /api/symbols/stream-port`, market-data-service → Questrade `/v1/markets/quotes?...&stream=true&mode=WebSocket`).
- **Root cause:** a stored access token was timestamp-valid but Questrade-invalid (401) — leftover corruption from the old rotation races. Two code gaps: forced refresh didn't actually refresh (a double-check returned the bad token); market-data's inline `getAccessToken` only read the DB and never refreshed on 401.
- **Fix:** forced refresh now skips the double-check; market-data uses the shared token service and **retries once on 401 with a forced refresh** (self-heals); + the IAM CRUD upgrade above. `all` is the virtual "combined" selector with no token — its 500 is a harmless red herring.
- **2026-06-09 — refresh-storm fix (important):** the "force-refresh on 401" above, running in multiple consumers + the browser WS reconnecting every 10s, created a feedback loop. Questrade **invalidates the prior access token on every refresh** (single-use rotation), so each force-refresh killed the token another consumer was using → 401 → more force-refreshes → **storm** (~650 market-data + ~220 auth refreshes / 30 min; even a just-minted token failed within ~1s). Fix in `shared/utils/tokenManager.js`: (a) **refresh cooldown** `REFRESH_COOLDOWN_MS=120s` — `_refreshWithLock` returns the current DB token instead of rotating if a refresh happened <120s ago (applies even to forced refreshes), capping the storm; (b) **`getValidAccessToken` no longer reads the per-instance in-memory cache** — always serves the DB's latest (post-rotation) token, so no instance hands out a rotated-away token. Recover after such an event by deleting the `access` token rows (forces one clean, cooldown-protected mint).

### 4.3 Sync correctness (Phase 2a)
`AWS-Backend/lambda-functions/sync-operations/src/services/syncService.js`:
- **Replace-on-sync:** positions/accounts no longer returned by Questrade are deleted (closed account + its positions pruned) → counts mirror Questrade. (Fixed "wrong number of holdings".)
- **Eligibility:** `isActive && needsReauth!=true` (was the fragile `hasValidToken`).
- **429 + exponential backoff** added to `questradeApiService.makeRequest` (honors `X-RateLimit-Reset`).
- **Account cache:** full/scheduled sync `forceFresh`-fetches the account list; TTL 7d→1d → closures detected immediately.

### 4.4 3-year activities backfill (Phase 2)
- **Root cause of wrong dividends:** activities were keyed by array index → duplicate rows at every 30-day chunk boundary → **~26,000 rows** inflating `totalReceived`.
- **Fix:** deterministic **content-based key** + per-key occurrence counter (`#2`,`#3`) → idempotent, chunk-overlap safe. Historical depth 5y→3y; sync-operations timeout 60s→**300s**.
- **Backfill:** wiped 26,097 duplicates, re-synced clean. Dividend totals recomputed via a positions re-sync. `activitiesInitialized=true` → daily syncs incremental.

### 4.5 Step Functions orchestration (Phase 2b)
- State machine `questrade-portfolio-sync-dev`: `GetEligiblePersons` → `Map`(MaxConcurrency 1) → `SyncOnePerson` (Lambda task `syncPerson`) with **Retry** (10s, 2× backoff, 3 attempts on transient/Lambda errors) + **Catch** (per-login isolation). The sync-operations handler dispatches tasks via `event.task` (`getEligiblePersons` | `syncPerson`); tasks throw on failure so the SM retries/catches.
- **Single after-close schedule**; old `DailySync` (6am) + `daily-sync` (6pm) crons set `Enabled:false` (kept for rollback).
- **Bug fixed:** `getPerson` called `query()` with an options object instead of a key-condition string → always threw → every sync re-pulled 3 years (~80s/login). Fixed to `getItem` → incremental (~15s, activities:0 when nothing new).

### 4.6 Per-login status badges (Phase 2b)
- Backend `getSyncStatus()` returns per-login `{ isActive, needsReauth, lastSyncStatus, lastSyncTime, lastSyncError }`.
- Frontend `Topbar.jsx` account selector "BY PERSON" rows show a dot + relative time: 🟢 synced Xago / 🟡 stale|failed|never / 🔴 needs re-auth; ⚠ on the selector button if any login needs re-auth. `fetchSyncStatus()` in `services/api.js`; refreshes on mount + after each SYNC.

### 4.7 Re-onboard (Phase 3)
Achieved incrementally (no single wipe): tokens force-refreshed healthy; Questrade data rebuilt clean via replace-on-sync + the activities backfill; curated data intact & applied. Verified by owner.

---

## 5. Deployment runbook

**SAM CLI** installed at `C:\Program Files\Amazon\AWSSAMCLI\bin\sam.cmd` (not on PATH in git-bash; call full path). Artifact bucket: `aws-sam-cli-managed-default-samclisourcebucket-ezien9s48jco`.

**Backend** (`Questrade-AWS/AWS-Backend/`): edit source → `sam build` → `sam deploy`.
- ⚠️ **CRITICAL secret-preservation:** template params `EncryptionKey`/`JWTSecret`/`TwelveDataApiKey` have defaults (`change-this-…`). A deploy that doesn't pass the *current* values OVERWRITES them → breaks token decryption. Always:
  ```bash
  ENC=$(aws lambda get-function-configuration --function-name questrade-jwt-authorizer-dev --region us-east-1 --query 'Environment.Variables.ENCRYPTION_KEY' --output text)
  JWT=$(aws lambda get-function-configuration --function-name questrade-jwt-authorizer-dev --region us-east-1 --query 'Environment.Variables.JWT_SECRET' --output text)
  TD=$(aws lambda get-function-configuration --function-name questrade-portfolio-analytics-dev --region us-east-1 --query 'Environment.Variables.TWELVE_DATA_API_KEY' --output text)
  sam deploy --stack-name questrade-portfolio-backend --region us-east-1 \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM --resolve-s3 \
    --no-confirm-changeset --no-fail-on-empty-changeset \
    --parameter-overrides "Environment=dev" "EncryptionKey=$ENC" "JWTSecret=$JWT" "TwelveDataApiKey=$TD"
  ```
- `shared/utils/*` is copied into each function via `scripts/copy-shared.sh` (run it after editing shared code). Function list includes `token-refresh-scheduler` (added for the shared token service).
- **IAM:** the `questrade-deployer` user needs Step Functions perms — provided by the customer-managed policy **`QuestradeStepFunctions`** (`states:*` + `iam:PassRole`) attached via the **`questrade-deployers`** group (per-user inline 2048-char + 10-managed-policy limits forced the group route). Policy JSON: `AWS-Backend/iam/deployer-stepfunctions-policy.json`.

**Frontend** (`Questrade-AWS/aws-frontend/`):
```bash
npm install
VITE_API_GATEWAY_URL=https://1p9dtyfkgi.execute-api.us-east-1.amazonaws.com/dev npm run build
aws s3 sync dist/ s3://questrade-portfolio-frontend --delete --region us-east-1
aws cloudfront create-invalidation --distribution-id EYF4I6U6GTF64 --paths "/*"
```
(`deploy.bat` does build+sync but its CloudFront id is a placeholder — real id is `EYF4I6U6GTF64`. `VITE_API_GATEWAY_URL` is the only required build var.)

**Manual sync run:** `aws stepfunctions start-execution --state-machine-arn arn:aws:states:us-east-1:112312239796:stateMachine:questrade-portfolio-sync-dev --region us-east-1`.

---

## 6. Current verified state (2026-06-09)

| Login | Accounts | Positions | Activities (3y) | Dividends received (3y) |
|---|---|---|---|---|
| Vivek | 3 | 76 | 877 | $2,177.28 |
| Angel | 3 | 36 | 368 | $374.21 |

Curated: symbol-categories 48, symbol-dividends 51 (25 manual overrides), yield-exclusions 18. State machine run: SUCCEEDED, incremental (~15s).

---

## 7. Deferred / known issues

- **yield-exclusions IaC drift (DEFERRED, cosmetic):** CloudFormation records the table as the OLD composite key (`personName`+`symbol`+GSI); the live table + code use single-key `symbol`. `template.yaml` is frozen to the composite def + `DeletionPolicy: Retain` (with a DRIFT NOTE) so deploys aren't blocked. Zero functional impact. **To reconcile** (safe — table retained throughout): (1) deploy with `YieldExclusionsTable` removed from the template and `YIELD_EXCLUSIONS_TABLE` env temporarily hardcoded `Fn::Sub: questrade-yield-exclusions-${Environment}` (CFN drops the logical resource, keeps the physical table); (2) re-add it as single-key + restore the `Ref` + `aws cloudformation create-change-set --import-existing-resources` → execute.
- **WebSocket (LEFT AS-IS):** working after the token fix. If "ws disconnected" recurs, options are: harden the frontend reconnect/keepalive/1017 handling, or drop the WS for REST quote polling.
- **Stale planning docs in `AWS-Backend/*.md`** (OPTIMIZATION_PLAN, FUNCTIONALITY-COMPARISON, TODO/, etc.) predate this work — treat THIS document as authoritative; trust code over those.
- **Minor:** data-read's debug `questradeApiTest.js` still has an inline read-only token getter (not in the critical path).

---

## 8. Legacy (not live)

These exist in the repo but are NOT deployed — kept for reference:
- `Backend/questrade-portfolio-microservices/` (Express + MongoDB, ports 4001-4004) and `Backend/candle-based-backend/`.
- `Frontend/dividend-portfolio-manager/` and `Frontend-v2/portfolio-manager-v2/` (the SolidJS base `aws-frontend` was forked from).
- The root `README.md` documents this legacy local stack (now banner-marked as legacy).
