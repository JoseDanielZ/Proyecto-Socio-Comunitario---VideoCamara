import { Router } from "express";
import { rateLimit } from "express-rate-limit";
import { loginInSchema, userCreateSchema, userUpdateSchema, type Session, type User as UserDto } from "@conjunto/contracts";
import { invalid } from "../../shared/errors";
import { currentUser, parse, requireRole, requireSession } from "../../shared/http";
import type { AuthService, User } from "./auth.service";

export const toUserDto = (u: User): UserDto => ({
  id: u.id, username: u.username, full_name: u.fullName, role: u.role, is_active: u.isActive,
});

export function authRoutes(auth: AuthService, opts: { loginMaxAttempts: number }): Router {
  const router = Router();
  const session = requireSession(auth);
  const adminOnly = requireRole("admin");

  // Frena adivinar claves: N intentos fallidos por IP cada 15 minutos (los correctos no cuentan).
  const loginLimiter = rateLimit({
    windowMs: 15 * 60_000,
    limit: opts.loginMaxAttempts,
    skipSuccessfulRequests: true,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, res) =>
      void res.status(429).json({ detail: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo." }),
  });

  router.post("/auth/login", loginLimiter, async (req, res) => {
    const { username, password } = parse(loginInSchema, req.body);
    const { accessToken, user } = await auth.login(username, password);
    const body: Session = { access_token: accessToken, user: toUserDto(user) };
    res.json(body);
  });

  router.get("/auth/me", session, (req, res) => {
    const me = currentUser(req);
    res.json({ id: me.id, username: me.username, full_name: me.fullName, role: me.role, is_active: true } satisfies UserDto);
  });

  router.get("/users", session, adminOnly, async (_req, res) => {
    res.json((await auth.listUsers()).map(toUserDto));
  });

  router.post("/users", session, adminOnly, async (req, res) => {
    res.status(201).json(toUserDto(await auth.createUser(parse(userCreateSchema, req.body))));
  });

  router.patch("/users/:id", session, adminOnly, async (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) throw invalid("Identificador de usuario inválido");
    res.json(toUserDto(await auth.updateUser(id, parse(userUpdateSchema, req.body))));
  });

  return router;
}
