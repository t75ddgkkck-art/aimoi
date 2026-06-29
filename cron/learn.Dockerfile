FROM alpine:latest
RUN apk add --no-cache curl
CMD curl -s -X GET "${APP_URL}/api/learn" -H "Authorization: Bearer ${CRON_SECRET}"
