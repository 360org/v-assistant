/**
 * Dịch lỗi thô của nhà cung cấp AI thành câu người dùng hiểu được.
 *
 * Nhà cung cấp trả về JSON lồng nhau, ví dụ Deepseek khi hết số dư:
 *   {"error":{"message":"[402]: {\"error\":{\"message\":\"Insufficient Balance\",…
 * Trước đây nguyên khối JSON đó bị đổ thẳng lên màn hình, nên người dùng tưởng
 * ứng dụng hỏng trong khi thật ra chỉ là tài khoản hết tiền (issue #13).
 *
 * Ở đây ta rút mã lỗi + thông điệp gốc, rồi map sang câu tiếng Việt kèm cách xử
 * lý. Không nhận ra thì trả lại thông điệp gốc đã làm sạch — vẫn hơn JSON thô.
 */

/** Rút thông điệp trong cùng của các lớp JSON lồng nhau. */
function innermostMessage(raw: string): string {
  let message = raw.trim();
  // Bóc dần các lớp {"error":{"message":"…"}} lồng nhau.
  for (let depth = 0; depth < 5; depth++) {
    const start = message.indexOf("{");
    if (start === -1) break;
    const candidate = message.slice(start);
    let parsed: unknown;
    try {
      parsed = JSON.parse(candidate);
    } catch {
      break;
    }
    const next =
      typeof parsed === "object" && parsed !== null
        ? ((parsed as { error?: { message?: string }; message?: string }).error?.message ??
           (parsed as { message?: string }).message)
        : undefined;
    if (typeof next !== "string" || next === message) break;
    message = next.trim();
  }
  return message;
}

/** Mã HTTP đầu tiên xuất hiện trong thông điệp, nếu có. */
function statusFrom(raw: string): number | undefined {
  const bracket = raw.match(/\[(\d{3})\]/);
  if (bracket) return Number(bracket[1]);
  const httpWord = raw.match(/\bHTTP\s*(\d{3})\b/i);
  if (httpWord) return Number(httpWord[1]);
  return undefined;
}

/**
 * Câu giải thích cho người dùng cuối. `providerName` chỉ để xưng tên dịch vụ
 * trong câu; thiếu thì dùng "nhà cung cấp".
 */
export function friendlyProviderError(raw: string, providerName?: string): string {
  const vendor = providerName?.trim() || "nhà cung cấp";
  const detail = innermostMessage(raw);
  const status = statusFrom(raw);
  const lower = detail.toLowerCase();

  if (status === 402 || lower.includes("insufficient balance") || lower.includes("insufficient_quota")) {
    return `Tài khoản ${vendor} đã hết số dư. Hãy nạp thêm hoặc dùng nhà cung cấp khác.`;
  }
  if (status === 401 || lower.includes("invalid api key") || lower.includes("unauthorized") || lower.includes("invalid_api_key")) {
    return `API key của ${vendor} không hợp lệ hoặc đã bị thu hồi. Hãy tạo key mới rồi dán lại.`;
  }
  if (status === 403 || lower.includes("permission") || lower.includes("forbidden")) {
    return `Tài khoản ${vendor} không có quyền dùng model này. Kiểm tra lại gói dịch vụ hoặc quyền truy cập.`;
  }
  if (status === 404 || lower.includes("model not found") || lower.includes("does not exist")) {
    return `${vendor} không còn cung cấp model này. Hãy chọn model khác trong danh sách.`;
  }
  if (status === 429 || lower.includes("rate limit") || lower.includes("too many requests")) {
    return `${vendor} đang giới hạn tốc độ. Chờ một lát rồi thử lại, hoặc dùng nhà cung cấp khác.`;
  }
  if (status !== undefined && status >= 500) {
    return `Máy chủ ${vendor} đang gặp sự cố. Thử lại sau ít phút.`;
  }
  if (lower.includes("fetch failed") || lower.includes("econnrefused") || lower.includes("network") || lower.includes("enotfound")) {
    return `Không kết nối được tới ${vendor}. Kiểm tra mạng rồi thử lại.`;
  }

  // Không nhận ra: trả thông điệp đã bóc sạch, cắt cho vừa một dòng.
  const cleaned = detail.replace(/\s+/g, " ").trim();
  if (!cleaned) return `Không kiểm tra được kết nối tới ${vendor}.`;
  return cleaned.length > 200 ? `${cleaned.slice(0, 200)}…` : cleaned;
}
