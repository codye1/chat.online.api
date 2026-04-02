# chat.online.api

Backend API для чату на Express + Socket.IO + Prisma (PostgreSQL/Neon).

## Що всередині

- JWT-автентифікація (access token + refresh token у httpOnly cookie)
- REST API для користувачів, діалогів, повідомлень, папок і реакцій
- Real-time події через Socket.IO
- Prisma ORM і міграції

## Технології

- Node.js + TypeScript
- Express 5
- Socket.IO 4
- Prisma 7
- PostgreSQL (через Prisma Neon adapter)

## Структура проєкту

- src/index.ts: вхідна точка HTTP і Socket.IO
- src/router/router.ts: маршрути REST API
- src/controllers: HTTP-контролери
- src/service: бізнес-логіка та доступ до даних
- src/socket.ts: реєстрація Socket.IO обробників
- src/socketHandlers: декомпозовані realtime-обробники
- src/lib/prisma.ts: Prisma клієнт
- src/lib/io.ts: спільний екземпляр Socket.IO (без циклічних імпортів)
- prisma/schema.prisma: схема БД
- prisma/migrations: міграції

## Швидкий старт

## 1. Встановлення

```bash
npm install
```

## 2. Змінні середовища

Створіть файл .env у корені проєкту.

Мінімальний набір:

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

Примітки:

- CORS приймає список origin через кому.
- JWT_ACCESS_EXPIRES_IN і JWT_REFRESH_EXPIRES_IN опціональні, є дефолти 15m і 30d.
- За відсутності обов'язкових змінних getEnv викидає помилку під час старту.

## 3. Міграції Prisma

```bash
npx prisma migrate dev
npx prisma generate
```

Якщо потрібно просто застосувати наявні міграції:

```bash
npx prisma migrate deploy
```

## 4. Запуск

Режим розробки:

```bash
npm run dev
```

Додатково:

```bash
npm run lint
npm run format
npm run seed:reactions
```

## Автентифікація

### Access token

- Передається в заголовку Authorization: Bearer <token>
- Перевіряється у src/middlewares/authMiddleware.ts

### Refresh token

- Зберігається в cookie refreshToken (httpOnly)
- Видається при login/register/refresh
- Використовується ендпоінтом POST /auth/refresh

## Формат помилок

Помилки повертаються в єдиному форматі:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

## REST API

Базовий URL: http://localhost:3000

### Public

- GET /: вітальна відповідь
- GET /health: healthcheck + кількість користувачів
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

- GET /chat/conversation?conversationId=... або ?recipientId=...
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

## Важливі деталі щодо create conversation

POST /chat/conversations приймає:

```json
{
  "participantIds": ["userId"],
  "type": "DIRECT",
  "title": null,
  "avatarUrl": null
}
```

Валідація в контролері включає:

- type має бути DIRECT або GROUP
- participantIds має бути непорожнім масивом рядків
- для GROUP обов'язковий title
- для DIRECT має бути діалог 1:1 (два учасники в підсумковому наборі)

## Пагінація повідомлень

GET /chat/conversations/:id/messages підтримує query параметри:

- cursor: id повідомлення
- direction: UP або DOWN
- jumpToLatest: true/false

## Socket.IO

### Підключення

- Socket сервер підіймається в src/index.ts
- Авторизація сокета через handshake.auth.token
- Middleware: src/middlewares/socketAuthMiddleware.ts

Приклад клієнта:

```ts
const socket = io("http://localhost:3000", {
  auth: {
    token: accessToken,
  },
});
```

### Кімнати

- Користувач автоматично приєднується до кімнати з іменем userId
- Для чатів клієнт підписується на conversationId через подію conversation:join

### Клієнт -> сервер події

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

### Сервер -> клієнт події

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

## Модель даних (коротко)

Основні сутності Prisma:

- User
- Conversation
- ConversationParticipant
- Message
- MessageMedia
- Reaction
- Folder
- FolderConversation
- RefreshToken

Схема: prisma/schema.prisma

## Корисно знати

- Код використовує декомпозицію сокет-логіки за файлами в src/socketHandlers.
- Екземпляр Socket.IO винесено в src/lib/io.ts, щоб уникнути циклічних залежностей.
- Для production бажано налаштувати strict CORS і HTTPS, а також ротацію JWT secrets.
