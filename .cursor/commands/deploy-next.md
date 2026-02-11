Output ONLY a bash script (no explanation). The script must:
1) Determine the next ECR image tag in the format v<NUMBER> by querying ECR for existing tags, finding the highest vN, and incrementing it by 1 (default to v1 if none exist).
2) Build and push the Docker image to ECR with that new tag.
3) Print the chosen tag and full IMAGE_URI at the end, so I can manually select it in App Runner.

Use:
- Repo path: /Users/MinddMacBen/business-canvas-chatkit
- Dockerfile: mcp-server/Dockerfile
- Build context: mcp-server
- AWS_REGION=us-east-1
- AWS_ACCOUNT_ID=559050238376
- ECR_REPO=business-canvas-mcp

The script must be copy-paste runnable in macOS Terminal and must echo:
DEPLOY_TAG=vXX
APP_RUNNER_IMAGE=full_ecr_uri:vXX
