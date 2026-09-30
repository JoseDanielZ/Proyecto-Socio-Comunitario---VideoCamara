import type { NewUser, Role, UserUpdate } from "@conjunto/contracts";
import { conflict, invalid, notFound, unauthorized } from "../../shared/errors";
import type { AuthUser, Authenticator } from "../../shared/http";

export interface User {
  id: number;
  username: string;
  fullName: string;
  role: Role;
  passwordHash: string;
  isActive: boolean;
}

// Interfaces definidas donde se consumen (inversión de dependencias): el servicio no sabe si los
// usuarios viven en SQLite ni si las claves usan bcrypt o argon2.
export interface UserStore {
  add(user: Omit<User, "id">): Promise<User>;
  get(id: number): Promise<User | null>;
  getByUsername(username: string): Promise<User | null>;
  list(): Promise<User[]>;
  update(user: User): Promise<User>;
}

export interface PasswordHasher {
  hash(plain: string): Promise<string>;
  verify(plain: string, hash: string): Promise<boolean>;
}

export interface TokenIssuer {
  issue(user: { id: number; role: Role }): string;
  /** Lanza si el token es inválido o expiró. */
  verify(token: string): { userId: number; role: Role };
}

export const toAuthUser = (u: User): AuthUser => ({ id: u.id, username: u.username, fullName: u.fullName, role: u.role });

export class AuthService implements Authenticator {
  // Contra esta clave se compara cuando el usuario no existe: así login tarda igual con usuario
  // inexistente que con clave mala y no se puede averiguar qué usuarios existen.
  private decoyHash: Promise<string>;

  constructor(
    private readonly users: UserStore,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
  ) {
    this.decoyHash = hasher.hash("clave-señuelo");
  }

  async login(username: string, password: string): Promise<{ accessToken: string; user: User }> {
    const user = await this.users.getByUsername(username.trim().toLowerCase());
    const matches = await this.hasher.verify(password, user?.passwordHash ?? (await this.decoyHash));
    if (!user || !user.isActive || !matches) throw unauthorized("Usuario o contraseña incorrectos");
    return { accessToken: this.tokens.issue(user), user };
  }

  async authenticate(token: string): Promise<AuthUser> {
    let payload: { userId: number };
    try {
      payload = this.tokens.verify(token);
    } catch {
      throw unauthorized("Sesión inválida o expirada");
    }
    const user = await this.users.get(payload.userId);
    if (!user || !user.isActive) throw unauthorized("Sesión inválida");
    return toAuthUser(user);
  }

  async createUser(input: NewUser): Promise<User> {
    const username = input.username.trim().toLowerCase();
    const fullName = input.full_name.trim();
    if (!username || !fullName) throw invalid("Usuario y nombre son obligatorios");
    if (await this.users.getByUsername(username)) throw conflict(`El usuario '${username}' ya existe`);
    return this.users.add({
      username, fullName, role: input.role, isActive: true, passwordHash: await this.hasher.hash(input.password),
    });
  }

  listUsers(): Promise<User[]> {
    return this.users.list();
  }

  async updateUser(id: number, patch: UserUpdate): Promise<User> {
    const user = await this.users.get(id);
    if (!user) throw notFound("Usuario no encontrado");
    return this.users.update({
      ...user,
      fullName: patch.full_name?.trim() ?? user.fullName,
      role: patch.role ?? user.role,
      isActive: patch.is_active ?? user.isActive,
      passwordHash: patch.password ? await this.hasher.hash(patch.password) : user.passwordHash,
    });
  }

  /** Nombres por id, para mostrar quién hizo qué en tickets. */
  async names(): Promise<Map<number, string>> {
    return new Map((await this.users.list()).map((u) => [u.id, u.fullName]));
  }

  async isActive(id: number): Promise<boolean> {
    return (await this.users.get(id))?.isActive ?? false;
  }
}
