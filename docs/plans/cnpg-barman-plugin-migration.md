# Migrate hillco2-pg off in-tree Barman Cloud to the CNPG-I plugin

**Status: done** — executed 2026-07-05, gitops commit `1746a9a`. Cutover restart
took ~50s; catalog continuity verified (firstRecoverabilityPoint unchanged at
2026-06-28), WAL archiving confirmed via plugin sidecar, on-demand plugin backup
`hillco2-pg-plugin-cutover` completed.

## Why

CloudNativePG deprecated in-tree Barman Cloud support (`.spec.backup.barmanObjectStore`)
in 1.26 and removes it in **1.31.0**. The cluster runs operator **1.29.1**, so nothing
is broken today — but the migration must land before the operator is upgraded to 1.31.

## Current state (verified 2026-07-05)

- `hillco2-pg` (namespace `hillco2`, single instance) uses in-tree
  `backup.barmanObjectStore` → `s3://hillco2-pg-backups/` on MinIO
  (`https://s3.ng20.org`), creds from the `cnpg-backup` sealed secret,
  gzip WAL + data compression, `retentionPolicy: 7d` at the Cluster level.
- `ScheduledBackup hillco2-pg-daily` takes the daily base backup (03:15 UTC),
  no `method` field (defaults to in-tree `barmanObjectStore`).
- Continuous archiving is healthy; first recoverability point 2026-06-28.
- The **plugin is already installed cluster-wide**: Argo app `barman-cloud-plugin`,
  deployment `barman-cloud` in `cnpg-system` running
  `ghcr.io/cloudnative-pg/plugin-barman-cloud:v0.13.0`, `ObjectStore` CRD present,
  cert-manager present. `healthcostclarity-db` already runs on it (working template:
  `ObjectStore healthcostclarity-pg-store` + plugin stanza + `method: plugin`
  ScheduledBackup), so plugin v0.13.0 ↔ operator 1.29.1 compatibility is proven
  in this cluster.

All changes below are in **hillco2-gitops** (`base/`).

## Step 1 — new manifest: `base/cnpg-objectstore.yaml`

Direct translation of the current `barmanObjectStore` block; retention moves here
from the Cluster (in the plugin architecture retention lives on the ObjectStore).
Same sealed-secret refs, same bucket, same endpoint — byte-for-byte where possible,
so the existing WAL archive and backup catalog continue in place.

```yaml
apiVersion: barmancloud.cnpg.io/v1
kind: ObjectStore
metadata:
  name: hillco2-pg-store
  namespace: hillco2
  annotations:
    # Must exist before the Cluster (wave -10) references it.
    argocd.argoproj.io/sync-wave: "-11"
spec:
  configuration:
    destinationPath: s3://hillco2-pg-backups/
    endpointURL: https://s3.ng20.org
    s3Credentials:
      accessKeyId:
        name: cnpg-backup
        key: ACCESS_KEY_ID
      secretAccessKey:
        name: cnpg-backup
        key: ACCESS_SECRET_KEY
    wal:
      compression: gzip
    data:
      compression: gzip
  retentionPolicy: "7d"
```

Add to `base/kustomization.yaml` resources.

## Step 2 — `base/cnpg-cluster.yaml`: swap in-tree for plugin (one atomic edit)

In a single commit/sync:

- **Remove** the whole `spec.backup` section (`barmanObjectStore` + `retentionPolicy`).
- **Add**:

```yaml
plugins:
  - name: barman-cloud.cloudnative-pg.io
    enabled: true
    isWALArchiver: true
    parameters:
      barmanObjectName: hillco2-pg-store
      serverName: hillco2-pg
```

`serverName: hillco2-pg` is explicit on purpose: it matches the in-tree default
(the cluster name), so the plugin appends to the **same** barman server path in the
bucket — WAL history and the existing 7-day PITR window stay continuous. Do not
change it.

## Step 3 — `base/cnpg-scheduled-backup.yaml`: switch method

Add to `spec`:

```yaml
method: plugin
pluginConfiguration:
  name: barman-cloud.cloudnative-pg.io
```

## Rollout expectations

- The Cluster edit adds the plugin sidecar to the instance pod → **rolling restart**.
  With `instances: 1` that is a short Postgres outage (roughly pod restart time,
  under a minute on this cluster). Do it in a quiet window; the app tier reconnects
  via the asyncpg pool on its own.
- Argo order: ObjectStore (wave -11) → Cluster (wave -10) → ScheduledBackup (wave -5),
  so a single gitops commit with all three files is safe.

## Verification (after sync)

1. `kubectl get cluster -n hillco2 hillco2-pg -o jsonpath='{.status.conditions[?(@.type=="ContinuousArchiving")].status}'` → `True`.
2. Force a WAL switch and confirm archiving through the plugin:
   `kubectl exec -n hillco2 hillco2-pg-1 -c postgres -- psql -c "SELECT pg_switch_wal()"`,
   then check the instance/plugin sidecar logs for a successful archive.
3. On-demand base backup through the plugin (don't wait for 03:15):

   ```yaml
   apiVersion: postgresql.cnpg.io/v1
   kind: Backup
   metadata:
     name: hillco2-pg-plugin-cutover
     namespace: hillco2
   spec:
     cluster:
       name: hillco2-pg
     method: plugin
     pluginConfiguration:
       name: barman-cloud.cloudnative-pg.io
   ```

   (apply manually, not via gitops) → status `completed`.
4. `kubectl get objectstore -n hillco2 hillco2-pg-store -o yaml` →
   `status.serverRecoveryWindow.hillco2-pg` shows a `firstRecoverabilityPoint` at or
   **before** the cutover (catalog continuity) and a fresh `lastSuccessfulBackupTime`.
5. Next morning: confirm the ScheduledBackup fired with `method: plugin`.

## Recovery-path note

Any future PITR/clone bootstrap must use the plugin form of `externalClusters`:

```yaml
externalClusters:
  - name: hillco2-pg
    plugin:
      name: barman-cloud.cloudnative-pg.io
      parameters:
        barmanObjectName: hillco2-pg-store
        serverName: hillco2-pg   # required for recovery
```

## Rollback

In-tree support still works until operator 1.31: revert the gitops commit
(restore `spec.backup`, drop `plugins` + `method: plugin`) and re-sync. Same
bucket/serverName means the catalog is usable from either side during the
deprecation window.

## Out of scope / follow-ups

- `workinonit-pg` is the only other in-tree-barman cluster; same recipe applies.
- healthcostclarity points at MinIO via the in-cluster service
  (`http://minio.minio.svc.cluster.local:9000`); hillco2 uses the external
  `https://s3.ng20.org`. Keeping hillco2's endpoint unchanged for the migration —
  switching to the internal endpoint is a separate, optional change (don't move
  two things at once).
- Prometheus metric names change under the plugin
  (`cnpg_collector_last_failed_backup_timestamp` →
  `barman_cloud_cloudnative_pg_io_last_failed_backup_timestamp`, etc.);
  `enablePodMonitor` is false for this cluster today, so nothing to update unless
  monitoring gets turned on.
