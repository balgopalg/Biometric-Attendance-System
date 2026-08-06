# Incident Response And Recovery Policy

## Purpose
This policy defines how the system handles production incidents and how recovery readiness is measured.

## Scope
- Backend API, database, queue worker, and face-recognition processing paths
- Admin, lecturer, and student critical flows
- Backup and restore operations

## Service Objectives
- RTO (Recovery Time Objective): 4 hours for full service restoration
- RPO (Recovery Point Objective): 24 hours maximum data loss window

## Incident Severity Levels
- Sev 1: Full outage, authentication unavailable, critical data corruption, or security incident
- Sev 2: Major feature unavailable with no immediate workaround
- Sev 3: Partial degradation with workaround available
- Sev 4: Minor issue with low user impact

## Response Targets
- Sev 1: acknowledge within 15 minutes, owner assigned immediately
- Sev 2: acknowledge within 30 minutes
- Sev 3: acknowledge within 4 business hours
- Sev 4: triage within 1 business day

## Roles
- Incident Commander: coordinates response and decisions
- Communications Owner: internal/external status updates
- Technical Owner: executes remediation and verification
- Scribe: timeline and post-incident documentation

## Escalation Path
1. On-call engineer
2. Tech lead
3. Project owner / program lead
4. Stakeholder communication channel

## Recovery Procedure
1. Detect and classify severity
2. Stabilize service (rollback, feature flag disable, or fail-safe mode)
3. Recover data path (database/queue/worker)
4. Validate critical workflows
5. Communicate status and closure

## Restore Drill Cadence
- Frequency: monthly dry-run restore and quarterly full restore drill
- Evidence to retain: timestamp, backup source, elapsed restore time, data verification report

## Post-Incident Review
- Required for Sev 1 and Sev 2 incidents within 5 business days
- Must include root cause, contributing factors, corrective actions, and owner with due date

## Operational Links
- Command runbook: /docs/operations/CLI_COMMAND_RUNBOOK.md
- System operations manual: /docs/operations/SYSTEM_OPERATIONS_MANUAL.md
- Data lifecycle and retention: /docs/backend/DATA_LIFECYCLE.md
