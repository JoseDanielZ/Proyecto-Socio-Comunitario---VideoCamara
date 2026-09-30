export type FrameListener = (jpeg: Buffer) => void;

/**
 * Guarda el último fotograma JPEG de cada cámara y avisa a quien lo está mirando.
 * Solo sabe de fotogramas: el estado de la cámara es responsabilidad de CamerasService.
 */
export class FrameHub {
  private readonly latestFrames = new Map<string, Buffer>();
  private readonly listeners = new Map<string, Set<FrameListener>>();

  publish(cameraId: string, jpeg: Buffer): void {
    this.latestFrames.set(cameraId, jpeg);
    for (const listener of this.listeners.get(cameraId) ?? []) listener(jpeg);
  }

  latest(cameraId: string): Buffer | undefined {
    return this.latestFrames.get(cameraId);
  }

  /** Recibe cada fotograma nuevo. Devuelve la función para dejar de recibirlos. */
  subscribe(cameraId: string, listener: FrameListener): () => void {
    const set = this.listeners.get(cameraId) ?? new Set();
    set.add(listener);
    this.listeners.set(cameraId, set);
    return () => void set.delete(listener);
  }

  viewers(cameraId: string): number {
    return this.listeners.get(cameraId)?.size ?? 0;
  }
}
