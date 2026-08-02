import { useState } from "react";
import { ClipboardCheck, ClipboardCopy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { buildDiagnosticsBundle } from "@/lib/diagnostics";
import { useApp } from "@/lib/store";

export function DiagnosticsSection() {
  const app = useApp();
  const [copied, setCopied] = useState(false);
  const bundle = buildDiagnosticsBundle(app);

  const copy = async () => {
    await navigator.clipboard.writeText(JSON.stringify(bundle, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <section>
      <h2 className="text-sm font-semibold text-neutral-300">Chẩn đoán</h2>
      <p className="mt-1 text-xs leading-relaxed text-neutral-500">
        Xuất gói hỗ trợ đã che secret để kiểm tra Runner, MCP, Knowledge, Schedule và Integrations mà không lộ API key/token.
      </p>
      <Card className="mt-3 space-y-3 p-5">
        <div className="grid grid-cols-2 gap-2 text-xs text-neutral-400 sm:grid-cols-4">
          <span>Kỹ năng: {bundle.counts.installedEngineSkills}</span>
          <span>MCP: {bundle.counts.mcpServers}</span>
          <span>Tri thức: {bundle.counts.knowledgeFiles}</span>
          <span>Lịch: {bundle.counts.scheduledTasks}</span>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-neutral-800 pt-3">
          <span className="text-xs text-neutral-500">Nguồn capability: {bundle.capabilitySources.join(", ")}</span>
          <Button size="sm" variant="secondary" onClick={() => void copy()}>
            {copied ? <ClipboardCheck className="size-3.5" /> : <ClipboardCopy className="size-3.5" />}
            {copied ? "Đã chép" : "Chép gói hỗ trợ"}
          </Button>
        </div>
      </Card>
    </section>
  );
}
