# Relay test plan

## Test philosophy

The state reducer is the source of truth. HTTP routes and the browser are thin clients around it. Tests use only fixture events and temporary local SQLite state; no test requires a Plaid account or network access.

## Reducer cases

| ID | Given | When | Then |
| --- | --- | --- | --- |
| RLY-01 | Healthy Item | `ITEM_LOGIN_REQUIRED` | It becomes `recovery_required` with `item_login_required`. |
| RLY-02 | Healthy Item | `PENDING_DISCONNECT` | It becomes `recovery_required` with `pending_disconnect`. |
| RLY-03 | Recovery-required Item | Duplicate `eventId` | State remains unchanged and outcome is `duplicate`. |
| RLY-04 | Recovery-required Item | Newer `LOGIN_REPAIRED` | It becomes healthy and clears the reason. |
| RLY-05 | Recovery-required Item | Older `LOGIN_REPAIRED` | State remains recovery-required and outcome is `ignored_stale`. |
| RLY-06 | Healthy Item | Unknown event | State stays healthy and outcome is `applied` without a recovery action. |
| RLY-07 | Recovery-required Item | Issue update session | Exactly one session is issued and Item becomes `recovery_in_progress`. |
| RLY-08 | Recovery-in-progress Item | Issue update session again | Request is rejected; no duplicate session exists. |
| RLY-09 | Recovery-in-progress Item | Update completion | Session completes and Item becomes healthy. |
| RLY-10 | Recovery-required Item | Newer `LOGIN_REPAIRED` after a session was issued | Item becomes healthy and active session becomes `superseded`. |

## Persistence and API cases

| ID | Given | When | Then |
| --- | --- | --- | --- |
| RLY-11 | Fixture store | `GET /api/relay/overview` | Returns redacted Items, ordered events, and no token fields. |
| RLY-12 | Fixture Item | `POST /api/relay/events` twice with same ID | First is applied; second is duplicate; event count is one. |
| RLY-13 | Healthy Item | Request update link | Returns conflict with an actionable error. |
| RLY-14 | Recovery-required Item | Request update link | Returns a Link token or explicitly labelled fixture session; never an access token. |
| RLY-15 | Any state | `POST /api/relay/demo/reset` | Restores deterministic healthy/recovery-required fixture Items. |

## UI acceptance cases

| ID | User action | Expected result |
| --- | --- | --- |
| RLY-16 | Open Relay | Sees a count of Items needing action, one selected Item, and its event timeline. |
| RLY-17 | Select an Item requiring recovery | Sees the reason and a single primary action to start Link update. |
| RLY-18 | Start fixture recovery | Timeline changes to in progress; action is disabled to prevent duplicates. |
| RLY-19 | Complete fixture recovery | Item becomes healthy and no longer appears in the action-needed count. |
| RLY-20 | Resize to mobile | The Item list remains usable and the selected Item detail does not overflow. |

## Manual Sandbox acceptance

1. Configure Sandbox credentials in `.env`.
2. Open Relay and request an update Link session for the Sandbox-backed Item.
3. Confirm the browser receives only a `link_token`, never an access token.
4. Complete or exit Link and verify the UI records the corresponding local lifecycle event.
5. Use `/sandbox/item/reset_login` only through the server-side demo control; verify the browser never calls Plaid directly.
