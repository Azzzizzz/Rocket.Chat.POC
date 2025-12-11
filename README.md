# TikMe Chat POC (Next.js + Rocket.Chat)

This app demonstrates a custom chat UI built in Next.js that connects to a local Rocket.Chat server. REST is proxied via Next rewrites; realtime room messages use Rocket.Chat’s Realtime API (WebSocket).

## Prerequisites

- Node.js 18+
- Docker + Docker Compose

## 1) Start Rocket.Chat (Docker Compose)

From repository root (contains `docker-compose.yml`):

```bash
docker compose up -d
```

Services provided:

- `rocketchat` on `http://127.0.0.1:2000`
- `mongodb` used by Rocket.Chat

Health check:

```bash
curl -s http://127.0.0.1:2000/api/v1/info | jq
```

## 2) Install and Run the Next app

From `tikme-chat-poc/`:

```bash
npm install
npm run dev
```

App URLs:

- Teacher: `http://localhost:3000/teacher-chat`
- Student: `http://localhost:3000/student-chat`

If you see a lock error during restart:

```bash
rm -f .next/dev/lock
npm run dev
```

Or choose another port:

```bash
npm run dev -- --port 3001
```

## 3) Rocket.Chat REST Proxy (required)

All REST calls go through Next rewrites to avoid CORS. Confirm this mapping:

```ts
// tikme-chat-poc/next.config.ts
async rewrites() {
  return [
    { source: '/api/rc/:path*', destination: 'http://127.0.0.1:2000/api/v1/:path*' },
  ];
}
```

REST client is configured to use `'/api/rc'`: `tikme-chat-poc/lib/rocketRest.ts:4-6`.

## 4) Realtime (WebSocket)

- Connects to `ws://127.0.0.1:2000/websocket`.
- Resumes session with REST `authToken`.
- Subscribes to `stream-room-messages` for the selected room (messages).
- Subscribes to `stream-notify-user` events for the current user to update unread counts in realtime:
  - `${userId}/subscriptions-changed`
  - `${userId}/rooms-changed`

References:

- Connect + login: `tikme-chat-poc/pages/teacher-chat.tsx:40-41`, `tikme-chat-poc/pages/student-chat.tsx:39-40`
- DDP client: `tikme-chat-poc/lib/rocketDDP.ts`
- Room subscription wiring: `tikme-chat-poc/components/ChatLayout.tsx:190-213`
- Unread notifications wiring: `tikme-chat-poc/components/ChatLayout.tsx:148-200`

## 5) Demo Flow

1. Open both pages (Teacher and Student) on the same port.
2. Teacher creates a channel: sidebar → `+ New Channel`.
3. Teacher selects the channel and clicks `Add People` to invite a student by username.
4. Send messages; student should see them in realtime.

Sample accounts used by the POC:

- `teacher1` / `1234567`
- `student1` / `1234567`

If these users don’t exist, create them in the Rocket.Chat admin UI.

## 6) Participants & Presence

- Participants panel shows current members of the selected room with two‑letter avatars.
- Presence polling displays online/offline in room list and participants.
- Code references:
  - Participants list: `tikme-chat-poc/components/ChatLayout.tsx:285-314`
  - Presence polling: `tikme-chat-poc/components/ChatLayout.tsx:108-121`
  - REST helpers: `tikme-chat-poc/lib/rocketRest.ts:77-91, 122-170`

## 7) Unread Counts & Badges

- The sidebar shows a blue circular badge with the unread message count for each room.
- Counts are driven by realtime DDP user notifications and periodically reconciled by REST polling.
- Selecting a room clears the local count and calls `POST /subscriptions.read` to mark the room as read on the server.
- Code references:
  - Badge rendering: `tikme-chat-poc/components/ChatLayout.tsx:556-560, 599-603`
  - Server mark-as-read: `tikme-chat-poc/lib/rocketRest.ts:244-256`
  - Fallback polling: `tikme-chat-poc/components/ChatLayout.tsx:124-146`

## 8) Useful Scripts

```bash
npm run lint      # ESLint
npm run build -- --webpack  # Next build using webpack (if Turbopack complains)
npm run start     # Next start (production)
```

## 9) Troubleshooting

- Proxy 404: ensure you opened the app on the port where the rewrite is active.
- Dev lock error: remove `.next/dev/lock` and restart.
- Realtime not updating: verify Rocket.Chat is reachable at `ws://127.0.0.1:2000/websocket`.
- Build error about Turbopack and custom webpack: run `npm run build -- --webpack` or add an empty `turbopack: {}` to `next.config.ts`.

## 10) Docker Compose File

The compose file lives at repository root: `docker-compose.yml`. It brings up Rocket.Chat and MongoDB with ports mapped for local development. Use `docker compose up -d` to start and `docker compose down` to stop.

```bash

version: '3.8'

services:
  rocketchat:
    image: registry.rocket.chat/rocketchat/rocket.chat:latest
    restart: unless-stopped
    volumes:
      - uploads:/app/uploads
    environment:
      - PORT=3000
      - ROOT_URL=http://localhost:2000
      - MONGO_URL=mongodb://mongo:27017/rocketchat
      - MONGO_OPLOG_URL=mongodb://mongo:27017/local
    depends_on:
      - mongo
    ports:
      - 2000:3000

  mongo:
    image: mongo:5.0
    restart: unless-stopped
    volumes:
      - db:/data/db
      - dump:/dump
    command: mongod --oplogSize 128 --replSet rs0 --storageEngine=wiredTiger
    labels:
      - "traefik.enable=false"

  # this container's job is just run the command to initialize the replica set.
  # it will run the command and remove itself (it will not stay running)
  mongo-init-replica:
    image: mongo:5.0
    command: >
      bash -c "for i in `seq 1 30`; do
        mongo mongo/rocketchat --eval \"
          rs.initiate({
            _id: 'rs0',
            members: [ { _id: 0, host: 'mongo:27017' } ]})\" &&
        s=$$? && break || s=$$?;
        echo \"Tried $$i times. Waiting 5 secs...\";
        sleep 5;
      done; (exit $$s)"
    depends_on:
      - mongo

volumes:
  uploads:
  db:
  dump:

```
