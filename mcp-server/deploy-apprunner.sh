#!/usr/bin/env bash
# Deploy MCP server to AWS App Runner via Docker + ECR.
# Usage:
#   export ECR_REPOSITORY_URI=123456789012.dkr.ecr.eu-west-1.amazonaws.com/my-repo
#   export AWS_REGION=eu-west-1   # optional if ECR URI contains region
#   ./deploy-apprunner.sh [VERSION]
# Or: ECR_REPOSITORY_URI=... AWS_REGION=... ./deploy-apprunner.sh v84

set -e
VERSION="${1:-v85}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [ -z "$ECR_REPOSITORY_URI" ]; then
  echo "Error: set ECR_REPOSITORY_URI (e.g. 123456789012.dkr.ecr.eu-west-1.amazonaws.com/business-canvas-mcp)"
  exit 1
fi

# Optional: parse region from ECR URI (e.g. dkr.ecr.eu-west-1.amazonaws.com -> eu-west-1)
if [ -z "$AWS_REGION" ]; then
  if [[ "$ECR_REPOSITORY_URI" =~ \.dkr\.ecr\.([a-z0-9-]+)\.amazonaws\.com ]]; then
    AWS_REGION="${BASH_REMATCH[1]}"
  else
    echo "Error: set AWS_REGION (e.g. eu-west-1)"
    exit 1
  fi
fi

IMAGE_TAG="${ECR_REPOSITORY_URI}:${VERSION}"

echo "Building Docker image with APP_VERSION=${VERSION}..."
docker build --build-arg APP_VERSION="$VERSION" -t "business-canvas-mcp:${VERSION}" .

echo "Tagging image for ECR: ${IMAGE_TAG}"
docker tag "business-canvas-mcp:${VERSION}" "$IMAGE_TAG"

echo "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "${ECR_REPOSITORY_URI%/*}"

echo "Pushing image..."
docker push "$IMAGE_TAG"

echo "Deploy done. Image pushed: ${IMAGE_TAG}"
echo "In AWS Console: App Runner -> your service -> Deploy (or create deployment with image ${IMAGE_TAG})"
echo "Or run: aws apprunner start-deployment --service-arn <YOUR_SERVICE_ARN>"
