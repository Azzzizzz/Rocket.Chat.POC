# TikMe Chat POC — API Usage

This document lists the Rocket.Chat APIs used by the POC and their purposes. All REST calls are proxied through Next.js rewrites so the app can call `"/api/rc"` without CORS issues.

- Base REST path: `/api/rc` → Rocket.Chat `/api/v1/*` (see `tikme-chat-poc/next.config.ts`)
- Realtime: WebSocket to `ws(s)://<RC_URL>/websocket` using DDP

## Authentication
- `POST /login` — Authenticate and obtain `authToken` (resume token) and `userId`.

## Subscriptions & Rooms
- `GET /subscriptions.get` — Fetch all rooms (channels, groups, DMs); includes metadata such as last-seen (`ls`) and unread.
- `POST /channels.create` — Create a public channel.
- `POST /im.create` — Create/open a direct message (DM) room with a user.

## History (Messages)
- `GET /channels.history` — Fetch message history for public channels.
- `GET /groups.history` — Fetch message history for private groups.
- `GET /im.history` — Fetch message history for DM rooms.

## Presence & Users
- `GET /users.presence` — Get a user’s presence (`online`, `offline`, etc.).
- `GET /users.info` — Get user details (used for presence fallback and profile).

## Messaging
- `POST /chat.postMessage` — Send a message to a room.
- `GET /chat.syncMessages` — Sync messages since a timestamp (incremental updates).

## Members & Invites
- `GET /channels.members` — List members of a public channel.
- `GET /groups.members` — List members of a private group.
- `GET /im.members` — List members in a DM (participants).
- `POST /channels.invite` — Invite a user to a public channel.
- `POST /groups.invite` — Invite a user to a private group.

## Files
- `POST /rooms.upload/:rid` — Upload a file to a room.
- `GET /file-upload/:fileId/:fileName?rc_token&rc_uid` — Download or display uploaded files.

## Realtime (DDP over WebSocket)
- `WS /websocket` — DDP connect, ping/pong.
- `method login` — DDP login using `resume: <authToken>`.
- `sub stream-room-messages` — Subscribe to realtime message stream for a room.

## Totals
- REST endpoints: 18
- Realtime actions: 3 (DDP connect/login/subscribe)

## Notes
- REST calls are executed via Axios client configured at `tikme-chat-poc/lib/rocketRest.ts`.
- Realtime subscription wiring is implemented in `tikme-chat-poc/lib/rocketDDP.ts` and consumed in `tikme-chat-poc/components/ChatLayout.tsx`.
