from __future__ import annotations

import argparse
import logging

import cv2

from .config import load_config
from .pipeline import Pipeline
from .video_source import VideoSource


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Pipeline base de reconocimiento de placas (entrada/salida)"
    )
    parser.add_argument("--config", required=True, help="Ruta al archivo config.yaml")
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Mostrar ventana de depuración con cajas, IDs y línea de conteo",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    config = load_config(args.config)

    logging.basicConfig(
        level=getattr(logging, config.runtime.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logger = logging.getLogger(__name__)

    preview = args.preview or config.runtime.preview

    with VideoSource(config.source) as source:
        with Pipeline(config, frame_rate=source.info.fps) as pipeline:
            annotator = None
            if preview:
                from .annotators import DebugAnnotator

                annotator = DebugAnnotator(pipeline.line_zones)

            try:
                for frame in source.frames():
                    detections = pipeline.process(frame)
                    if annotator is not None:
                        annotated = annotator.annotate(frame, detections)
                        cv2.imshow("LPR preview", annotated)
                        if cv2.waitKey(1) & 0xFF == ord("q"):
                            break
            except KeyboardInterrupt:
                logger.info("Interrumpido por el usuario, cerrando...")
            finally:
                if preview:
                    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
