# Dependency Management

## Version Policy

- Always use the newest stable (non-prerelease) version of all libraries
- Use exact versions in package.json (no `^` or `~` prefixes) to ensure reproducible builds
- Before adding a dependency, verify it is actively maintained (updated within the last 6 months)
- Prefer well-known, widely-adopted packages over niche alternatives

## Audit Policy

- All `npm audit` errors (high/critical severity) MUST be resolved before considering work complete
- Moderate severity issues SHOULD be resolved where possible without breaking changes
- If an audit issue cannot be resolved (e.g., no patched version exists), document it with a comment in package.json explaining why
- Use `npm audit fix` as a first pass, then manually resolve remaining issues
- Never use `--force` on audit fix without understanding the breaking changes

## Adding Dependencies

- Run `npm audit` after adding any new dependency
- If a dependency introduces audit vulnerabilities, evaluate alternatives before keeping it
- Dev dependencies (`devDependencies`) follow the same version and audit policies
- Do not add dependencies that duplicate functionality already available in the project
