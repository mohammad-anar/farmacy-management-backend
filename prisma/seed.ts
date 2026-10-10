import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.INITIAL_OWNER_EMAIL || 'admin@pharmacy.com').toLowerCase().trim();
  const password = process.env.INITIAL_OWNER_PASSWORD || 'PharmacyAdmin123!';
  const name = process.env.INITIAL_OWNER_NAME || 'Pharmacy Owner';
  const pharmacyName = process.env.INITIAL_PHARMACY_NAME || 'Personal Pharmacy';

  console.log(`Checking existing admin user for ${email}...`);

  const existing = await prisma.user.findFirst({
    where: {
      OR: [{ email }, { role: Role.OWNER }],
    },
  });

  if (existing) {
    console.log(`Admin user already exists: ${existing.email} (Role: ${existing.role})`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const admin = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      pharmacyName,
      role: Role.OWNER,
    },
  });

  console.log(`Admin user created successfully: ${admin.email}`);
}

main()
  .catch((e) => {
    console.error('Seeding error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
