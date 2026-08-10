import { beforeEach, describe, expect, it } from 'vitest';
import { createInMemoryAuthStore } from './auth.memory-store';
import { bootstrapSuperAdmin } from './bootstrap-super-admin.service';
import { verifyPassword } from './password.service';

const PASSWORD = 'bootstrap-super-admin-passphrase';

describe('bootstrapSuperAdmin', () => {
  let store;

  beforeEach(() => {
    store = createInMemoryAuthStore();
  });

  it('creates an active Super Admin with Argon2id password hash only', async () => {
    const result = await bootstrapSuperAdmin(
      { store },
      {
        email: 'Admin@Agrivio.example',
        displayName: ' Platform Admin ',
        password: PASSWORD,
      },
    );

    expect(result.created).toBe(true);
    expect(result.alreadyExisted).toBe(false);
    expect(result.emailNormalized).toBe('admin@agrivio.example');
    expect(result.status).toBe('active');

    const user = await store.findUserByEmailNormalized('admin@agrivio.example');
    expect(user).not.toBeNull();
    expect(user['platformAccess']).toBe('super_admin');
    expect(user['displayName']).toBe('Platform Admin');
    expect(user['passwordHash']).toEqual(expect.any(String));
    expect(user['passwordHash']).not.toContain(PASSWORD);
    expect(JSON.stringify(user)).not.toContain(PASSWORD);
    expect(await verifyPassword(String(user['passwordHash']), PASSWORD)).toBe(true);
  });

  it('is idempotent when the same Super Admin email already exists', async () => {
    const first = await bootstrapSuperAdmin(
      { store },
      {
        email: 'sa@agrivio.example',
        displayName: 'Super Admin',
        password: PASSWORD,
      },
    );
    const second = await bootstrapSuperAdmin(
      { store },
      {
        email: 'sa@agrivio.example',
        displayName: 'Different Name',
        password: 'another-super-admin-passphrase',
      },
    );

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.alreadyExisted).toBe(true);
    expect(second.userId).toBe(first.userId);

    const user = await store.findUserByEmailNormalized('sa@agrivio.example');
    expect(user['displayName']).toBe('Super Admin');
    expect(await verifyPassword(String(user['passwordHash']), PASSWORD)).toBe(true);
  });

  it('refuses to promote an existing organization user to Super Admin', async () => {
    await store.insertUser(null, {
      email: 'owner@example.com',
      emailNormalized: 'owner@example.com',
      displayName: 'Owner',
      passwordHash: 'not-used',
      status: 'active',
      version: 1,
    });

    await expect(
      bootstrapSuperAdmin(
        { store },
        {
          email: 'owner@example.com',
          displayName: 'Hacker',
          password: PASSWORD,
        },
      ),
    ).rejects.toMatchObject({
      message: expect.stringMatching(/Refusing to promote/i),
    });
  });
});
