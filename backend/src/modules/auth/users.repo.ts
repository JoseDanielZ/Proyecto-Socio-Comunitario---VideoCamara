import type { Role } from "@conjunto/contracts";
import type { Sql } from "../../db";
import type { User, UserStore } from "./auth.service";

interface UserRow {
  id: number;
  username: string;
  full_name: string;
  role: Role;
  password_hash: string;
  is_active: number;
}

const toUser = (r: UserRow): User => ({
  id: r.id, username: r.username, fullName: r.full_name, role: r.role, passwordHash: r.password_hash,
  isActive: r.is_active === 1,
});

export class SqliteUserRepository implements UserStore {
  constructor(private readonly sql: Sql) {}

  async add(user: Omit<User, "id">): Promise<User> {
    const { lastId } = this.sql.run(
      "INSERT INTO users (username, full_name, role, password_hash, is_active) VALUES (?, ?, ?, ?, ?)",
      [user.username, user.fullName, user.role, user.passwordHash, user.isActive ? 1 : 0],
    );
    return { ...user, id: lastId };
  }

  async get(id: number): Promise<User | null> {
    const row = this.sql.get<UserRow>("SELECT * FROM users WHERE id = ?", [id]);
    return row ? toUser(row) : null;
  }

  async getByUsername(username: string): Promise<User | null> {
    const row = this.sql.get<UserRow>("SELECT * FROM users WHERE username = ?", [username]);
    return row ? toUser(row) : null;
  }

  async list(): Promise<User[]> {
    return this.sql.all<UserRow>("SELECT * FROM users ORDER BY id").map(toUser);
  }

  async update(user: User): Promise<User> {
    this.sql.run("UPDATE users SET full_name = ?, role = ?, password_hash = ?, is_active = ? WHERE id = ?", [
      user.fullName, user.role, user.passwordHash, user.isActive ? 1 : 0, user.id,
    ]);
    return user;
  }
}
