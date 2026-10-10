import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: PrismaService;

  const mockUser = {
    id: '65f1234567890abcdef12345',
    email: 'admin@pharmacy.com',
    name: 'Pharmacy Owner',
    pharmacyName: 'Personal Pharmacy',
    passwordHash: '',
    role: 'OWNER',
  };

  const mockPrismaService = {
    user: {
      findUnique: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
  };

  const mockJwtService = {
    signAsync: jest.fn().mockResolvedValue('mocked_jwt_access_token'),
  };

  const mockConfigService = {
    get: jest.fn((key: string) => {
      if (key === 'JWT_ACCESS_SECRET') return 'test_secret';
      if (key === 'JWT_ACCESS_EXPIRATION') return '15m';
      return null;
    }),
  };

  beforeAll(async () => {
    mockUser.passwordHash = await bcrypt.hash('CorrectPassword123!', 10);
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should authenticate with valid credentials and return access + refresh tokens', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(mockUser);
    mockPrismaService.refreshToken.create.mockResolvedValue({});

    const result = await service.login({
      email: 'admin@pharmacy.com',
      password: 'CorrectPassword123!',
    });

    expect(result).toHaveProperty('accessToken', 'mocked_jwt_access_token');
    expect(result).toHaveProperty('refreshToken');
    expect(result.user.email).toBe('admin@pharmacy.com');
  });

  it('should throw UnauthorizedException on invalid password', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(mockUser);

    await expect(
      service.login({
        email: 'admin@pharmacy.com',
        password: 'WrongPassword!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException on non-existent user', async () => {
    mockPrismaService.user.findUnique.mockResolvedValue(null);

    await expect(
      service.login({
        email: 'nonexistent@pharmacy.com',
        password: 'SomePassword123!',
      }),
    ).rejects.toThrow(UnauthorizedException);
  });
});
