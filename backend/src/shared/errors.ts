/** Error que el usuario debe ver: lleva su código HTTP. Todo lo demás se responde como 500 genérico. */
export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const unauthorized = (message = "Falta iniciar sesión") => new AppError(401, message);
export const forbidden = (message = "No tienes permiso para esta acción") => new AppError(403, message);
export const notFound = (message: string) => new AppError(404, message);
export const conflict = (message: string) => new AppError(409, message);
export const invalid = (message: string) => new AppError(422, message);
