from __future__ import annotations

import argparse
import shutil
from pathlib import Path

# Detector de vehículos para vista aérea/cenital (dron). CC BY 4.0.
# https://huggingface.co/rfonod/geo-trax
DEFAULT_REPO = "rfonod/geo-trax"
DEFAULT_FILENAME = "geotrax_hbb_yolov8s_1920_v1.pt"


def download_model(
    repo_id: str = DEFAULT_REPO,
    filename: str = DEFAULT_FILENAME,
    dest_dir: str | Path = "models",
) -> Path:
    from huggingface_hub import hf_hub_download

    dest_dir = Path(dest_dir)
    dest_dir.mkdir(parents=True, exist_ok=True)
    dest = dest_dir / filename
    if dest.exists():
        print(f"Ya existe: {dest}")
        return dest

    cached = hf_hub_download(repo_id=repo_id, filename=filename)
    shutil.copy(cached, dest)
    print(f"Modelo descargado en {dest}")
    return dest


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Descarga el detector de vehículos para vista aérea a models/"
    )
    parser.add_argument("--repo", default=DEFAULT_REPO)
    parser.add_argument("--filename", default=DEFAULT_FILENAME)
    parser.add_argument("--dest", default="models")
    args = parser.parse_args()
    download_model(args.repo, args.filename, args.dest)


if __name__ == "__main__":
    main()
