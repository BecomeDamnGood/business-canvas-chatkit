# Agent Notes

## Deploy Next

When the user asks `deploy next`, treat that as a deployment request for the next available ECR tag.

Run:

```bash
./deploy-next.sh
```

Rules:

- First create a git commit for the current intended changes before deploying.
- If the worktree is already clean, skip the commit step and continue with deploy.
- Use a concise non-interactive commit message that matches the current task.
- Do not ask the user for a version number unless they explicitly request a specific tag.
- Use the script default platform so the build targets App Runner correctly.
- Report the commit hash before the deploy output.
- Report the resulting `DEPLOY_TAG` and `APP_RUNNER_IMAGE`.
- Do not trigger the App Runner rollout itself unless the user explicitly asks for it.
