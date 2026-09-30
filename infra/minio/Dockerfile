# MinIO no longer publishes images to Docker Hub, so build it from source (pinned release).
FROM golang:1.24-bookworm AS build
ARG GOPROXY=https://proxy.golang.org,direct
ARG MINIO_VERSION=RELEASE.2025-04-22T22-12-26Z
ENV GOPROXY=$GOPROXY CGO_ENABLED=0 GOTOOLCHAIN=auto
RUN go install github.com/minio/minio@${MINIO_VERSION}

FROM debian:bookworm-slim
COPY --from=build /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY --from=build /go/bin/minio /usr/bin/minio
EXPOSE 9000 9001
ENTRYPOINT ["minio"]
