# Biometric Privacy And Compliance Policy

## Purpose
This policy defines minimum controls for biometric data handled by the system (face images, face crops, embeddings, and related logs).

## Data Categories
- Biometric raw data: uploaded classroom images and enrollment photos
- Derived biometric data: face embeddings and training artifacts
- Metadata: attendance events, user identifiers, timestamps, audit records

## Legal And Consent Controls
- Explicit user notice before biometric collection
- Documented consent capture for enrollment workflows
- Consent withdrawal path and operational procedure

## Data Subject Rights
- Right to delete biometric profile
- Right to correct profile metadata
- Right to request processing details

Operational requirement:
- Delete requests must remove enrollment embeddings, related dataset files, and associated training artifacts where applicable.

## Retention And Enforcement
- Retention values must be configured and documented
- Cleanup execution must be auditable (dry-run + applied logs)
- Retention exceptions must be approved and time-bound

## Access Control
- Least privilege for admin operations affecting biometric data
- Role-based checks on enrollment/training/recognition endpoints
- Access attempts and sensitive operations must be audit logged

## Audit And Review
- Monthly review of privileged biometric operations
- Quarterly retention compliance review
- Incident process integration for suspected data misuse

## Security Controls
- Encrypt transport in production (HTTPS only)
- Protect secrets and tokens with environment-specific secure configuration
- Restrict production data access to authorized operators

## Required Documentation
- API contract references for biometric endpoints: docs/openapi.full.yaml
- Operational procedures: docs/SYSTEM_OPERATIONS_MANUAL.md
- Retention baseline: backend/DATA_LIFECYCLE.md
