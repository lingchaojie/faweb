import { prisma } from "../src/lib/db";
import { hashPassword } from "../src/lib/password";

async function main() {
  const adminUsername = process.env.PLATFORM_ADMIN_USERNAME;
  const adminPassword = process.env.PLATFORM_ADMIN_PASSWORD;
  const adminDisplayName =
    process.env.PLATFORM_ADMIN_DISPLAY_NAME ?? adminUsername;

  if (!adminUsername || !adminPassword) {
    throw new Error(
      "PLATFORM_ADMIN_USERNAME and PLATFORM_ADMIN_PASSWORD are required",
    );
  }

  const adminPasswordHash = await hashPassword(adminPassword);

  await prisma.platformAdmin.upsert({
    where: { username: adminUsername },
    update: {
      displayName: adminDisplayName ?? adminUsername,
      passwordHash: adminPasswordHash,
    },
    create: {
      username: adminUsername,
      displayName: adminDisplayName ?? adminUsername,
      passwordHash: adminPasswordHash,
    },
  });

  // Platform admin also gets a front-end User account (role: admin)
  await prisma.user.upsert({
    where: { username: adminUsername },
    update: {
      displayName: adminDisplayName ?? adminUsername,
      role: "admin",
      passwordHash: adminPasswordHash,
    },
    create: {
      username: adminUsername,
      displayName: adminDisplayName ?? adminUsername,
      role: "admin",
      passwordHash: adminPasswordHash,
    },
  });

  const userUsername = process.env.BOOTSTRAP_USER_USERNAME;
  const userPassword = process.env.BOOTSTRAP_USER_PASSWORD;

  if (userUsername && userPassword) {
    const userPasswordHash = await hashPassword(userPassword);
    const userDisplayName =
      process.env.BOOTSTRAP_USER_DISPLAY_NAME ?? userUsername;

    await prisma.user.upsert({
      where: { username: userUsername },
      update: {
        displayName: userDisplayName,
        role: "admin",
        passwordHash: userPasswordHash,
      },
      create: {
        username: userUsername,
        displayName: userDisplayName,
        role: "admin",
        passwordHash: userPasswordHash,
      },
    });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
