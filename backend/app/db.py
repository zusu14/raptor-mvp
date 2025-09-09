from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from pathlib import Path
import os

# モデル定義側の Base（app.models.base）を利用してメタデータを統一
from app.models.base import Base

# DB パスを環境に応じて解決（Docker: /app/data/app.db、ローカル: <repo>/data/app.db）
_container_data = Path("/app/data")
if _container_data.exists():
    db_path = _container_data / "app.db"
else:
    # backend/app/db.py → ../../.. = <repo root>
    repo_root = Path(__file__).resolve().parents[2]
    db_path = repo_root / "data" / "app.db"

SQLALCHEMY_DATABASE_URL = f"sqlite:///{db_path}"

# ディレクトリ作成（存在しない場合）
db_path.parent.mkdir(parents=True, exist_ok=True)

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db() -> None:
    # パッケージ配下の各モデルモジュールを明示 import してメタデータ登録を確実化
    import app.models.survey  # noqa: F401
    import app.models.observation  # noqa: F401
    import app.models.flightline  # noqa: F401
    import app.models.photo  # noqa: F401
    import app.models.photolink  # noqa: F401
    import app.models.observation_point  # noqa: F401
    import app.models.observation_polygon  # noqa: F401
    Base.metadata.create_all(bind=engine)


def get_db():
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()
