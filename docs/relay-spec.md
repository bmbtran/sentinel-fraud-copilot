# Relay: Plaid Connection Recovery Console

## Product thesis

Initial Link success is not the end of an Item lifecycle. An application must react when a connection needs repair, consent is about to expire, or Plaid reports that a login was repaired elsewhere. Relay is a small application-side control plane that makes those transitions visible, durable, and testable.

Relay does not replace Plaid Link Recovery or the Plaid Dashboard. It demonstrates the application logic around Link update mode: persist a connection event, determine whether user action is needed, create one update-mode Link session, and clear obsolete recovery prompts when the Item is healthy again.

## Primary user and job

The user is a fintech engineer or support engineer responsible for connected accounts.

Their job is to answer, quickly and safely:

1. Which Items need user action now?
2. Why do they need it?
3. Has a recovery session already been issued?
4. Did a later event make that recovery prompt obsolete?

## In-scope lifecycle

| Incoming event | Relay state | User action |
| --- | --- | --- |
| `ITEM_ERROR` with `ITEM_LOGIN_REQUIRED` | `recovery_required` | Create a Link update-mode session. |
| `PENDING_DISCONNECT` or `PENDING_EXPIRATION` | `recovery_required` | Create a Link update-mode session. |
| User begins Link update | `recovery_in_progress` | Show the session as in progress. |
| Link update succeeds | `healthy` | Clear the action prompt. |
| `LOGIN_REPAIRED` newer than the outstanding issue | `healthy` | Dismiss the action prompt. |
| Unknown or irrelevant webhook | unchanged | Record it, but do not create a recovery action. |

## State model

```text
healthy
  └─ item error / pending expiry ─→ recovery_required
                                      └─ issue update Link token ─→ recovery_in_progress
                                                                     └─ Link success ─→ healthy

recovery_required / recovery_in_progress
  └─ newer LOGIN_REPAIRED ─→ healthy
```

Events are append-only. State is a materialized view. Every inbound event has a stable `eventId`; replays with the same ID are no-ops. A `LOGIN_REPAIRED` older than the latest recovery-required event is recorded but cannot clear the current action.

## Data model

### `connection_items`

- `id` — local Item identifier
- `plaid_item_id` — optional Plaid Item ID, never returned with an access token
- `label` — display label
- `status` — `healthy`, `recovery_required`, or `recovery_in_progress`
- `reason` — normalized recovery reason or `null`
- `recovery_required_at` — timestamp used for event ordering
- `updated_at`

### `connection_events`

- `event_id` — unique idempotency key
- `item_id`
- `kind`
- `occurred_at`
- `payload` — redacted event metadata only
- `outcome` — `applied`, `ignored_stale`, or `duplicate`

### `recovery_sessions`

- `id`
- `item_id`
- `status` — `issued`, `in_progress`, `completed`, or `superseded`
- `link_token` — retained server-side only; never returned after creation
- `created_at`, `completed_at`

## API contract

| Endpoint | Behavior |
| --- | --- |
| `GET /api/relay/overview` | Returns redacted Item summaries, event timeline, and recovery session summaries. |
| `POST /api/relay/events` | Accepts a normalized development event. Applies it idempotently. This is a local demo endpoint, not a production Plaid webhook verifier. |
| `POST /api/relay/items/:id/update-link` | Requires `recovery_required`; issues exactly one current update session. When configured, returns a short-lived Plaid Link token. Otherwise returns a fixture session. |
| `POST /api/relay/items/:id/update-started` | Marks an issued session in progress. |
| `POST /api/relay/items/:id/update-completed` | Marks the session complete and returns the Item to healthy. |
| `POST /api/relay/demo/reset` | Restores deterministic fixture data. Development only. |

## Sandbox path

When `PLAID_CLIENT_ID` and `PLAID_SECRET` exist, Relay creates a Sandbox Item and issues an update-mode `/link/token/create` request with that Item's `access_token`. The browser opens Plaid Link using the returned token. Link update mode does not exchange a new public token because the Item access token is unchanged.

The UI must label fixture transitions as simulated. It must label the Link modal path as Sandbox-backed only after the server successfully creates a Link token.

## Out of scope

- Production webhook signature verification
- Production data or real consumer account access
- Sending email or SMS messages
- Replacing Plaid Link Recovery
- Any financial advice or AI inference

## Definition of done

The project is complete only when all of the following are true:

1. The state machine handles every event in the lifecycle table and all automated tests pass without Plaid credentials.
2. Duplicate events cannot create duplicate recovery sessions.
3. An older `LOGIN_REPAIRED` event cannot clear a newer unresolved issue.
4. The UI shows a clear Item timeline, current state, reason, and the next recovery action within one screen.
5. The fixture demo can be reset and replayed entirely locally.
6. With Sandbox credentials configured, the app can create a real update-mode Link token without exposing the access token or secret to the browser.
7. SQLite persists Items, events, and recovery-session state across a server restart.
8. The README explains the application-side role precisely and includes a current demo artifact.
9. No route returns an access token, Plaid secret, or unredacted webhook body.
