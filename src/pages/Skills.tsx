import { Wand2 } from "lucide-react";
import { SKILLS } from "@/lib/catalog";
import { useApp } from "@/lib/store";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export function Skills() {
  const { useSkill } = useApp();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-8 sm:py-10">
      <h1 className="text-2xl font-bold">Skills</h1>
      <p className="mt-1 text-neutral-400">
        Everyday tasks, one click away. Pick a skill and just fill in the
        blanks — no prompt writing needed.
      </p>

      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {SKILLS.map((skill) => (
          <Card key={skill.id} className="flex flex-col">
            <div className="flex items-start justify-between">
              <span className="text-3xl">{skill.emoji}</span>
              <Badge>{skill.category}</Badge>
            </div>
            <h3 className="mt-3 font-semibold">{skill.name}</h3>
            <p className="mt-1 flex-1 text-sm text-neutral-400">
              {skill.description}
            </p>
            <div className="mt-4">
              <Button
                size="sm"
                variant="secondary"
                onClick={() => useSkill(skill.prompt)}
              >
                <Wand2 className="size-3.5" /> Use
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
