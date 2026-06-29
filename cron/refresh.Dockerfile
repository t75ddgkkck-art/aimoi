FROM alpine:latest
RUN apk add --no-cache curl
CMD curl -s -X GET "${APP_URL}/api/cron" -H "Authorization: Bearer ${CRON_SECRET}"
