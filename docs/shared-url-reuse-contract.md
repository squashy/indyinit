# Shared-URL reuse contract

Investigation only. This record does not move board cards, mark any story Done, change gameplay, or authorize a store, deploy, or spend.

Stories named for later linkage:

| Story | Scope seen | In this change |
|---|---|---|
| BTT27 `sty_82e08b75` | Reuse investigation and adaptation contract | This document |
| BTT28 `sty_6ab383ae` | Optional shared-URL create/join. Depends on BTT27 | Not implemented |
| BTT29 `sty_c79cae9c` | Authoritative synchronized turns and resilient rejoin. Depends on BTT27 and BTT28 | Not implemented |

BTT28 and BTT29 stay blocked while this app has no authoritative store of its own. Cards were Inbox and unassigned when this was written. This file does not change that.

## Access

The named Origin repository was not readable from this environment. The Origin client reports that it is not authenticated, and no session token was injected. No GitHub repository of that name was visible to the authenticated GitHub account. The earlier app was not modified, pushed, or deployed.

What was readable, through the already connected hosting account, is the earlier app's production deployment file tree, deployment `dpl_Cwa9dVGjXNecJDodrRSoeu6MYi1n`, project `hoosier-conquest`. That tree includes a repository snapshot under `src/` (client, `packages/online`, serverless `api/games`, and an unused room server). It is a deployed snapshot, not a proven match to the Origin repository's current head.

A read-only `GET /api/health/db` against the public earlier app returned `200` and `{"ok":true}`. That route pings the store. No game was created or joined, so this is not proof of a finished shared turn.

## What the shipped snapshot actually does

Production routing is HTTP, not the room server.

- `vercel.json` serves the static client, rewrites `/g/:id` to `index.html`, and does not start the package that listens on port 2567.
- `apps/server` still has a hello room that answers `ping` with `welcome`. The root readme still describes that process. It is not the deployed shared-game path.
- Live shared play is serverless: `POST /api/games`, `POST /api/games/:id/join`, `GET /api/games/:id?since=`, `POST /api/games/:id/intents`.
- `liveDeps` requires `KV_REST_API_URL` and `KV_REST_API_TOKEN` and constructs an Upstash Redis client. If either is missing it throws `Redis is not configured`.
- The health route is named `db` and calls that same Redis ping. Older architecture text mentions Postgres. The running path that was inspected is Redis.
- A separate AI ticket route and a `TYPESAFE_API_KEY` exist on the earlier project. They are not part of shared turns.

Authority and races, from `packages/online`:

- A game document holds `version`, rules state, seat slots (`name` plus token hash), a seed, `status` (`lobby`, `active`, `over`), and an invite hash.
- Create uses a set-if-absent write. Commit is one Redis script: read the document, reject `missing` or `mismatch` when `version` differs, otherwise write the new document with a 7-day expiry, append one event, and expire the event list. The compare and write are atomic.
- The public view returns version, status, rules state, and seat names. It does not return token hashes, the invite, or the seed.
- Join checks the invite with SHA-256 and a timing-safe compare. The raw invite is returned to the creator once.
- An intent post carries `seatToken`, `expectedVersion`, and `intent`. The shipped client treats HTTP 409 as a stale write: it reloads and does not apply that response. Polling starts at 1500 ms, backs off to 12 seconds, and runs only while the document is visible.
- The seat credential is stored in `localStorage` under a prefix for that game id. The share URL is `/g/{gameId}?i={inviteCode}`. The seat token is not put in the URL.

The shipped client also keeps local hot-seat and versus-computer setup. Those modes are not the shared table. The online store rejects a local dispatch with "Use the online table to start a game."

## Storage for this app

`battlefor92` has no environment variables.

The only Redis store visible on the team is `hoosier-conquest-kv` (Upstash Redis, free plan, primary region `iad1`). It is connected only to `hoosier-conquest`, which holds `KV_REST_API_URL`, `KV_REST_API_TOKEN`, `KV_REST_API_READ_ONLY_TOKEN`, `KV_URL`, and `REDIS_URL`. Those values were not copied.

Reusing that store would write this game into the earlier app's database. Creating another database was not attempted. The free plan text says it is limited to one database per account, and a new paid database would be spend. Neither action is authorized by this contract.

Until a store is attached to `battlefor92` by a person, or an already available credential appears in this environment, BTT28 and BTT29 have no production authority. A memory stand-in can unit-test the compare-and-swap later. It cannot keep two independent browsers in sync after the process exits, and it is not a substitute for the missing store.

## Adaptation, not a copy

Reusable once a store exists for this app:

- Same store port: read, event tail, create-if-absent, commit at an expected version, ping. Results stay `ok`, `mismatch`, and `missing`.
- Same atomic version script shape, including expiry of the document and the event list.
- Same HTTP shape and the 409 reload. Poll while visible. Keep the seat token in `localStorage`, never in the URL.
- Hash invites and seat tokens. Return the raw invite only to the creator.
- Run the existing engine on the authority that holds the seed. Clients send actions. They do not roll dice or grade the quiz for a shared game.
- Keep a memory implementation of the same port for tests that must pass with no network.

Do not copy these into this game:

- Player cap of 2, 3, or 4, and the client check that a seat index above 3 is unreadable. This game seats 2 through 6.
- The earlier rules engine, 60-minute cap, place-value formula, hello room, or AI ticket route.
- Publishing the whole rules document. This game's `GameState` embeds `config.quiz`, and that pack includes `correctLetter` and `correctAnswer`. The earlier public view returns `doc.state` unchanged. Doing that here would ship the answer key to every browser on the poll. The shared document may carry holdings, phase, a prompt, and the displayed choice order. The correct letter stays on the authority.
- Storing the map and the full quiz pack inside every Redis document. The document should carry pack digests and the play state. Both browsers already load the same static packs.
- Treating a lost success response as safe to click again. Version compare rejects a stale `expectedVersion`. It does not remember that an intent already landed. A retried place or attack that is still legal can apply twice. Shared actions need an idempotency key stored with the committed version. The snapshot has no such key (`idempot` does not appear in the shipped client).
- Putting the invite code in the query string without a decision. That is how the earlier share link works, and it is also how the invite leaks into logs and history. The seat token rule is the part to keep. The invite placement needs an explicit choice before BTT28.
- Routing hot-seat or computer play through the network. Those modes stay on this device, including when storage is down. The quiz dialog must keep the text `Questions unverified`. Factual QA stays deferred. No replacement trivia bank.

## Proof this change does not claim

Not run, because no product code changed and no store was added:

- `npm run typecheck`, `npm test`, `npm run build`, `npm run gates`, `npm run box`
- Two independent browser contexts joining one URL
- A refresh, a rejoin, or a rejected stale action on this game
- A full turn whose result appears on both browsers

The earlier health ping and the deployment file read are the checks that were actually performed.
