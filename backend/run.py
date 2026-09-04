"""Entry-point — run with: python run.py"""

import os

os.environ.setdefault("CUDA_VISIBLE_DEVICES", "-1")
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")

from app import create_app

app = create_app()

if __name__ == "__main__":
    app.run(
        debug=app.config.get("DEBUG", False),
        use_reloader=False,
        host="0.0.0.0",
        port=5000,
    )  # nosec B104
