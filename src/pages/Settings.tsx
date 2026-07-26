import { GeneralSettings } from "@/components/settings/GeneralSettings";
import { ModelSettings } from "@/components/settings/ModelSettings";
import { VaultSettings } from "@/components/settings/VaultSettings";
import { WorkspaceSettingsSection } from "@/components/settings/WorkspaceSettingsSection";
import { AppUpdateSection } from "@/components/settings/AppUpdateSection";

export function Settings() {
  return (
    <div className="mx-auto max-w-4xl space-y-10 p-6">
      <div>
        <h1 className="text-xl font-bold text-neutral-100">Cài đặt Hệ thống (Settings)</h1>
        <p className="mt-1 text-xs text-neutral-400">
          Quản lý mô hình AI, két mật mã Vault, ranh giới thư mục làm việc và cập nhật phiên bản.
        </p>
      </div>

      {/* Model & AI Providers Section */}
      <ModelSettings />

      {/* Vault & Credentials Section */}
      <VaultSettings />

      {/* Workspace & Data Storage Location Section */}
      <WorkspaceSettingsSection />

      {/* General Settings (Theme, Language, Memory, Reset) */}
      <GeneralSettings />

      {/* Software Auto-Updater Section */}
      <AppUpdateSection />
    </div>
  );
}
