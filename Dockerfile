# Step 1: Build Frontend
FROM --platform=$BUILDPLATFORM node:20-alpine AS build-stage
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build

# Step 2: Package PocketBase and Frontend static files
FROM alpine:latest

ARG TARGETOS=linux
ARG TARGETARCH=amd64
# 服务端版本必须与前端 JS SDK 对齐（package.json 中 pocketbase ^0.27.0）。
# v0.23+ 起 hooks/migrations API 有破坏性变更，不可与 0.22 混用。
ARG PB_VERSION=0.27.0
# 运行期加密主密钥（32 字节随机字符串）。缺失或长度不为 32 时，
# wechat.pb.js 的 getMasterEncryptionKey() 会直接抛错拒绝启动。
# 生成方法：openssl rand -base64 24 | head -c 32
ARG VN_ENCRYPTION_KEY
ENV VN_ENCRYPTION_KEY=$VN_ENCRYPTION_KEY

RUN apk add --no-cache unzip ca-certificates curl

# Download and install PocketBase based on target platform architecture
RUN curl -L https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_${TARGETOS}_${TARGETARCH}.zip -o /tmp/pb.zip \
    && unzip /tmp/pb.zip -d /app/ \
    && rm /tmp/pb.zip \
    && chmod +x /app/pocketbase

# Copy static frontend files to public hosting directory of PocketBase
COPY --from=build-stage /app/dist /app/pb_public

# Copy DB migration scripts
COPY pb_migrations /app/pb_migrations

# Copy custom JS hook scripts
COPY pb_hooks /app/pb_hooks

EXPOSE 8090

# Run PocketBase server
CMD ["/app/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data"]
