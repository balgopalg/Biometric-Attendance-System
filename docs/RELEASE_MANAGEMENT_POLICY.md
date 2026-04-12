# Release Management Policy

## Purpose
This policy standardizes how releases are planned, approved, deployed, and rolled back.

## Versioning
- Use semantic versioning for tagged releases: MAJOR.MINOR.PATCH
- Tag format: vX.Y.Z
- Every release must include notes with risks and rollback plan

## Release Channels
- Development: continuous integration validation
- Staging: pre-production validation with production-like configuration
- Production: approved release only after staging pass

## Required Gates
- Frontend lint/build pass
- Backend compile/tests pass
- API and E2E critical-path tests pass
- Security checks pass (dependency scan + secrets scan)
- SBOM generated and attached to release artifacts

## Approval Model
- Required approvals before production deploy:
  - Technical owner
  - QA/release approver
- Breaking changes require explicit reviewer acknowledgment

## Deployment Strategy
- Preferred: staged rollout (canary or phased)
- Required: health validation at each stage
- Required: rollback trigger thresholds defined pre-release

## Rollback Strategy
- Rollback conditions:
  - Elevated error rate
  - Auth/session failures
  - Data integrity concerns
- Rollback methods:
  - Revert application version
  - Disable risky feature flags
  - Restore data only when approved by incident owner

## Post-Deploy Verification
- Validate login and role dashboards
- Validate attendance session start/commit path
- Validate export endpoint behavior
- Validate queue metrics and dead-letter health

## Auditability
- Keep release records: version, approvers, deployment time, results, rollback actions
