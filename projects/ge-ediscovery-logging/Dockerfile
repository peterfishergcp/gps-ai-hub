FROM python:3.12-slim

RUN groupadd -r harvester && useradd -r -g harvester -d /app -s /sbin/nologin harvester

WORKDIR /app

COPY ge_harvest.py cloudrun_harvester_server.py /app/
RUN chown -R harvester:harvester /app

USER harvester

ENV PYTHONUNBUFFERED=1
EXPOSE 8080

CMD ["python3", "/app/cloudrun_harvester_server.py"]
