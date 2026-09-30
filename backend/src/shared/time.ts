/** Reloj inyectable: los servicios lo reciben para poder probar ventanas de tiempo sin esperar. */
export type Clock = () => Date;

export const systemClock: Clock = () => new Date();

export const MINUTE_MS = 60_000;
export const HOUR_MS = 60 * MINUTE_MS;
