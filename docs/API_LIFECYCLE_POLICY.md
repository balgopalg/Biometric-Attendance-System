# API Lifecycle Policy

## Purpose
This policy defines how API changes are versioned, communicated, and validated for compatibility.

## Source Of Truth
- Full contract: docs/openapi.full.yaml
- Workflow contract: docs/openapi.yaml

## Versioning Strategy
- Use path-based or header-based versioning when introducing breaking changes
- Non-breaking additions are allowed in current version
- Breaking changes require a new version and migration guidance

## Compatibility Guarantees
- Existing version behavior remains stable during support window
- Additive changes must not break existing clients
- Response field removals/renames are forbidden in active versions

## Deprecation Policy
- Mark deprecated endpoints/fields in OpenAPI and release notes
- Minimum deprecation window: 90 days before removal
- Provide replacement endpoint/field and migration example

## Change Classification
- Safe changes:
  - New optional response fields
  - New optional request fields
  - New endpoints
- Breaking changes:
  - Required field additions
  - Field type changes
  - Endpoint removals
  - Auth/permission contract changes

## Review Gates For API Changes
- OpenAPI specs updated in same change
- Backward-compatibility review completed
- Consumer impact documented
- Test coverage updated for changed behavior

## Communication
- Include API change log per release
- Highlight deprecations and removals with dates
