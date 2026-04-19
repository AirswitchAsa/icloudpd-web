import type { Policy as BackendPolicy, PolicyView } from "@/types/api";
import type { Policy as OldPolicy } from "@/types";

// Old-UI fields that are NOT icloudpd CLI flags (UI-only, runtime, or will map to new-shape top-level).
// Everything NOT in this set (and not one of our new-backend additions) gets dumped into icloudpd.
const NON_ICLOUDPD_OLD_FIELDS = new Set([
  "name",
  "username",
  "directory",
  // UI / runtime only
  "status",
  "progress",
  "logs",
  "authenticated",
  "albums",
  "scheduled",
  "waiting_mfa",
  "upload_to_aws_s3",
]);

const NEW_BACKEND_EXTRAS = new Set([
  "cron",
  "enabled",
  "timezone",
  "on_start_notify",
  "on_success_notify",
  "on_failure_notify",
  "aws_bucket",
  "aws_prefix",
  "aws_region",
  "aws_access_key_id",
  "aws_secret_access_key",
  "has_password",
]);

export interface FormPolicy extends OldPolicy {
  // New-backend additions held on the form for editing:
  cron: string;
  enabled: boolean;
  timezone: string | null;
  on_start_notify: boolean;
  on_success_notify: boolean;
  on_failure_notify: boolean;
  aws_bucket: string;
  aws_prefix: string;
  aws_region: string;
  aws_access_key_id: string;
  aws_secret_access_key: string;
  // has_password is read from PolicyView when editing
  has_password?: boolean;
}

export function defaultFormPolicy(): FormPolicy {
  return {
    // old-UI fields with sensible defaults:
    name: "",
    username: "",
    directory: "",
    status: "stopped",
    progress: 0,
    authenticated: false,
    domain: "com",
    folder_structure: "{:%Y/%m/%d}",
    size: ["original"],
    live_photo_size: "original",
    force_size: false,
    align_raw: "original",
    keep_unicode_in_filenames: false,
    set_exif_datetime: false,
    live_photo_mov_filename_policy: "suffix",
    file_match_policy: "name-size-dedup-with-suffix",
    xmp_sidecar: false,
    use_os_locale: false,
    album: "",
    library: "Personal Library",
    recent: null,
    until_found: null,
    skip_videos: false,
    skip_photos: false,
    skip_live_photos: false,
    threads_num: null,
    skip_created_before: null,
    skip_created_after: null,
    auto_delete: false,
    keep_icloud_recent_days: null,
    dry_run: false,
    scheduled: false,
    waiting_mfa: false,
    log_level: "info",
    upload_to_aws_s3: false,
    // new-backend additions:
    cron: "0 * * * *",
    enabled: true,
    timezone: null,
    on_start_notify: false,
    on_success_notify: true,
    on_failure_notify: true,
    aws_bucket: "",
    aws_prefix: "",
    aws_region: "",
    aws_access_key_id: "",
    aws_secret_access_key: "",
  };
}

export function fromPolicyView(view: PolicyView): FormPolicy {
  const icloudpd = view.icloudpd ?? {};
  const base = defaultFormPolicy();
  // Pull icloudpd keys onto the form
  for (const [k, v] of Object.entries(icloudpd)) {
    (base as unknown as Record<string, unknown>)[k] = v;
  }
  return {
    ...base,
    name: view.name,
    username: view.username,
    directory: view.directory,
    cron: view.cron,
    enabled: view.enabled,
    timezone: view.timezone ?? null,
    on_start_notify: view.notifications.on_start,
    on_success_notify: view.notifications.on_success,
    on_failure_notify: view.notifications.on_failure,
    upload_to_aws_s3: view.aws !== null,
    aws_bucket: view.aws?.bucket ?? "",
    aws_prefix: view.aws?.prefix ?? "",
    aws_region: view.aws?.region ?? "",
    aws_access_key_id: view.aws?.access_key_id ?? "",
    aws_secret_access_key: view.aws?.secret_access_key ?? "",
    has_password: view.has_password,
  };
}

export function toBackendPolicy(form: FormPolicy): BackendPolicy {
  const icloudpd: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(form)) {
    if (NON_ICLOUDPD_OLD_FIELDS.has(k)) continue;
    if (NEW_BACKEND_EXTRAS.has(k)) continue;
    if (v === null || v === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    icloudpd[k] = v;
  }
  return {
    name: form.name,
    username: form.username,
    directory: form.directory,
    cron: form.cron,
    enabled: form.enabled,
    timezone: form.timezone,
    icloudpd,
    notifications: {
      on_start: form.on_start_notify,
      on_success: form.on_success_notify,
      on_failure: form.on_failure_notify,
    },
    aws: form.upload_to_aws_s3
      ? {
          bucket: form.aws_bucket,
          prefix: form.aws_prefix || undefined,
          region: form.aws_region || undefined,
          access_key_id: form.aws_access_key_id || undefined,
          secret_access_key: form.aws_secret_access_key || undefined,
        }
      : null,
  };
}
