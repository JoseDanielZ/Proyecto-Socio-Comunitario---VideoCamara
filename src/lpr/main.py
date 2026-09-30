from __future__ import annotations

import argparse
import logging
from collections import Counter
from pathlib import Path

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
        "--video",
        help="Usar este archivo de video en vez de la fuente configurada en config.yaml",
    )
    parser.add_argument(
        "--preview",
        action="store_true",
        help="Mostrar ventana de depuración con cajas, IDs, color y línea de conteo",
    )
    parser.add_argument(
        "--output",
        help="Guardar el video anotado en esta ruta (.mp4); funciona sin ventana",
    )
    return parser.parse_args()


def _print_summary(pipeline: Pipeline) -> None:
    crossings = pipeline.crossing_summary()
    print(f"\n=== Vehículos que cruzaron la línea: {len(crossings)} ===")
    for item in crossings:
        print(
            f"  #{item['tracker_id']:<3} {item['vehicle_type']:<11} "
            f"color={item['color']:<10} sentido={item['direction']:<8} frame={item['frame']}"
        )
    print("Por tipo :", dict(Counter(c["vehicle_type"] for c in crossings)))
    print("Por color:", dict(Counter(c["color"] for c in crossings)))

    tracks = pipeline.track_summary()
    print(f"\nVehículos distintos trackeados en todo el video: {len(tracks)}")
    for item in tracks:
        print(
            f"  #{item['tracker_id']:<3} {item['vehicle_type']:<11} "
            f"color={item['color']:<10} visto en {item['frames']} frames"
        )


def main() -> None:
    args = parse_args()
    config = load_config(args.config)
    if args.video:
        config.source.type = "file"
        config.source.path_or_url = args.video

    logging.basicConfig(
        level=getattr(logging, config.runtime.log_level.upper(), logging.INFO),
        format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    )
    logger = logging.getLogger(__name__)

    preview = args.preview or config.runtime.preview
    annotate = preview or bool(args.output)

    with VideoSource(config.source) as source:
        info = source.info
        with Pipeline(config, frame_rate=info.fps) as pipeline:
            annotator = None
            writer = None
            if annotate:
                from .annotators import DebugAnnotator

                annotator = DebugAnnotator(pipeline.line_zones)
            if args.output:
                output_path = Path(args.output)
                output_path.parent.mkdir(parents=True, exist_ok=True)
                writer = cv2.VideoWriter(
                    str(output_path),
                    cv2.VideoWriter_fourcc(*"mp4v"),
                    info.fps,
                    (info.width, info.height),
                )

            try:
                for frame in source.frames():
                    detections = pipeline.process(frame)
                    if annotator is not None:
                        annotated = annotator.annotate(frame, detections, pipeline.crossing_summary())
                        if writer is not None:
                            writer.write(annotated)
                        if preview:
                            cv2.imshow("LPR preview", annotated)
                            if cv2.waitKey(1) & 0xFF == ord("q"):
                                break
            except KeyboardInterrupt:
                logger.info("Interrumpido por el usuario, cerrando...")
            finally:
                if writer is not None:
                    writer.release()
                    logger.info("Video anotado guardado en %s", args.output)
                if preview:
                    cv2.destroyAllWindows()

            _print_summary(pipeline)


if __name__ == "__main__":
    main()
