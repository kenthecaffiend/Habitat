FROM python:3.13-slim@sha256:57b29a7c050c4e679e4bea572e14b3965cf4b5839de2da49d55e49ffc4024f39
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
COPY requirements.txt /opt/requirements.txt
RUN pip install --no-cache-dir --no-deps --only-binary=:all: --require-hashes -r /opt/requirements.txt
COPY render.py /opt/render.py
USER 65532:65532
ENTRYPOINT ["python", "-I", "/opt/render.py"]
