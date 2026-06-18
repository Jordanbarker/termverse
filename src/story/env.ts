import { ComputerId } from "../state/types";
import { COMPUTERS, getComputerUsername } from "./player";
import { parseEnvAssignments, parseAliases } from "../engine/terminal/envParse";

// The shell-config parsers moved to core; re-export so existing importers
// (source builtin, tests) can keep importing them from story/env.
export { parseEnvAssignments, parseAliases };

/**
 * Returns default environment variables for a given computer.
 * These represent what a login shell would have before sourcing user configs.
 */
export function getDefaultEnv(computerId: ComputerId, playerUsername: string): Record<string, string> {
  const username = getComputerUsername(computerId, playerUsername);
  const home = `/home/${username}`;
  const hostname = COMPUTERS[computerId].hostname;

  const base: Record<string, string> = {
    SHELL: "/bin/zsh",
    TERM: "xterm-256color",
    USER: username,
    HOME: home,
    LOGNAME: username,
    HOSTNAME: hostname,
    LANG: "en_US.UTF-8",
    SHLVL: "1",
    OLDPWD: home,
    EDITOR: "nano",
    PAGER: "less",
    MAIL: `/var/mail/${username}`,
    HISTFILE: `${home}/.zsh_history`,
    _: "/usr/bin/printenv",
  };

  if (computerId === "home") {
    return {
      ...base,
      PATH: "/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin",
      XDG_SESSION_TYPE: "tty",
      XDG_RUNTIME_DIR: "/run/user/1000",
      XDG_DATA_HOME: `${home}/.local/share`,
      XDG_CONFIG_HOME: `${home}/.config`,
      DISPLAY: ":0",
    };
  }

  if (computerId === "nexacorp") {
    return {
      ...base,
      PATH: `${home}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      SNOWFLAKE_ACCOUNT: "nexacorp.us-east-1",
      SNOWFLAKE_USER: username,
      SNOWFLAKE_ROLE: "ANALYST",
      SNOWFLAKE_WAREHOUSE: "ANALYTICS_WH",
      SNOWFLAKE_DATABASE: "NEXACORP_PROD",
      SNOWFLAKE_SCHEMA: "RAW_NEXACORP",
      DBT_PROFILES_DIR: `${home}/.dbt`,
      DBT_PROJECT_DIR: `${home}/nexacorp-analytics`,
      NEXACORP_ENV: "production",
      NEXACORP_TEAM: "data-engineering",
    };
  }

  if (computerId === "chipinfra") {
    return {
      ...base,
      HOSTNAME: "f7e6d5c4b3a2",
      LANG: "C.UTF-8",
      PATH: `/opt/coder/bin:${home}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
      container: "docker",
      DEBIAN_FRONTEND: "noninteractive",
      CODER_WORKSPACE: "chip",
      CODER_AGENT: "main",
      CODER_URL: "https://coder.nexacorp.internal",
      CHIP_ENDPOINT: "https://chip.platform.internal",
      CHIP_PLATFORM_HOME: "/srv/chip",
      CHIP_PLUGINS_DIR: "/opt/chip/plugins",
    };
  }

  if (computerId === "erik-pc") {
    return {
      ...base,
      SHELL: "/bin/zsh",
      PATH: `/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${home}/.local/bin`,
      LANG: "en_US.UTF-8",
      LC_ALL: "en_US.UTF-8",
      SSH_TTY: "/dev/pts/0",
    };
  }

  // devcontainer
  return {
    ...base,
    HOSTNAME: "a1b2c3d4e5f6",
    LANG: "C.UTF-8",
    PATH: `/opt/coder/bin:${home}/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin`,
    container: "docker",
    DEBIAN_FRONTEND: "noninteractive",
    CODER_WORKSPACE: "ai",
    CODER_AGENT: "main",
    CODER_URL: "https://coder.nexacorp.internal",
    SNOWFLAKE_ACCOUNT: "nexacorp.us-east-1",
    SNOWFLAKE_USER: username,
    SNOWFLAKE_ROLE: "ANALYST",
    SNOWFLAKE_WAREHOUSE: "ANALYTICS_WH",
    SNOWFLAKE_DATABASE: "NEXACORP_PROD",
    SNOWFLAKE_SCHEMA: "RAW_NEXACORP",
    DBT_PROFILES_DIR: `${home}/.dbt`,
    DBT_PROJECT_DIR: `${home}/nexacorp-analytics`,
  };
}

/**
 * Initializes env vars for a computer: defaults + .zshrc exports merged.
 */
export function initEnvForComputer(
  computerId: ComputerId,
  playerUsername: string,
  fs: { readFile: (path: string) => { content?: string; error?: string } }
): Record<string, string> {
  const env = getDefaultEnv(computerId, playerUsername);
  const username = getComputerUsername(computerId, playerUsername);
  const home = `/home/${username}`;
  const zshrcResult = fs.readFile(`${home}/.zshrc`);
  if (zshrcResult.content) {
    const parsed = parseEnvAssignments(zshrcResult.content);
    Object.assign(env, parsed);
  }
  return env;
}

/**
 * Initializes aliases for a computer from its .zshrc file.
 */
export function initAliasesForComputer(
  computerId: ComputerId,
  playerUsername: string,
  fs: { readFile: (path: string) => { content?: string; error?: string } }
): Record<string, string> {
  const username = getComputerUsername(computerId, playerUsername);
  const home = `/home/${username}`;
  const zshrcResult = fs.readFile(`${home}/.zshrc`);
  if (zshrcResult.content) {
    return parseAliases(zshrcResult.content);
  }
  return {};
}
