# chat.online.api

Backend API for chat on Express + Socket.IO + Prisma (PostgreSQL/Neon).

## What's inside

- JWT authentication (access token + refresh token in httpOnly cookie)
- REST API for users, dialogs, messages, folders, and reactions
- Real-time events via Socket.IO
- Prisma ORM and migrations

## Technologies

- Node.js + TypeScript
- Express 5
- Socket.IO 4
- Prisma 7
- PostgreSQL (via Prisma Neon adapter)

## Project Structure

- src/index.ts: entry point for HTTP and Socket.IO
- src/router/router.ts: REST API routes
- src/controllers: HTTP controllers
- src/service: business logic and data access
- src/socket.ts: Socket.IO handlers registration
- src/socketHandlers: decomposed realtime handlers
- src/lib/prisma.ts: Prisma client
- src/lib/io.ts: shared Socket.IO instance (avoids cyclic imports)
- prisma/schema.prisma: DB schema
- prisma/migrations: migrations

## Quick Start

### 1. Installation

```bash
npm install
```

### 2. Environment Variables

Create a .env file in the project root.

Minimal set:

```env
DATABASE_URL=postgresql://USER:PASSWORD@HOST:PORT/DB
JWT_ACCESS_SECRET=your_access_secret
JWT_REFRESH_SECRET=your_refresh_secret
GOOGLE_CLIENT_ID=your_google_client_id
CORS=http://localhost:5173,http://localhost:3000
PORT=3000
NODE_ENV=development
JWT_ACCESS_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=30d
```

Notes:

- CORS accepts a comma-separated list of origins.
- JWT_ACCESS_EXPIRES_IN and JWT_REFRESH_EXPIRES_IN are optional, defaults are 15m and 30d.
- If required variables are missing, getEnv throws an error at startup.

### 3. Prisma Migrations

```bash
npx prisma migrate dev
npx prisma generate
```

If you just need to apply existing migrations:

```bash
npx prisma migrate deploy
```

### 4. Run

Development mode:

```bash
npm run dev
```

Additionally:

```bash
npm run lint
npm run format
npm run seed:reactions
```

## Authentication

### Access token

- Sent in Authorization header: Bearer <token>
- Checked in src/middlewares/authMiddleware.ts

### Refresh token

- Stored in refreshToken cookie (httpOnly)
- Issued on login/register/refresh
- Used by POST /auth/refresh endpoint

## Error Format

Errors are returned in a unified format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## REST API

Base URL: http://localhost:3000

### Public

- GET /: welcome response
- GET /health: healthcheck + user count
- POST /auth/register
- POST /auth/login
- POST /auth/refresh
- POST /auth/logout
- POST /auth/google

### Protected (Bearer token)

#### User

- GET /user/me
- PATCH /user
- GET /user/:id

#### Chat: conversations

- GET /chat/conversation?conversationId=... or ?recipientId=...
- GET /chat/conversations/init
- GET /chat/conversations?ids=id1,id2
- POST /chat/conversations
- DELETE /chat/conversations/:id
- PATCH /chat/conversations/:id/settings
- POST /chat/conversations/:conversationId/leave
- GET /chat/conversations/:conversationId/participants
- POST /chat/conversations/:conversationId/participants
- DELETE /chat/conversations/:conversationId/participants/:participantId

#### Chat: messages and reactions

- POST /chat/conversations/:id/messages
- GET /chat/conversations/:id/messages
- GET /chat/conversations/:conversationId/messages/:messageId/reactors

#### Chat: folders and pinning

- POST /chat/folders
- PATCH /chat/folders/:folderId
- DELETE /chat/folders/:folderId
- POST /chat/folders/:folderId/conversations/:conversationId
- DELETE /chat/folders/:folderId/conversations/:conversationId
- PATCH /chat/pinned-positions

#### Search

- GET /chat/search?query=...&type=users

## Important Details about Create Conversation

POST /chat/conversations accepts:

```json
{
  "participantIds": ["userId"],
  "type": "DIRECT",
  "title": null,
  "avatarUrl": null
}
```

Validation in the controller includes:

- type must be DIRECT or GROUP
- participantIds must be a non-empty array of strings
- for GROUP, title is required
- for DIRECT, must be a 1:1 dialog (two participants in the final set)

## Message Pagination

GET /chat/conversations/:id/messages supports query parameters:

- cursor: message id
- direction: UP or DOWN
- jumpToLatest: true/false

## Socket.IO

### Connection

- Socket server is started in src/index.ts
- Socket authorization via handshake.auth.token
- Middleware: src/middlewares/socketAuthMiddleware.ts

Client example:

```ts
const socket = io("http://localhost:3000", {
  auth: {
    token: accessToken,
  },
});
```

### Rooms

- User automatically joins a room named after their userId
- For chats, client subscribes to conversationId via conversation:join event

### Client -> Server Events

- lastSeenAt:update
- subscribe:lastSeenAt (payload: userId)
- unsubscribe:lastSeenAt (payload: userId)
- activity:start (payload: { conversationId, nickname, reason })
- activity:stop (payload: { conversationId, nickname })
- conversation:join (payload: { conversationId: string | string[], oldConversationId? })
- conversation:leave (payload: { conversationId: string[] })
- message:send (payload: { conversationId?, recipientId?, text, replyToMessageId?, media?, tempId? })
- message:read (payload: { conversationId, lastReadMessageId })
- message:delete (payload: { messageId })
- message:edit (payload: { messageId, conversationId, newText, replaceMedia? })
- reaction:add (payload: { messageId, content })
- reaction:remove (payload: { messageId })

### Server -> Client Events

- lastSeenAt:update
- activity:start
- activity:stop
- conversation:new
- conversation:update
- conversation:deleted
- conversation:userRemoved
- conversation:participantsAdded
- message:new
- message:sent
- message:read
- message:deleted
- message:edited
- reaction:new
- reaction:removed
- error
- conversation:error

## Data Model (short)

Main Prisma entities:

- User
- Conversation
- ConversationParticipant
- Message
- MessageMedia
- Reaction
- Folder
- FolderConversation
- RefreshToken

Schema: prisma/schema.prisma

## Good to Know

- The code uses decomposition of socket logic by files in src/socketHandlers.
- Socket.IO instance is moved to src/lib/io.ts to avoid cyclic dependencies.
- For production, it is recommended to set up strict CORS and HTTPS, as well as JWT secrets rotation.
