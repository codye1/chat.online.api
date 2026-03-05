/**
 * Seed script: генерує багато реакцій на повідомлення для тестування пагінації.
 *
 * Використання:
 *   npx ts-node src/scripts/seedReactions.ts <messageId> [count] [emojis]
 *
 * Приклад:
 *   npx ts-node src/scripts/seedReactions.ts cm123abc 100 👍,❤️,😂
 *
 * Оскільки Reaction має @@unique([messageId, userId]),
 * скрипт створює тимчасових фейкових користувачів і потім додає від них реакції.
 */

import { prisma } from "../lib/prisma";

const DEFAULT_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

async function seedReactions({
  messageId,
  count = 50,
  emojis = DEFAULT_EMOJIS,
}: {
  messageId: string;
  count?: number;
  emojis?: string[];
}) {
  console.log(
    `\nСтворюємо ${count} реакцій для повідомлення ${messageId}...\n`,
  );

  // 1. Перевіряємо що повідомлення існує
  const message = await prisma.message.findUnique({ where: { id: messageId } });
  if (!message) {
    throw new Error(`Message not found: ${messageId}`);
  }

  // 2. Створюємо фейкових користувачів
  const fakeUsers = await Promise.all(
    Array.from({ length: count }, (_, i) => {
      const uid = `seed_${messageId}_${i}_${Date.now()}`;
      return prisma.user.create({
        data: {
          email: `${uid}@seed.local`,
          nickname: uid,
          password: null,
          firstName: `Seed`,
          lastName: `User ${i + 1}`,
          provider: "LOCAL",
        },
      });
    }),
  );

  console.log(`Створено ${fakeUsers.length} фейкових користувачів`);

  // 3. Додаємо реакції від кожного фейкового користувача
  const reactions = await prisma.$transaction(
    fakeUsers.map((user, i) =>
      prisma.reaction.create({
        data: {
          messageId,
          userId: user.id,
          content: emojis[i % emojis.length],
        },
      }),
    ),
  );

  console.log(`Створено ${reactions.length} реакцій`);

  // Підраховуємо розподіл по emoji
  const dist: Record<string, number> = {};
  for (const r of reactions) {
    dist[r.content] = (dist[r.content] ?? 0) + 1;
  }
  console.log("\nРозподіл реакцій:");
  for (const [emoji, cnt] of Object.entries(dist)) {
    console.log(`  ${emoji}  →  ${cnt}`);
  }

  console.log("\nГотово!\n");
  return { users: fakeUsers, reactions };
}

async function cleanupSeedReactions(messageId: string) {
  console.log(`\nВидаляємо seed-реакції для повідомлення ${messageId}...`);

  const deleted = await prisma.user.deleteMany({
    where: {
      nickname: { startsWith: `seed_${messageId}_` },
    },
  });

  console.log(
    `Видалено ${deleted.count} фейкових користувачів (cascade видалив реакції)\n`,
  );
}

// ── CLI entry ────────────────────────────────────────────────────────────────
const [, , messageId, countArg, emojisArg] = process.argv;

if (!messageId) {
  console.error("Usage: ts-node seedReactions.ts <messageId> [count] [emojis]");
  console.error("  cleanup: ts-node seedReactions.ts <messageId> --cleanup");
  process.exit(1);
}

async function main() {
  try {
    if (countArg === "--cleanup") {
      await cleanupSeedReactions(messageId);
    } else {
      const count = countArg ? parseInt(countArg, 10) : 50;
      const emojis = emojisArg ? emojisArg.split(",") : DEFAULT_EMOJIS;
      await seedReactions({ messageId, count, emojis });
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

export { seedReactions, cleanupSeedReactions };
