/**
 * Auto Updater — checks GitHub Releases for new app versions.
 *
 * Repository: 360org/v-assistant
 * Reads GitHub's latest release API and compares tag_name against
 * __V_ASSISTANT_VERSION__. Provides download URLs for the release asset (.dmg).
 */

const REPO = "360org/v-assistant";
const API_URL = `https://api.github.com/repos/${REPO}/releases/latest`;

export interface AppUpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseTitle: string;
  releaseNotes: string;
  releaseUrl: string;
  downloadUrl: string | null;
  publishedAt: string;
}

/** Parse semver strings e.g. "1.0.44" or "v1.0.45" -> [1, 0, 45] */
function parseSemver(v: string): number[] {
  const clean = v.trim().replace(/^v/i, "");
  return clean.split(".").map((n) => parseInt(n, 10) || 0);
}

/** Compare v1 and v2. Returns >0 if v2 is newer than v1. */
export function isNewerVersion(v1: string, v2: string): boolean {
  const p1 = parseSemver(v1);
  const p2 = parseSemver(v2);
  const maxLen = Math.max(p1.length, p2.length);
  for (let i = 0; i < maxLen; i++) {
    const num1 = p1[i] ?? 0;
    const num2 = p2[i] ?? 0;
    if (num2 > num1) return true;
    if (num2 < num1) return false;
  }
  return false;
}

export async function checkAppUpdate(): Promise<AppUpdateInfo> {
  const currentVersion = typeof __V_ASSISTANT_VERSION__ !== "undefined" ? __V_ASSISTANT_VERSION__ : "1.0.44";
  
  try {
    const res = await fetch(API_URL, {
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });

    if (!res.ok) {
      throw new Error(`GitHub API returned status ${res.status}`);
    }

    const data = await res.json();
    const tag = (data.tag_name || "").trim();
    const latestVersion = tag.replace(/^v/i, "");
    const hasUpdate = isNewerVersion(currentVersion, latestVersion);

    // Look for a .dmg file in assets first
    let downloadUrl: string | null = null;
    if (Array.isArray(data.assets)) {
      const dmgAsset = data.assets.find((a: { name?: string; browser_download_url?: string }) => 
        a.name && a.name.endsWith(".dmg")
      );
      if (dmgAsset) {
        downloadUrl = dmgAsset.browser_download_url;
      }
    }

    // Fallback to release page HTML URL if no direct DMG link found
    if (!downloadUrl) {
      downloadUrl = data.html_url || `https://github.com/${REPO}/releases/latest`;
    }

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseTitle: data.name || tag || "Latest Release",
      releaseNotes: data.body || "",
      releaseUrl: data.html_url || `https://github.com/${REPO}/releases/latest`,
      downloadUrl,
      publishedAt: data.published_at || new Date().toISOString(),
    };
  } catch (err) {
    console.warn("Failed to check app updates:", err);
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseTitle: "",
      releaseNotes: "",
      releaseUrl: `https://github.com/${REPO}/releases`,
      downloadUrl: null,
      publishedAt: "",
    };
  }
}
