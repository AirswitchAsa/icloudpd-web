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
  "library_kind",
  "aws_bucket",
  "aws_prefix",
  "aws_region",
  "aws_access_key_id",
  "aws_secret_access_key",
  "has_password",
  "filter_file_suffixes",
  "filter_match_patterns",
  "filter_device_makes",
  "filter_device_models",
]);

export interface FormPolicy extends OldPolicy {
  // New-backend additions held on the form for editing:
  cron: string;
  enabled: boolean;
  timezone: string | null;
  library_kind: "personal" | "shared";
  aws_bucket: string;
  aws_prefix: string;
  aws_region: string;
  aws_access_key_id: string;
  aws_secret_access_key: string;
  // has_password is read from PolicyView when editing
  has_password?: boolean;
  // Post-download filter fields
  filter_file_suffixes: string[];
  filter_match_patterns: string[];
  filter_device_makes: string[];
  filter_device_models: string[];
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
    library: "",
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
    library_kind: "personal",
    aws_bucket: "",
    aws_prefix: "",
    aws_region: "",
    aws_access_key_id: "",
    aws_secret_access_key: "",
    // post-download filter fields:
    filter_file_suffixes: [],
    filter_match_patterns: [],
    filter_device_makes: [],
    filter_device_models: [],
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
    library_kind: view.library_kind ?? "personal",
    upload_to_aws_s3: view.aws != null && view.aws.enabled !== false,
    aws_bucket: view.aws?.bucket ?? "",
    aws_prefix: view.aws?.prefix ?? "",
    aws_region: view.aws?.region ?? "",
    aws_access_key_id: view.aws?.access_key_id ?? "",
    aws_secret_access_key: view.aws?.secret_access_key ?? "",
    has_password: view.has_password,
    filter_file_suffixes: view.filters?.file_suffixes ?? [],
    filter_match_patterns: view.filters?.match_patterns ?? [],
    filter_device_makes: view.filters?.device_makes ?? [],
    filter_device_models: view.filters?.device_models ?? [],
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
  // library_kind on the form is the user-facing choice; the backend resolves
  // it to a real icloudpd identifier at run time. Never include `library` in
  // the icloudpd dict — the backend validator strips it anyway.
  delete icloudpd.library;
  return {
    name: form.name,
    username: form.username,
    directory: form.directory,
    cron: form.cron,
    enabled: form.enabled,
    timezone: form.timezone,
    icloudpd,
    library_kind: form.library_kind,
    aws: form.upload_to_aws_s3
      ? {
          enabled: true,
          bucket: form.aws_bucket,
          prefix: form.aws_prefix || undefined,
          region: form.aws_region || undefined,
          access_key_id: form.aws_access_key_id || undefined,
          secret_access_key: form.aws_secret_access_key || undefined,
        }
      : null,
    filters: {
      file_suffixes: form.filter_file_suffixes,
      match_patterns: form.filter_match_patterns,
      device_makes: form.filter_device_makes,
      device_models: form.filter_device_models,
    },
  };
}
