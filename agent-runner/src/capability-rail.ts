import type { ToolDefinition, ToolResult } from './providers/types.js';

export type CapabilityKind = 'native' | 'builtin' | 'mcp';

export interface Capability {
  name: string;
  kind: CapabilityKind;
  summary: string;
  input_schema: Record<string, unknown>;
  side_effect: boolean;
  requires_approval: boolean;
}

export const CAPABILITY_TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'search_capabilities',
    description: 'Tìm capability đang có trong V Assistant runtime. Dùng trước khi chọn tool hoặc integration.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Việc cần làm, ví dụ "đọc file", "gửi Telegram", "tìm web".' },
        limit: { type: 'number', description: 'Số kết quả tối đa, mặc định 8.' },
      },
      required: ['query'],
    },
  },
  {
    name: 'execute_capability',
    description: 'Chạy một capability trả về từ search_capabilities. Với capability gửi dữ liệu ra ngoài hoặc dùng credential, chỉ truyền approved=true sau khi người dùng duyệt rõ ràng.',
    input_schema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Tên capability trả về từ search_capabilities.' },
        arguments: { type: 'object', description: 'Tham số cho capability đã chọn.' },
        approved: { type: 'boolean', description: 'Bắt buộc với capability gửi tin, gửi file, sửa message hoặc gọi connector có credential.' },
      },
      required: ['name'],
    },
  },
];

const SIDE_EFFECT_NAMES = new Set([
  'file_write',
  'file_edit',
  'connector_request',
  'schedule_task',
  'send_message',
  'send_file',
  'edit_message',
  'add_reaction',
]);

const APPROVAL_REQUIRED_NAMES = new Set([
  'connector_request',
  'send_message',
  'send_file',
  'edit_message',
  'add_reaction',
]);

export function capabilityFromTool(tool: ToolDefinition, kind: CapabilityKind): Capability {
  const sideEffect = SIDE_EFFECT_NAMES.has(tool.name) || /(^|__)send|write|edit|delete|create|update|post|publish|message/i.test(tool.name);
  return {
    name: tool.name,
    kind,
    summary: tool.description || tool.name,
    input_schema: tool.input_schema,
    side_effect: sideEffect,
    requires_approval: APPROVAL_REQUIRED_NAMES.has(tool.name) || /(^|__)send|delete|post|publish|message/i.test(tool.name),
  };
}

export function searchCapabilities(capabilities: Capability[], query: string, limit = 8): string {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const scored = capabilities
    .map((capability) => {
      const haystack = `${capability.name} ${capability.kind} ${capability.summary}`.toLowerCase();
      const score = terms.reduce((sum, term) => sum + (haystack.includes(term) ? 1 : 0), 0);
      return { capability, score };
    })
    .filter(({ score }) => score > 0 || terms.length === 0)
    .sort((a, b) => b.score - a.score || a.capability.name.localeCompare(b.capability.name))
    .slice(0, Math.max(1, Math.min(20, Math.trunc(limit) || 8)))
    .map(({ capability }) => ({
      name: capability.name,
      kind: capability.kind,
      summary: capability.summary,
      side_effect: capability.side_effect,
      requires_approval: capability.requires_approval,
      input_schema: capability.input_schema,
    }));

  return scored.length ? JSON.stringify({ capabilities: scored }, null, 2) : 'Không tìm thấy capability phù hợp.';
}

export function sideEffectDenied(capability: Capability, approved: unknown): ToolResult | null {
  if (!capability.requires_approval || approved === true) return null;
  return {
    tool_call_id: '',
    is_error: true,
    content: `APPROVAL_REQUIRED: ${capability.name} gửi dữ liệu ra ngoài hoặc dùng credential. Hãy xin người dùng duyệt đúng hành động này, rồi gọi lại execute_capability với approved=true.`,
  };
}
