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
ARG PB_VERSION=0.22.20

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

EXPOSE 8090

# Run PocketBase server
CMD ["/app/pocketbase", "serve", "--http=0.0.0.0:8090", "--dir=/pb_data"]
