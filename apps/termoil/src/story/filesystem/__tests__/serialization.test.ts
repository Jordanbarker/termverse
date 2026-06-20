import { describe, it, expect } from "vitest";
import { serializeFS, deserializeFS, SerializedFS } from "@tt/core/filesystem/serialization";
import { VirtualFS } from "@tt/core/filesystem/VirtualFS";
import { createNexacorpFilesystem } from "../nexacorp";
import { DirectoryNode } from "@tt/core/filesystem/types";

function makeSimpleFS(): VirtualFS {
  const root: DirectoryNode = {
    type: "directory",
    name: "/",
    permissions: "rwxr-xr-x",
    hidden: false,
    children: {
      home: {
        type: "directory",
        name: "home",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {
          player: {
            type: "directory",
            name: "player",
            permissions: "rwxr-xr-x",
            hidden: false,
            children: {
              "test.txt": {
                type: "file",
                name: "test.txt",
                content: "hello",
                permissions: "rw-r--r--",
                hidden: false,
              },
            },
          },
        },
      },
    },
  };
  return new VirtualFS(root, "/home/player", "/home/player");
}

describe("serializeFS", () => {
  it("returns root, cwd, and homeDir", () => {
    const fs = makeSimpleFS();
    const data = serializeFS(fs);
    expect(data.root).toBeDefined();
    expect(data.cwd).toBe("/home/player");
    expect(data.homeDir).toBe("/home/player");
  });

  it("captures the full filesystem tree in root", () => {
    const fs = makeSimpleFS();
    const data = serializeFS(fs);
    expect(data.root.type).toBe("directory");
    expect(data.root.children.home).toBeDefined();
  });
});

describe("deserializeFS", () => {
  it("restores a VirtualFS instance from serialized data", () => {
    const data: SerializedFS = {
      root: {
        type: "directory",
        name: "/",
        permissions: "rwxr-xr-x",
        hidden: false,
        children: {},
      },
      cwd: "/",
      homeDir: "/home/test",
    };

    const fs = deserializeFS(data);
    expect(fs).toBeInstanceOf(VirtualFS);
    expect(fs.cwd).toBe("/");
    expect(fs.homeDir).toBe("/home/test");
  });
});

describe("round-trip serialization", () => {
  it("preserves cwd and homeDir through serialize/deserialize", () => {
    const original = makeSimpleFS();
    const data = serializeFS(original);
    const restored = deserializeFS(data);

    expect(restored.cwd).toBe(original.cwd);
    expect(restored.homeDir).toBe(original.homeDir);
  });

  it("preserves file content through round-trip", () => {
    const original = makeSimpleFS();
    const data = serializeFS(original);
    const restored = deserializeFS(data);

    const result = restored.readFile("/home/player/test.txt");
    expect(result.content).toBe("hello");
  });

  it("preserves directory structure through round-trip", () => {
    const original = makeSimpleFS();
    const data = serializeFS(original);
    const restored = deserializeFS(data);

    expect(restored.getNode("/home")).toBeDefined();
    expect(restored.getNode("/home/player")).toBeDefined();
    expect(restored.getNode("/home/player")?.type).toBe("directory");
  });

  it("works with the full game filesystem", () => {
    const root = createNexacorpFilesystem("testplayer");
    const original = new VirtualFS(root, "/home/testplayer", "/home/testplayer");

    const data = serializeFS(original);
    const restored = deserializeFS(data);

    expect(restored.cwd).toBe(original.cwd);
    expect(restored.homeDir).toBe(original.homeDir);
    expect(restored.readFile("/home/testplayer/.zshrc").content).toBe(
      original.readFile("/home/testplayer/.zshrc").content
    );
  });

  it("preserves non-home cwd", () => {
    const fs = makeSimpleFS();
    const moved = fs.changeCwd("/").fs!;
    const data = serializeFS(moved);
    const restored = deserializeFS(data);

    expect(restored.cwd).toBe("/");
    expect(restored.homeDir).toBe("/home/player");
  });
});
