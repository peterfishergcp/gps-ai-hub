FROM python:3.11-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PORT=8080
ENV DEV_MODE=false
ENV LOG_LEVEL=INFO

EXPOSE 8080

CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT}
