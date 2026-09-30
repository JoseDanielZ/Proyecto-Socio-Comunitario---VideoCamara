import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { roleSchema, type Role } from "@conjunto/contracts";
import type { PasswordHasher, TokenIssuer } from "./auth.service";

export class BcryptHasher implements PasswordHasher {
  // 10 vueltas es el estándar; las pruebas usan 4 para no tardar.
  constructor(private readonly rounds = 10) {}

  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, this.rounds);
  }

  verify(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}

export class JwtTokens implements TokenIssuer {
  constructor(
    private readonly secret: string,
    private readonly expiresMinutes: number,
  ) {}

  issue(user: { id: number; role: Role }): string {
    return jwt.sign({ role: user.role }, this.secret, {
      subject: String(user.id),
      expiresIn: this.expiresMinutes * 60,
      algorithm: "HS256",
    });
  }

  verify(token: string): { userId: number; role: Role } {
    // Se fija el algoritmo: nunca aceptar "none" ni otro que el token pida.
    const payload = jwt.verify(token, this.secret, { algorithms: ["HS256"] });
    if (typeof payload === "string") throw new Error("token inválido");
    return { userId: Number(payload.sub), role: roleSchema.parse(payload.role) };
  }
}
