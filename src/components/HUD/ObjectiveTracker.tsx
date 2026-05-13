"use client";

import { useEffect, useState } from "react";
import { useGameStore } from "../../state/gameStore";
import { CHAPTERS } from "../../engine/narrative/chapters";
import {
  resolveObjectives,
  ResolvedObjective,
} from "../../engine/narrative/objectives";

function ObjectiveItem({ obj, className }: { obj: ResolvedObjective; className?: string }) {
  return (
    <li
      className={`${
        obj.completed
          ? "text-[#3fb950] line-through opacity-50"
          : obj.failed
            ? "text-red-500"
            : "text-[#c9d1d9]"
      }${className ? ` ${className}` : ""}`}
    >
      {obj.completed ? "[x]" : obj.failed ? "[!]" : "[ ]"} {obj.description}
    </li>
  );
}

export interface GroupNode {
  parent: ResolvedObjective;
  children: ResolvedObjective[];
}

export type RenderItem =
  | { type: "single"; obj: ResolvedObjective }
  | { type: "group"; group: GroupNode };

/**
 * When a parent is optional, all its children are inherently optional —
 * putting them all in `required` suppresses the nested "── Optional ──" divider.
 */
export function splitGroupChildren(
  children: ResolvedObjective[],
  parentIsOptional: boolean
): { required: ResolvedObjective[]; optional: ResolvedObjective[] } {
  if (parentIsOptional) {
    return { required: children, optional: [] };
  }
  return {
    required: children.filter((c) => !c.optional),
    optional: children.filter((c) => c.optional),
  };
}

export function buildObjectiveTree(visible: ResolvedObjective[]): {
  required: RenderItem[];
  optional: RenderItem[];
  childrenByParent: Map<string, ResolvedObjective[]>;
} {
  const parentIds = new Set(
    visible.filter((o) => o.group).map((o) => o.group!)
  );
  const childrenByParent = new Map<string, ResolvedObjective[]>();
  const groupedChildIds = new Set<string>();

  for (const obj of visible) {
    if (obj.group && parentIds.has(obj.group)) {
      const children = childrenByParent.get(obj.group) ?? [];
      children.push(obj);
      childrenByParent.set(obj.group, children);
      groupedChildIds.add(obj.id);
    }
  }

  const renderItems: RenderItem[] = [];
  for (const obj of visible) {
    if (groupedChildIds.has(obj.id)) continue;
    if (parentIds.has(obj.id) && childrenByParent.has(obj.id)) {
      renderItems.push({
        type: "group",
        group: { parent: obj, children: childrenByParent.get(obj.id)! },
      });
    } else {
      renderItems.push({ type: "single", obj });
    }
  }

  const required = renderItems.filter(
    (item) => !(item.type === "single" ? item.obj : item.group.parent).optional
  );
  const optional = renderItems.filter(
    (item) => (item.type === "single" ? item.obj : item.group.parent).optional
  );

  return { required, optional, childrenByParent };
}

const depthClass = ["", "pl-4", "pl-8"] as const;

function renderChild(
  child: ResolvedObjective,
  childrenByParent: Map<string, ResolvedObjective[]>,
  depth: number
) {
  const nested = childrenByParent.get(child.id);
  if (nested) {
    return (
      <ObjectiveGroup
        key={child.id}
        group={{ parent: child, children: nested }}
        childrenByParent={childrenByParent}
        depth={Math.min(depth + 1, 2) as 0 | 1 | 2}
      />
    );
  }
  return (
    <ObjectiveItem
      key={child.id}
      obj={child}
      className={depthClass[Math.min(depth + 1, 2)]}
    />
  );
}

function ObjectiveGroup({
  group,
  childrenByParent,
  depth = 0,
}: {
  group: GroupNode;
  childrenByParent: Map<string, ResolvedObjective[]>;
  depth?: number;
}) {
  const childDepth = Math.min(depth + 1, 2);
  const { required: requiredChildren, optional: optionalChildren } =
    splitGroupChildren(group.children, group.parent.optional);

  return (
    <>
      <ObjectiveItem obj={group.parent} className={depthClass[depth]} />
      {!group.parent.completed && (
        <>
          {requiredChildren.map((child) =>
            renderChild(child, childrenByParent, depth)
          )}
          {optionalChildren.length > 0 && (
            <>
              <li className={`text-[#8b949e] text-center ${depthClass[childDepth]}`}>
                ── Optional ──
              </li>
              {optionalChildren.map((child) =>
                renderChild(child, childrenByParent, depth)
              )}
            </>
          )}
        </>
      )}
    </>
  );
}

export default function ObjectiveTracker() {
  const [collapsed, setCollapsed] = useState(false);
  const currentChapter = useGameStore((s) => s.currentChapter);
  const storyFlags = useGameStore((s) => s.storyFlags);
  const completedObjectives = useGameStore((s) => s.completedObjectives);
  const deliveredEmailIds = useGameStore((s) => s.deliveredEmailIds);

  const chapter = CHAPTERS.find((c) => c.id === currentChapter);
  if (!chapter) return null;

  const objectives = resolveObjectives(
    chapter,
    storyFlags,
    completedObjectives,
    deliveredEmailIds
  );

  // Auto-sync objectives that resolved as completed (via story flags, etc.)
  // into the completedObjectives store so downstream visibleWhen: completedObjective works.
  useEffect(() => {
    const newlyCompleted = objectives.filter(
      (o) => o.completed && !completedObjectives.includes(o.id)
    );
    if (newlyCompleted.length > 0) {
      const store = useGameStore.getState();
      for (const obj of newlyCompleted) {
        store.completeObjective(obj.id);
      }
    }
  }, [objectives, completedObjectives]);

  if (storyFlags.terminated_for_misconduct) {
    return (
      <div
        className="absolute top-2 right-2 z-10 pointer-events-auto
          bg-[#1a1f29]/85 border border-red-700/60 rounded-md
          backdrop-blur-sm font-mono text-xs select-none
          max-w-[400px] px-3 py-2"
      >
        <div className="text-red-500 font-bold mb-1">TERMINATED</div>
        <div className="text-[#8b949e] mb-1">Your NexaCorp access has been revoked.</div>
        <div className="text-[#6c7380]">
          Run <span className="text-[#c9d1d9]">newgame</span> to start over.
        </div>
      </div>
    );
  }

  const visible = objectives.filter((o) => o.visible);
  const done = visible.filter((o) => o.completed).length;

  const { required, optional, childrenByParent } = buildObjectiveTree(visible);

  function renderItem(item: RenderItem) {
    if (item.type === "group") {
      return (
        <ObjectiveGroup
          key={item.group.parent.id}
          group={item.group}
          childrenByParent={childrenByParent}
        />
      );
    }
    return <ObjectiveItem key={item.obj.id} obj={item.obj} />;
  }

  return (
    <div
      className="absolute top-2 right-2 z-10 pointer-events-auto
        bg-[#1a1f29]/85 border border-[#2a2f3a] rounded-md
        backdrop-blur-sm font-mono text-xs select-none
        max-w-[400px]"
    >
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-2 py-1.5
          text-[#8b949e] hover:text-[#c9d1d9] transition-colors"
      >
        <span className="text-[#58a6ff] font-bold truncate">
          {chapter.title}
        </span>
        <span className="ml-2 shrink-0">
          {collapsed ? `[${done}/${visible.length}]` : "−"}
        </span>
      </button>

      {!collapsed && (
        <ul className="px-2 pb-1.5 space-y-0.5">
          {required.map(renderItem)}
          {optional.length > 0 && (
            <>
              <li className="text-[#8b949e] text-center">── Optional ──</li>
              {optional.map(renderItem)}
            </>
          )}
        </ul>
      )}
    </div>
  );
}
