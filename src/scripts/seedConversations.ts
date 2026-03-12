/**
 * Seed script: створює багато DIRECT-діалогів для вказаного користувача.
 *
 * Використання:
 *   npx ts-node src/scripts/seedConversations.ts <userId> [count]
 *
 * Приклад:
 *   npx ts-node src/scripts/seedConversations.ts cmm9fmerh00043kv7su5j5js6 200
 *
 * Очищення:
 *   npx ts-node src/scripts/seedConversations.ts <userId> --cleanup
 */

import { prisma } from "../lib/prisma";

async function seedConversations({
  userId,
  count = 100,
}: {
  userId: string;
  count?: number;
}) {
  console.log(
    `\nСтворюємо ${count} DIRECT-діалогів для користувача ${userId}...\n`,
  );

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  // 1. Створюємо фейкових співрозмовників
  const fakeUsers = await Promise.all(
    Array.from({ length: count }, (_, i) => {
      const uid = `seed_conv_${userId}_${i}_${Date.now()}`;
      return prisma.user.create({
        data: {
          email: `${uid}@seed.local`,
          nickname: uid,
          password: null,
          firstName: `Seed`,
          lastName: `Contact ${i + 1}`,
          provider: "LOCAL",
        },
      });
    }),
  );

  console.log(`Створено ${fakeUsers.length} фейкових користувачів`);

  // 2. Створюємо DIRECT-діалоги з повідомленням у кожному
  let created = 0;
  for (const fakeUser of fakeUsers) {
    await prisma.conversation.create({
      data: {
        type: "DIRECT",
        participants: {
          createMany: {
            data: [{ userId }, { userId: fakeUser.id }],
          },
        },
        messages: {
          create: {
            senderId: fakeUser.id,
            text: `Hello from ${fakeUser.lastName}!`,
          },
        },
      },
    });
    created++;
    if (created % 50 === 0) {
      console.log(`  ... створено ${created}/${count}`);
    }
  }

  console.log(`\nСтворено ${created} DIRECT-діалогів`);
  console.log("Готово!\n");
}

async function cleanupSeedConversations(userId: string) {
  console.log(`\nВидаляємо seed-діалоги для користувача ${userId}...`);

  // Знаходимо фейкових користувачів
  const fakeUsers = await prisma.user.findMany({
    where: {
      nickname: { startsWith: `seed_conv_${userId}_` },
    },
    select: { id: true },
  });

  if (fakeUsers.length === 0) {
    console.log("Seed-користувачів не знайдено.\n");
    return;
  }

  const fakeUserIds = fakeUsers.map((u) => u.id);

  // Видаляємо діалоги, де один з учасників — фейковий
  const conversations = await prisma.conversationParticipant.findMany({
    where: { userId: { in: fakeUserIds } },
    select: { conversationId: true },
    distinct: ["conversationId"],
  });

  const conversationIds = conversations.map((c) => c.conversationId);

  if (conversationIds.length > 0) {
    const deletedConversations = await prisma.conversation.deleteMany({
      where: { id: { in: conversationIds } },
    });
    console.log(`Видалено ${deletedConversations.count} діалогів`);
  }

  // Видаляємо фейкових користувачів
  const deletedUsers = await prisma.user.deleteMany({
    where: { id: { in: fakeUserIds } },
  });

  console.log(`Видалено ${deletedUsers.count} фейкових користувачів\n`);
}

// ── CLI entry ────────────────────────────────────────────────────────────────
const [, , userId, countArg] = process.argv;

if (!userId) {
  console.error("Usage: ts-node seedConversations.ts <userId> [count]");
  console.error("  cleanup: ts-node seedConversations.ts <userId> --cleanup");
  process.exit(1);
}

async function main() {
  try {
    if (countArg === "--cleanup") {
      await cleanupSeedConversations(userId);
    } else {
      const count = countArg ? parseInt(countArg, 10) : 100;
      await seedConversations({ userId, count });
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(e);
  prisma.$disconnect();
  process.exit(1);
});

export { seedConversations, cleanupSeedConversations };
