import type React from "react";

export interface PluginDefinition {
  id: string;
  label: string;
  /**
   * Section component rendered below the plugin list when this plugin is active.
   * Receives the full flat form state as `values` and a generic `onChange`.
   */
  ConfigSection: React.ComponentType<PluginSectionProps>;
}

export interface PluginSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  values: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  onChange: (key: string, value: any) => void;
}
