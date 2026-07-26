import { useRef, useState } from "react";
import { Paperclip, SendHorizonal, Square, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SKILLS, type SkillTemplate } from "@/lib/skills";

interface ChatComposerProps {
  input: string;
  setInput: (val: string) => void;
  streaming: boolean;
  onSend: () => void;
  onStop: () => void;
  onSelectSkill: (skill: SkillTemplate) => void;
  onAttachFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

export function ChatComposer({
  input,
  setInput,
  streaming,
  onSend,
  onStop,
  onSelectSkill,
  onAttachFile,
}: ChatComposerProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showSkillMenu, setShowSkillMenu] = useState(false);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="relative border-t border-neutral-800 bg-neutral-950/80 p-3">
      {/* Skill Template Picker Menu */}
      {showSkillMenu && (
        <div className="absolute bottom-full left-3 mb-2 w-72 rounded-2xl border border-neutral-800 bg-neutral-900 p-2 shadow-xl backdrop-blur-md">
          <div className="mb-1 px-2 text-[11px] font-semibold text-gold-400">⚡ Chọn Kỹ năng nhanh (Quick Skills):</div>
          <div className="max-h-48 overflow-y-auto space-y-1">
            {SKILLS.map((sk) => (
              <button
                key={sk.name}
                onClick={() => {
                  onSelectSkill(sk);
                  setShowSkillMenu(false);
                }}
                className="w-full text-left rounded-xl px-2.5 py-1.5 text-xs text-neutral-200 hover:bg-gold-500/10 hover:text-gold-300 transition-colors cursor-pointer"
              >
                <div className="font-medium">{sk.name}</div>
                <div className="text-[10px] text-neutral-400 truncate">{sk.description}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      <input
        type="file"
        ref={fileInputRef}
        onChange={onAttachFile}
        multiple
        className="hidden"
      />

      <div className="flex items-end gap-2 rounded-2xl border border-neutral-800 bg-neutral-900/90 p-2 focus-within:border-gold-500/50 transition-colors">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          title="Đính kèm tệp / hình ảnh"
          className="size-8 p-0 text-neutral-400 hover:text-gold-300 cursor-pointer"
        >
          <Paperclip className="size-4" />
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowSkillMenu((prev) => !prev)}
          title="Chọn Kỹ năng"
          className="size-8 p-0 text-neutral-400 hover:text-gold-300 cursor-pointer"
        >
          <Wand2 className="size-4" />
        </Button>

        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Nhập yêu cầu cho AI Agent... (Enter để gửi, Shift+Enter xuống dòng)"
          rows={1}
          className="flex-1 resize-none bg-transparent py-1.5 px-2 text-sm text-neutral-100 placeholder-neutral-500 outline-none max-h-32 font-sans"
        />

        {streaming ? (
          <Button
            variant="danger"
            size="sm"
            onClick={onStop}
            className="size-8 p-0 cursor-pointer"
            title="Dừng phản hồi"
          >
            <Square className="size-3.5 fill-current" />
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            onClick={onSend}
            disabled={!input.trim()}
            className="size-8 p-0 cursor-pointer"
            title="Gửi tin nhắn"
          >
            <SendHorizonal className="size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
