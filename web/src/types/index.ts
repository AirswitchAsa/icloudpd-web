export interface Policy {
  name: string;
  username: string;
  directory: string;
  download_via_browser: boolean;
  status: "running" | "stopped" | "errored";
  progress: number;
  logs?: string;
  authenticated: boolean;
  albums?: string[];

  // Connection options
  domain: "com" | "cn";

  // Download options
  folder_structure: string;
  size: Array<"original" | "medium" | "thumb" | "adjusted" | "alternative">;
  live_photo_size: "original" | "medium" | "thumb";
  force_size: boolean;
  align_raw: "original" | "alternative" | "as-is";
  keep_unicode_in_filenames: boolean;
  set_exif_datetime: boolean;
  live_photo_mov_filename_policy: "original" | "suffix";
  file_match_policy: "name-size-dedup-with-suffix" | "name-id7";
  xmp_sidecar: boolean;
  use_os_locale: boolean;

  // Filter options
  album: string;
  library: "Personal Library" | "Shared Library";
  recent: number | null;
  until_found: number | null;
  skip_videos: boolean;
  skip_live_photos: boolean;
  file_suffixes: string[] | null;
  device_make: string[] | null;
  device_model: string[] | null;
  match_pattern: string | null;
  created_after: string | null;
  created_before: string | null;
  added_after: string | null;
  added_before: string | null;

  // Delete options
  auto_delete: boolean;
  keep_icloud_recent_days: number | null;

  // icloudpd-ui options
  dry_run: boolean;
  interval: string | null;
  scheduled: boolean;
  waiting_mfa: boolean;
  log_level: "debug" | "info" | "error";

  // integration options
  upload_to_aws_s3: boolean;
}
