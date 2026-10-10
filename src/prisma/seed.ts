import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.INITIAL_OWNER_EMAIL || 'admin@pharmacy.com';
  const rawPassword = process.env.INITIAL_OWNER_PASSWORD || 'PharmacyAdmin123!';
  const name = process.env.INITIAL_OWNER_NAME || 'Pharmacy Owner';
  const pharmacyName = process.env.INITIAL_PHARMACY_NAME || 'Personal Pharmacy';

  console.log(`Checking if owner account exists for ${email}...`);

  const existingOwner = await prisma.user.findUnique({
    where: { email },
  });

  if (!existingOwner) {
    const passwordHash = await bcrypt.hash(rawPassword, 12);
    const owner = await prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        pharmacyName,
        role: 'OWNER',
      },
    });
    console.log(`Created default owner account: ${owner.email} (ID: ${owner.id})`);
  } else {
    console.log(`Owner account ${email} already exists. Skipping creation.`);
  }
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
