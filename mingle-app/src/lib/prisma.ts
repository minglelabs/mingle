import { PrismaClient } from "@prisma/client/index";
import { ensureDatabaseSchemaParam } from "./database-url";

type PrismaClientLike = PrismaClient;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientLike | undefined;
};

function prismaClientSingleton() {
  const databaseUrl = ensureDatabaseSchemaParam(process.env.DATABASE_URL, "app");
  if (databaseUrl) {
    return new PrismaClient({
      datasources: {
        db: {
          url: databaseUrl,
        },
      },
    });
  }
  return new PrismaClient();
}

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
