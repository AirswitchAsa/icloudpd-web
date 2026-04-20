import { describe, expect, it } from "vitest";
import {
  defaultFormPolicy,
  fromPolicyView,
  toBackendPolicy,
  type FormPolicy,
} from "./policyMapping";
import type { PolicyView } from "@/types/api";

const baseView: PolicyView = {
  name: "p",
  username: "u@example.com",
  directory: "/tmp/p",
  cron: "0 * * * *",
  enabled: true,
  timezone: null,
  icloudpd: {},
  aws: null,
  filters: {
    file_suffixes: [],
    match_patterns: [],
    device_makes: [],
    device_models: [],
  },
  has_password: false,
  is_running: false,
  last_run: null,
  next_run_at: null,
};

describe("defaultFormPolicy", () => {
  it("returns object with required meta fields populated", () => {
    const f = defaultFormPolicy();
    expect(f.name).toBe("");
    expect(f.cron).toBe("0 * * * *");
    expect(f.enabled).toBe(true);
  });
});

describe("fromPolicyView", () => {
  it("copies meta fields", () => {
    const f = fromPolicyView(baseView);
    expect(f.name).toBe("p");
    expect(f.username).toBe("u@example.com");
    expect(f.cron).toBe("0 * * * *");
  });

  it("routes icloudpd dict values onto the flat form shape", () => {
    const f = fromPolicyView({
      ...baseView,
      icloudpd: { album: "Favorites", skip_videos: true, size: ["medium"] },
    });
    expect(f.album).toBe("Favorites");
    expect(f.skip_videos).toBe(true);
    expect(f.size).toEqual(["medium"]);
  });

  it("populates AWS fields when aws present", () => {
    const f = fromPolicyView({
      ...baseView,
      aws: {
        bucket: "b",
        prefix: "x",
        region: "us-east-1",
        access_key_id: "AKIA",
        secret_access_key: "sek",
      },
    });
    expect(f.upload_to_aws_s3).toBe(true);
    expect(f.aws_bucket).toBe("b");
    expect(f.aws_prefix).toBe("x");
    expect(f.aws_access_key_id).toBe("AKIA");
  });

  it("handles missing icloudpd dict gracefully", () => {
    const f = fromPolicyView({
      ...baseView,
      icloudpd: undefined as unknown as Record<string, unknown>,
    });
    expect(f.name).toBe("p");
  });

});

describe("toBackendPolicy", () => {
  it("splits icloudpd fields from meta", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
      album: "Favorites",
      skip_videos: true,
    };
    const out = toBackendPolicy(form);
    expect(out.name).toBe("p");
    expect(out.icloudpd).toMatchObject({ album: "Favorites", skip_videos: true });
    expect("album" in out).toBe(false);
  });

  it("drops null, empty-string, and empty-array values from icloudpd", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
      recent: null,
      album: "",
      size: [],
    };
    const out = toBackendPolicy(form);
    expect("recent" in out.icloudpd).toBe(false);
    expect("album" in out.icloudpd).toBe(false);
    expect("size" in out.icloudpd).toBe(false);
  });

  it("emits aws=null when upload_to_aws_s3 is false", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
      upload_to_aws_s3: false,
      aws_bucket: "ignored",
    };
    expect(toBackendPolicy(form).aws).toBeNull();
  });

  it("emits aws block when upload_to_aws_s3 is true", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
      upload_to_aws_s3: true,
      aws_bucket: "b",
      aws_region: "us-east-1",
    };
    const out = toBackendPolicy(form);
    expect(out.aws).toMatchObject({ bucket: "b", region: "us-east-1" });
  });

  it("emits aws block with all optional fields when all aws fields are set", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
      upload_to_aws_s3: true,
      aws_bucket: "b",
      aws_prefix: "pfx",
      aws_region: "us-east-1",
      aws_access_key_id: "AKIA",
      aws_secret_access_key: "sek",
    };
    const out = toBackendPolicy(form);
    expect(out.aws).toMatchObject({
      bucket: "b",
      prefix: "pfx",
      region: "us-east-1",
      access_key_id: "AKIA",
      secret_access_key: "sek",
    });
  });

  it("roundtrip stability: toBackend(fromPolicyView(view)) preserves meta + icloudpd", () => {
    const view: PolicyView = {
      ...baseView,
      icloudpd: { album: "Favorites", skip_videos: true },
    };
    const out = toBackendPolicy(fromPolicyView(view));
    expect(out.name).toBe(view.name);
    expect(out.cron).toBe(view.cron);
    expect(out.icloudpd).toMatchObject(view.icloudpd);
  });

  it("roundtrip: filters block preserved through fromPolicyView → toBackendPolicy", () => {
    const view: PolicyView = {
      ...baseView,
      filters: {
        file_suffixes: [".heic", ".jpg"],
        match_patterns: ["^IMG_"],
        device_makes: ["Apple"],
        device_models: ["iPhone 15 Pro"],
      },
    };
    const out = toBackendPolicy(fromPolicyView(view));
    expect(out.filters).toMatchObject({
      file_suffixes: [".heic", ".jpg"],
      match_patterns: ["^IMG_"],
      device_makes: ["Apple"],
      device_models: ["iPhone 15 Pro"],
    });
    // Filters must NOT appear in icloudpd block.
    expect("filter_file_suffixes" in out.icloudpd).toBe(false);
    expect("filter_match_patterns" in out.icloudpd).toBe(false);
    expect("filter_device_makes" in out.icloudpd).toBe(false);
    expect("filter_device_models" in out.icloudpd).toBe(false);
    expect("filters" in out.icloudpd).toBe(false);
  });

  it("empty filters round-trip stays empty", () => {
    const form: FormPolicy = {
      ...defaultFormPolicy(),
      name: "p",
      username: "u@example.com",
      directory: "/tmp/p",
    };
    const out = toBackendPolicy(form);
    expect(out.filters).toMatchObject({
      file_suffixes: [],
      match_patterns: [],
      device_makes: [],
      device_models: [],
    });
  });
});
