FROM alpine:latest
RUN apk add --no-cache curl
CMD curl -s -o /dev/null -w "%{http_code}" "${APP_URL}/api/health"
