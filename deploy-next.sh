#!/usr/bin/env bash
set -e

REPO_PATH="/Users/MinddMacBen/business-canvas-chatkit"
DOCKERFILE="mcp-server/Dockerfile"
BUILD_CONTEXT="mcp-server"
AWS_REGION="us-east-1"
AWS_ACCOUNT_ID="559050238376"
ECR_REPO="business-canvas-mcp"
OVERRIDE_TAG="${1:-}"
OVERRIDE_PLATFORM="${2:-}"

ECR_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

cd "$REPO_PATH"

echo "Querying ECR for existing tags..."
EXISTING_TAGS=$(aws ecr describe-images --repository-name "$ECR_REPO" --region "$AWS_REGION" --query 'imageDetails[].imageTags[]' --output text 2>/dev/null || echo "")

if [ -z "$EXISTING_TAGS" ]; then
  NEXT_TAG="v1"
  echo "No existing tags found, starting with v1"
else
  if [ -n "$OVERRIDE_TAG" ]; then
    if [[ "$OVERRIDE_TAG" =~ ^[0-9]+$ ]]; then
      OVERRIDE_TAG="v${OVERRIDE_TAG}"
    fi
    if echo "$EXISTING_TAGS" | tr '\t' '\n' | grep -qx "$OVERRIDE_TAG"; then
      echo "Tag already exists in ECR: ${OVERRIDE_TAG}. Aborting."
      exit 1
    fi
    NEXT_TAG="$OVERRIDE_TAG"
    echo "Using override tag: ${NEXT_TAG}"
  else
    MAX_NUM=0
    for tag in $EXISTING_TAGS; do
      if [[ "$tag" =~ ^v([0-9]+)$ ]]; then
        NUM="${BASH_REMATCH[1]}"
        if [ "$NUM" -gt "$MAX_NUM" ]; then
          MAX_NUM=$NUM
        fi
      fi
    done
    NEXT_NUM=$((MAX_NUM + 1))
    NEXT_TAG="v${NEXT_NUM}"
    echo "Found max tag v${MAX_NUM}, using next tag: ${NEXT_TAG}"
  fi
fi

IMAGE_URI="${ECR_URI}:${NEXT_TAG}"

echo "Building Docker image with APP_VERSION=${NEXT_TAG}..."
cd "$BUILD_CONTEXT"
DOCKER_BUILD_ARGS=(--build-arg "APP_VERSION=$NEXT_TAG" -t "${ECR_REPO}:${NEXT_TAG}" .)
if [ -n "$OVERRIDE_PLATFORM" ]; then
  echo "Using build platform: ${OVERRIDE_PLATFORM}"
  DOCKER_BUILD_ARGS=(--platform "$OVERRIDE_PLATFORM" "${DOCKER_BUILD_ARGS[@]}")
fi
docker build "${DOCKER_BUILD_ARGS[@]}"

echo "Tagging image for ECR: ${IMAGE_URI}"
docker tag "${ECR_REPO}:${NEXT_TAG}" "$IMAGE_URI"

echo "Logging in to ECR..."
aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "${ECR_URI%/*}"

echo "Pushing image..."
docker push "$IMAGE_URI"

echo "DEPLOY_TAG=${NEXT_TAG}"
echo "APP_RUNNER_IMAGE=${IMAGE_URI}"
