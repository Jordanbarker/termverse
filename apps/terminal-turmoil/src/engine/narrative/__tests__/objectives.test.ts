import { describe, it, expect } from "vitest";
import { resolveObjectives } from "../objectives";
import { ChapterDefinition, ObjectiveCompletionCheck } from "../chapters";
import { StoryFlagName } from "../storyFlags";

const testChapter: ChapterDefinition = {
  id: "test-chapter",
  title: "Test Chapter",
  objectives: [
    {
      id: "flag_obj",
      description: "Story flag objective",
      check: { source: "storyFlag", key: "some_flag" as StoryFlagName } as ObjectiveCompletionCheck,
    },
    {
      id: "completed_obj",
      description: "Completed objective",
      check: { source: "completedObjective", key: "some_objective" },
    },
    {
      id: "email_obj",
      description: "Email objective",
      check: { source: "deliveredEmail", key: "some_email" },
    },
    {
      id: "hidden_obj",
      description: "Hidden objective",
      check: { source: "storyFlag", key: "hidden_flag" as StoryFlagName } as ObjectiveCompletionCheck,
      hidden: true,
      prerequisite: "flag_obj",
    },
  ],
};

describe("resolveObjectives", () => {
  it("marks storyFlag objective as completed when flag is set", () => {
    const result = resolveObjectives(
      testChapter,
      { some_flag: true },
      [],
      []
    );
    expect(result.find((o) => o.id === "flag_obj")?.completed).toBe(true);
  });

  it("marks storyFlag objective as incomplete when flag is not set", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "flag_obj")?.completed).toBe(false);
  });

  it("marks completedObjective as completed when in list", () => {
    const result = resolveObjectives(
      testChapter,
      {},
      ["some_objective"],
      []
    );
    expect(result.find((o) => o.id === "completed_obj")?.completed).toBe(true);
  });

  it("marks completedObjective as incomplete when not in list", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "completed_obj")?.completed).toBe(false);
  });

  it("marks deliveredEmail as completed when in list", () => {
    const result = resolveObjectives(
      testChapter,
      {},
      [],
      ["some_email"]
    );
    expect(result.find((o) => o.id === "email_obj")?.completed).toBe(true);
  });

  it("marks deliveredEmail as incomplete when not in list", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "email_obj")?.completed).toBe(false);
  });

  it("hides hidden objectives when prerequisite is not completed", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "hidden_obj")?.visible).toBe(false);
  });

  it("reveals hidden objectives when prerequisite is completed", () => {
    const result = resolveObjectives(
      testChapter,
      { some_flag: true },
      [],
      []
    );
    expect(result.find((o) => o.id === "hidden_obj")?.visible).toBe(true);
  });

  it("non-hidden objectives are always visible", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "flag_obj")?.visible).toBe(true);
    expect(result.find((o) => o.id === "completed_obj")?.visible).toBe(true);
    expect(result.find((o) => o.id === "email_obj")?.visible).toBe(true);
  });

  it("hidden objective can be both visible and completed", () => {
    const result = resolveObjectives(
      testChapter,
      { some_flag: true, hidden_flag: true },
      [],
      []
    );
    const hidden = result.find((o) => o.id === "hidden_obj");
    expect(hidden?.visible).toBe(true);
    expect(hidden?.completed).toBe(true);
  });

  it("marks objective as failed when failCheck is satisfied", () => {
    const chapterWithFail: ChapterDefinition = {
      id: "fail-chapter",
      title: "Fail Chapter",
      objectives: [
        {
          id: "failable_obj",
          description: "Failable objective",
          check: { source: "completedObjective", key: "success" },
          failCheck: { source: "completedObjective", key: "failed" },
        },
      ],
    };
    const result = resolveObjectives(chapterWithFail, {}, ["failed"], []);
    const obj = result.find((o) => o.id === "failable_obj");
    expect(obj?.failed).toBe(true);
    expect(obj?.completed).toBe(false);
  });

  it("does not mark objective as failed when failCheck is not satisfied", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.find((o) => o.id === "flag_obj")?.failed).toBe(false);
  });

  it("returns all objectives in order", () => {
    const result = resolveObjectives(testChapter, {}, [], []);
    expect(result.map((o) => o.id)).toEqual([
      "flag_obj",
      "completed_obj",
      "email_obj",
      "hidden_obj",
    ]);
  });

  describe("allVisibleChildren", () => {
    const groupChapter: ChapterDefinition = {
      id: "group-chapter",
      title: "Group Chapter",
      objectives: [
        {
          id: "parent",
          description: "Parent quest",
          check: { source: "allVisibleChildren" },
          hidden: true,
          optional: true,
          visibleWhen: { source: "storyFlag", key: "parent_visible" as StoryFlagName } as ObjectiveCompletionCheck,
        },
        {
          id: "child_a",
          description: "Child A",
          check: { source: "storyFlag", key: "child_a_done" as StoryFlagName } as ObjectiveCompletionCheck,
          hidden: true,
          optional: true,
          visibleWhen: { source: "storyFlag", key: "parent_visible" as StoryFlagName } as ObjectiveCompletionCheck,
          group: "parent",
        },
        {
          id: "child_b",
          description: "Child B",
          check: { source: "storyFlag", key: "child_b_done" as StoryFlagName } as ObjectiveCompletionCheck,
          hidden: true,
          optional: true,
          visibleWhen: { source: "storyFlag", key: "child_a_done" as StoryFlagName } as ObjectiveCompletionCheck,
          group: "parent",
        },
        {
          id: "ungrouped",
          description: "Ungrouped objective",
          check: { source: "storyFlag", key: "ungrouped_done" as StoryFlagName } as ObjectiveCompletionCheck,
        },
      ],
    };

    it("completes parent when all visible children are complete", () => {
      const result = resolveObjectives(
        groupChapter,
        { parent_visible: true, child_a_done: true, child_b_done: true },
        [],
        []
      );
      expect(result.find((o) => o.id === "parent")?.completed).toBe(true);
    });

    it("does not complete parent when some visible children are incomplete", () => {
      const result = resolveObjectives(
        groupChapter,
        { parent_visible: true, child_a_done: true },
        [],
        []
      );
      expect(result.find((o) => o.id === "parent")?.completed).toBe(false);
    });

    it("does not complete parent when no children are visible", () => {
      // parent is visible but no children are (none have their visibleWhen met)
      const chapterWithHiddenChildren: ChapterDefinition = {
        id: "hidden-children",
        title: "Hidden Children",
        objectives: [
          {
            id: "parent",
            description: "Parent",
            check: { source: "allVisibleChildren" },
          },
          {
            id: "child",
            description: "Child",
            check: { source: "storyFlag", key: "child_done" as StoryFlagName } as ObjectiveCompletionCheck,
            hidden: true,
            visibleWhen: { source: "storyFlag", key: "never_set" as StoryFlagName } as ObjectiveCompletionCheck,
            group: "parent",
          },
        ],
      };
      const result = resolveObjectives(chapterWithHiddenChildren, {}, [], []);
      expect(result.find((o) => o.id === "parent")?.completed).toBe(false);
    });

    it("passes group field through to resolved objectives", () => {
      const result = resolveObjectives(groupChapter, {}, [], []);
      expect(result.find((o) => o.id === "child_a")?.group).toBe("parent");
      expect(result.find((o) => o.id === "child_b")?.group).toBe("parent");
      expect(result.find((o) => o.id === "ungrouped")?.group).toBeUndefined();
      expect(result.find((o) => o.id === "parent")?.group).toBeUndefined();
    });

    it("handles mixed grouped and ungrouped objectives", () => {
      const result = resolveObjectives(
        groupChapter,
        { parent_visible: true, child_a_done: true, child_b_done: true, ungrouped_done: true },
        [],
        []
      );
      expect(result.find((o) => o.id === "parent")?.completed).toBe(true);
      expect(result.find((o) => o.id === "ungrouped")?.completed).toBe(true);
    });

    it("only considers visible children for completion", () => {
      // child_a is visible and complete, child_b is not visible
      // child_b is not visible (visibleWhen: child_a_done → true, so actually it IS visible)
      // Let me construct a case where child_b truly isn't visible
      const chapterMixed: ChapterDefinition = {
        id: "mixed",
        title: "Mixed",
        objectives: [
          {
            id: "parent",
            description: "Parent",
            check: { source: "allVisibleChildren" },
          },
          {
            id: "child_visible",
            description: "Visible child",
            check: { source: "storyFlag", key: "cv_done" as StoryFlagName } as ObjectiveCompletionCheck,
            group: "parent",
          },
          {
            id: "child_hidden",
            description: "Hidden child",
            check: { source: "storyFlag", key: "ch_done" as StoryFlagName } as ObjectiveCompletionCheck,
            hidden: true,
            visibleWhen: { source: "storyFlag", key: "never_set" as StoryFlagName } as ObjectiveCompletionCheck,
            group: "parent",
          },
        ],
      };
      // Only child_visible is visible and it's complete
      const result2 = resolveObjectives(chapterMixed, { cv_done: true }, [], []);
      expect(result2.find((o) => o.id === "parent")?.completed).toBe(true);
    });
  });
});
