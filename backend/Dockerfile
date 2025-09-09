# backend/Dockerfile
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Pillow などで使う最小のネイティブ依存
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libjpeg62-turbo-dev \
    zlib1g-dev \
  && rm -rf /var/lib/apt/lists/*

# Python 依存のインストール
COPY requirements.txt /tmp/requirements.txt
RUN python -m pip install --upgrade pip && pip install -r /tmp/requirements.txt

# 実行時にボリュームで上書きされるが、一応作成
RUN mkdir -p /app/app /app/data /app/templates

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
