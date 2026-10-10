import { Injectable, OnApplicationBootstrap, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';
import * as bcrypt from 'bcrypt';
import { Role } from '@prisma/client';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async onApplicationBootstrap() {
    await this.seedAdminUser();
  }

  async seedAdminUser() {
    const email = (
      this.configService.get<string>('INITIAL_OWNER_EMAIL') || 'admin@pharmacy.com'
    )
      .toLowerCase()
      .trim();
    const password =
      this.configService.get<string>('INITIAL_OWNER_PASSWORD') || 'PharmacyAdmin123!';
    const name =
      this.configService.get<string>('INITIAL_OWNER_NAME') || 'Pharmacy Owner';
    const pharmacyName =
      this.configService.get<string>('INITIAL_PHARMACY_NAME') || 'Personal Pharmacy';

    try {
      // Check if any admin user or user with this email exists
      const existingUser = await this.prisma.user.findFirst({
        where: {
          OR: [{ email }, { role: Role.OWNER }],
        },
      });

      if (existingUser) {
        this.logger.log(
          `[Admin Seed] Admin user already exists: ${existingUser.email} (Role: ${existingUser.role}). Skipping seed.`,
        );
        return existingUser;
      }

      // Hash default admin password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      const createdUser = await this.prisma.user.create({
        data: {
          email,
          passwordHash,
          name,
          pharmacyName,
          role: Role.OWNER,
        },
      });

      this.logger.log(
        `[Admin Seed] Default Admin created successfully -> Email: ${createdUser.email} | Pharmacy: ${pharmacyName}`,
      );
      return createdUser;
    } catch (error) {
      this.logger.error('[Admin Seed] Failed to check/seed admin user:', error);
    }
  }
}
