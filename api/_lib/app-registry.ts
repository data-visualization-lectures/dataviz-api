import type { ServiceScope } from "./types.js";

export type ProjectBackend = "projects" | "openrefine_projects" | "none";

export interface AppRegistryEntry {
  appName: string;
  scope: ServiceScope;
  toolUrl: string;
  marketingUrl: string;
  hubHost: string;
  supportsSavedProjects: boolean;
  projectBackend: ProjectBackend;
}

// Phase 1 registry skeleton. Expand coverage before scope-based enforcement begins.
export const APP_REGISTRY: readonly AppRegistryEntry[] = [
  {
    appName: "rawgraphs",
    scope: "viz",
    toolUrl: "https://rawgraphs.dataviz.jp",
    marketingUrl: "https://www.dataviz.jp/rawgraphs/",
    hubHost: "app.dataviz.jp",
    supportsSavedProjects: true,
    projectBackend: "projects",
  },
  {
    appName: "kepler-gl",
    scope: "viz",
    toolUrl: "https://kepler-gl.dataviz.jp",
    marketingUrl: "https://www.dataviz.jp/kepler-gl/",
    hubHost: "app.dataviz.jp",
    supportsSavedProjects: true,
    projectBackend: "projects",
  },
  {
    appName: "interactive-chart-builder",
    scope: "viz",
    toolUrl: "https://interactive-chart-builder.dataviz.jp",
    marketingUrl: "https://www.dataviz.jp/interactive-chart-builder/",
    hubHost: "app.dataviz.jp",
    supportsSavedProjects: true,
    projectBackend: "projects",
  },
  {
    appName: "openrefine",
    scope: "prep",
    toolUrl: "https://open-refine.dataviz.jp",
    marketingUrl: "https://www.dataviz.jp/openrefine/",
    hubHost: "app.dataviz.jp",
    supportsSavedProjects: true,
    projectBackend: "openrefine_projects",
  },
  {
    appName: "mapshaper",
    scope: "prep",
    toolUrl: "https://mapshaper.dataviz.jp",
    marketingUrl: "https://www.dataviz.jp/mapshaper/",
    hubHost: "app.dataviz.jp",
    supportsSavedProjects: false,
    projectBackend: "none",
  },
] as const;

export function getAppRegistryEntry(appName: string): AppRegistryEntry | null {
  return APP_REGISTRY.find((entry) => entry.appName === appName) ?? null;
}

export function resolveRequiredScopeFromApp(
  appName: string | null | undefined,
): ServiceScope | null {
  if (!appName) {
    return null;
  }
  return getAppRegistryEntry(appName)?.scope ?? null;
}
