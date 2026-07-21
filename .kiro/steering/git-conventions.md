# Git & Pull Request Conventions

## Pull Requests

- PR titles must be concise (under 70 characters)
- PR descriptions MUST use proper markdown formatting with actual newlines between sections
- When using `gh pr create` or `gh pr edit`, write the body to a temporary file and pass it via `--body-file` to preserve formatting:

  ```bash
  cat > /tmp/pr-body.md << 'EOF'
  ## Summary

  Description here...

  ### Section heading

  - Bullet points
  - More details
  EOF

  gh pr create --title "Title here" --body-file /tmp/pr-body.md
  ```

- NEVER pass multi-line PR body content as an inline `--body` string argument — newlines get stripped by shell interpolation
- Structure PR descriptions with:
  1. A summary of what changed
  2. Sections for each logical change (use ### headings)
  3. What was tested
  4. Any deployment notes or manual steps required

## Commits

- Use conventional commit prefixes: `feat:`, `fix:`, `chore:`, `refactor:`, `test:`, `docs:`
- Keep the first line under 72 characters
- Use the body for detailed explanation when needed

## Branches

- Feature branches: `feature/<short-description>`
- Bugfix branches: `fix/<short-description>`
- Never push directly to main/master
