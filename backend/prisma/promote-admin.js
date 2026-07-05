// One-off / repeatable utility: promote a user to admin by username.
// Usage: node prisma/promote-admin.js <username>
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const username = process.argv[2];
  if (!username) {
    console.error('Usage: node prisma/promote-admin.js <username>');
    process.exit(1);
  }

  const user = await prisma.user.findUnique({ where: { username } });
  if (!user) {
    console.error(`No user found with username "${username}"`);
    process.exit(1);
  }

  if (user.isAdmin) {
    console.log(`"${username}" is already an admin.`);
  } else {
    await prisma.user.update({ where: { id: user.id }, data: { isAdmin: true } });
    console.log(`"${username}" is now an admin.`);
  }

  await prisma.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
