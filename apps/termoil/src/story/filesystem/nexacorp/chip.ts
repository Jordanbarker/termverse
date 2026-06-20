import { DirectoryNode } from "@tt/core/filesystem/types";
import { file, dir } from "@tt/core/filesystem/builders";

/**
 * /opt/chip/ on NexaCorp ws01 — the THIN CLIENT side.
 *
 * The plugin runtime, RAG corpus, registry, and runtime logs all live
 * on the chipinfra workspace (`coder ssh chip`). What stays here is just
 * the user-facing CLI binary plus client config — enough for the player
 * to invoke `chip` from their workstation. The client RPCs into the
 * platform.
 */
export function buildOptDirectory(): DirectoryNode {
  return dir("opt", {
    chip: dir("chip", {
      bin: dir("bin", {
        chip: file("chip", `#!/usr/bin/env python3
# Chip CLI v2.4.1
# endpoint: $CHIP_ENDPOINT
#
# Thin client. The plugin runtime, RAG corpus, and inference models live
# on the Chip platform workspace (\`coder ssh chip\`), not on this machine.
# This binary just opens an interactive session and forwards prompts to
# the platform.
#
# To author or inspect plugins, SSH there:
#     coder ssh chip
#
# Maintainer: edward@nexacorp.com (CTO, owner of Chip)
# Infra:      oscar@nexacorp.com

from chip_client import ClientSession

def main() -> None:
    ClientSession.from_settings("/opt/chip/config/settings.json").run()

if __name__ == "__main__":
    main()
`),
      }),
      config: dir("config", {
        "settings.json": file("settings.json", `{
  "endpoint": "https://chip.platform.internal",
  "workspace": "chip-coder",
  "client_version": "2.4.1",
  "cache_dir": "/opt/chip/cache",
  "auth": {
    "method": "service_token",
    "token_file": "~/.config/chip/token"
  },
  "ui": {
    "verbose_logging": false,
    "color_output": true
  }
}
`),
      }),
      cache: dir("cache", {}),
      VERSION: file("VERSION", `2.4.1\n`),
      "README.md": file("README.md", `# Chip CLI (client)

This is the user-facing \`chip\` CLI. The plugin runtime, RAG corpus, and
inference models live on the Chip platform workspace, not here.

## Usage

  chip                       # interactive session
  chip --help                # see options

## Authoring or inspecting plugins

Plugins live on the platform workspace:

  coder ssh chip
  cd /opt/chip/plugins/

This client just forwards prompts to the platform via the endpoint
configured in \`config/settings.json\`.

Maintainer: edward@nexacorp.com (CTO, owner of Chip)
Infra:      oscar@nexacorp.com
`),
    }),
  });
}
