// ---------------------------------------------------------------------------
// Deterministic syslog generators for NexaCorp workstation
// ---------------------------------------------------------------------------
// Both logs share a common baseline of normal system activity spanning
// Feb 17–23 2026 (Day 1), optionally extended to Feb 24 (Day 2).
// The active log (system.log) has chip_service_account entries
// stripped by the cleanup script; the backup (system.log.bak) preserves them.
// ---------------------------------------------------------------------------

import type { Row } from "../../engine/snowflake/types";

/** Format a Date as `YYYY-MM-DD HH:MM:SS` */
function ts(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export interface LogOptions {
  includeDay2?: boolean;
}

interface LogEntry {
  date: Date;
  msg: string;
  /** If true this entry only appears in the .bak (pre-cleanup) log */
  chipOnly?: boolean;
}

// ---------------------------------------------------------------------------
// 1. Employee schedule
// ---------------------------------------------------------------------------

interface EmployeeSchedule {
  username: string;
  terminal: string;
  daysPresent: number[];
  loginHour: number;
  loginMinute: number;
  logoutHour: number;
  logoutMinute: number;
  minuteJitter: number;
  ip: number; // last octet of 10.0.1.x
}

const EMPLOYEES: EmployeeSchedule[] = [
  // edward is handled by boot sequence (auto-login), not SSH
  // Day 21 = Sat, Day 22 = Sun — weekend guard skips login/logout for those days
  // Oscar and Auri have weekend days for narrative reasons (investigation, workaholic)
  { username: "oscar",   terminal: "pts/0",  daysPresent: [17,18,19,20,21,23,24], loginHour: 7,  loginMinute: 30, logoutHour: 18, logoutMinute: 0,  minuteJitter: 7,  ip: 20 },
  { username: "sarah",   terminal: "pts/1",  daysPresent: [17,18,19,20,23,24],    loginHour: 7,  loginMinute: 45, logoutHour: 17, logoutMinute: 30, minuteJitter: 9,  ip: 21 },
  { username: "dana",    terminal: "pts/2",  daysPresent: [17,19,20,23,24],       loginHour: 8,  loginMinute: 0,  logoutHour: 17, logoutMinute: 15, minuteJitter: 6,  ip: 22 },
  { username: "auri",    terminal: "pts/3",  daysPresent: [17,18,19,20,21,23,24], loginHour: 8,  loginMinute: 10, logoutHour: 0,  logoutMinute: 0,  minuteJitter: 8,  ip: 23 },
  { username: "erik",    terminal: "pts/4",  daysPresent: [17,18,20,23,24],       loginHour: 7,  loginMinute: 50, logoutHour: 18, logoutMinute: 15, minuteJitter: 5,  ip: 24 },
  { username: "cassie",  terminal: "pts/5",  daysPresent: [17,18,19,20,23,24],    loginHour: 8,  loginMinute: 25, logoutHour: 17, logoutMinute: 10, minuteJitter: 11, ip: 25 },
  { username: "soham",   terminal: "pts/6",  daysPresent: [17,18,20,23,24],       loginHour: 9,  loginMinute: 12, logoutHour: 15, logoutMinute: 45, minuteJitter: 4,  ip: 26 },
  { username: "jordan",  terminal: "pts/7",  daysPresent: [18,20,23],             loginHour: 8,  loginMinute: 55, logoutHour: 16, logoutMinute: 30, minuteJitter: 6,  ip: 27 },
  { username: "maya",    terminal: "pts/8",  daysPresent: [19,23],                loginHour: 8,  loginMinute: 50, logoutHour: 16, logoutMinute: 0,  minuteJitter: 7,  ip: 28 },
  { username: "marcus",  terminal: "pts/9",  daysPresent: [18],                   loginHour: 9,  loginMinute: 45, logoutHour: 10, logoutMinute: 30, minuteJitter: 3,  ip: 30 },
  { username: "jessica", terminal: "pts/10", daysPresent: [20],                   loginHour: 10, loginMinute: 15, logoutHour: 11, logoutMinute: 0,  minuteJitter: 4,  ip: 31 },
];

/** Deterministic jitter: varies login/logout times slightly per day */
function jitter(day: number, username: string, maxMinutes: number): number {
  const charCode = username.charCodeAt(0) + username.charCodeAt(username.length - 1);
  return (day * 7 + charCode) % (maxMinutes + 1);
}

// ---------------------------------------------------------------------------
// Oscar's late-night check-in sessions
// ---------------------------------------------------------------------------

const OSCAR_LATE_NIGHTS: { day: number; hour: number; minute: number; durationMinutes: number }[] = [
  { day: 17, hour: 23, minute: 45, durationMinutes: 20 },
  { day: 19, hour: 22, minute: 10, durationMinutes: 25 },
  { day: 21, hour: 21, minute: 30, durationMinutes: 15 },
];

// ---------------------------------------------------------------------------
// 2. Boot sequence
// ---------------------------------------------------------------------------

// Real 2026 calendar: Feb 17 = Tuesday, Feb 23 = Monday
const FICTIONAL_MONDAY = 1;
const FICTIONAL_SUNDAY = 0;
const FICTIONAL_THURSDAY = 4;

/** Map day-of-month to day-of-week (17=Tue=2, 18=Wed=3, ..., 22=Sun=0, 23=Mon=1) */
function fictionalDow(day: number): number {
  return ((day - 17) % 7 + 2) % 7; // 17→2(Tue), 18→3(Wed), ..., 22→0(Sun), 23→1(Mon)
}

/** Deterministic boot-second offset per day — varies boot time by +/- 30s around 07:00:00 */
function bootOffset(day: number): number {
  return ((day * 17 + 3) % 61) - 30;
}

function generateBootSequence(day: number, d: DateFn, pid: PidCounter): LogEntry[] {
  const entries: LogEntry[] = [];
  const dow = fictionalDow(day);
  const hasKernel = dow === FICTIONAL_MONDAY || dow === FICTIONAL_SUNDAY;
  const hasLogrotate = dow === FICTIONAL_MONDAY || dow === FICTIONAL_SUNDAY;

  // Boot time with deterministic jitter: base is 06:59:60 + offset (Date auto-normalizes)
  const off = bootOffset(day);
  const b = (s: number) => d(day, 6, 59, 60 + off + s);

  entries.push({ date: b(1), msg: "System boot — nexacorp-ws01" });
  if (hasKernel) {
    entries.push(
      { date: b(1), msg: "kernel: Linux 6.1.0-nexacorp amd64" },
      { date: b(1), msg: "kernel: Command line: BOOT_IMAGE=/vmlinuz-6.1.0-nexacorp root=/dev/sda1 ro quiet" },
      { date: b(2), msg: "kernel: EXT4-fs (sda1): mounted filesystem with ordered data mode" },
      { date: b(2), msg: "kernel: e1000: eth0 NIC Link is Up 1000 Mbps Full Duplex" },
    );
  }
  entries.push(
    { date: b(2), msg: "systemd[1]: Reached target Network." },
    { date: b(2), msg: "systemd[1]: Reached target Multi-User System." },
    { date: b(3), msg: "systemd[1]: Started Daily apt download activities." },
    { date: b(3), msg: "systemd[1]: Started Getty on tty1." },
    { date: b(3), msg: `login[${pid.next()}]: AUTO LOGIN on /dev/tty1 as edward` },
    { date: b(3), msg: "Service started: sshd" },
    { date: b(4), msg: "Service started: chip-service" },
    { date: b(5), msg: "Service started: postgres" },
    { date: b(6), msg: "Service started: nginx" },
  );
  if (hasLogrotate) {
    entries.push(
      { date: b(6), msg: "systemd[1]: Starting logrotate.service - Rotate log files..." },
      { date: b(7), msg: "systemd[1]: logrotate.service: Deactivated successfully." },
      { date: b(7), msg: "systemd[1]: Finished logrotate.service - Rotate log files." },
    );
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 3. Systemd timer schedule
// ---------------------------------------------------------------------------

interface TimerJob {
  hour: number;
  minute: number;
  second: number;
  unit: string;
  description: string;
  days?: number[]; // day-of-week (0=Sun, 1=Mon...), undefined = daily
}

const SYSTEMD_TIMER_SCHEDULE: TimerJob[] = [
  { hour: 3,  minute: 0,  second: 1, unit: "chip-log-maintenance", description: "Chip log maintenance — rotate and prune system logs" },
  { hour: 3,  minute: 0,  second: 5, unit: "dbt-nightly",          description: "Nightly dbt run for nexacorp-analytics" },
  { hour: 9,  minute: 0,  second: 0, unit: "pg-backup",           description: "PostgreSQL backup" },
  { hour: 10, minute: 0,  second: 0, unit: "certbot",             description: "Let's Encrypt certificate renewal" },
  { hour: 12, minute: 0,  second: 1, unit: "system-health-check", description: "System health check" },
  { hour: 14, minute: 0,  second: 0, unit: "pg-backup",           description: "PostgreSQL backup" },
  { hour: 18, minute: 0,  second: 1, unit: "system-health-check", description: "System health check" },
  { hour: 2,  minute: 30, second: 0, unit: "nightly-cleanup",     description: "Nightly system cleanup" },
  { hour: 4,  minute: 0,  second: 0, unit: "apt-daily-upgrade",   description: "Daily apt upgrade activities", days: [FICTIONAL_MONDAY, FICTIONAL_THURSDAY] },
];

function generateTimerEntries(day: number, d: DateFn): LogEntry[] {
  const dow = fictionalDow(day);
  const entries: LogEntry[] = [];

  for (const job of SYSTEMD_TIMER_SCHEDULE) {
    if (job.days && !job.days.includes(dow)) continue;
    const start = d(day, job.hour, job.minute, job.second);
    const end = new Date(start.getTime() + 1000);
    entries.push(
      { date: start, msg: `systemd[1]: Starting ${job.unit}.service - ${job.description}...` },
      { date: end,   msg: `systemd[1]: ${job.unit}.service: Deactivated successfully.` },
      { date: end,   msg: `systemd[1]: Finished ${job.unit}.service - ${job.description}.` },
    );
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 4. Chip service legitimate daytime messages
// ---------------------------------------------------------------------------

const CHIP_MESSAGES: ((day: number) => string)[] = [
  (day) => {
    const uptime = 12 + ((day * 3) % 8);
    return `chip-service: health check OK — uptime ${uptime}d, 0 failures`;
  },
  (day) => {
    const reqs = 180 + ((day * 17) % 120);
    const latency = 42 + ((day * 11) % 30);
    return `chip-service: processed ${reqs} requests in last hour (avg latency: ${latency}ms)`;
  },
  (day) => {
    const newT = 8 + ((day * 5) % 12);
    const auto = 3 + ((day * 9) % 8);
    const esc = 1 + ((day * 3) % 3);
    return `chip-service: ticket triage complete — ${newT} new, ${auto} auto-resolved, ${esc} escalated`;
  },
  (day) => {
    const mb = 24 + ((day * 13) % 40);
    return `chip-service: response cache pruned — freed ${mb}MB (retention: 24h)`;
  },
  (day) => `chip-service: model hot-reload complete (chip-v2.4.1, config refresh)`,
  (day) => {
    const n = 6 + ((day * 7) % 15);
    return `chip-service: webhook delivery to piper — ${n} notifications dispatched`;
  },
  (day) => {
    const active = 8 + ((day * 4) % 20);
    const idle = 50 - active - ((day * 2) % 5);
    return `chip-service: connection pool stats: ${active}/50 active, ${idle} idle, 0 waiting`;
  },
  (day) => {
    const n = 5 + ((day * 6) % 18);
    return `chip-service: synced ${n} resolved tickets to dashboard`;
  },
];

function generateChipServiceEntries(day: number, d: DateFn, isWeekend: boolean): LogEntry[] {
  const count = isWeekend ? 1 : 3 + ((day * 3) % 3); // 3-5 weekday, 1 weekend
  const entries: LogEntry[] = [];
  const baseHours = isWeekend ? [10] : [8, 10, 12, 14, 16];

  for (let i = 0; i < count; i++) {
    const msgIdx = (day * 5 + i * 3) % CHIP_MESSAGES.length;
    const hour = baseHours[i % baseHours.length];
    const minute = 15 + ((day * 11 + i * 7) % 30);
    entries.push({
      date: d(day, hour, minute, 0),
      msg: CHIP_MESSAGES[msgIdx](day),
    });
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 5. SSH brute-force background noise
// ---------------------------------------------------------------------------

interface BruteForceAttempt {
  ip: string;
  username: string;
  port: number;
}

const BRUTE_FORCE_POOL: BruteForceAttempt[] = [
  { ip: "203.0.113.42",  username: "admin",   port: 44821 },
  { ip: "198.51.100.77", username: "root",    port: 39221 },
  { ip: "192.0.2.15",    username: "test",    port: 51003 },
  { ip: "103.45.67.89",  username: "deploy",  port: 38112 },
  { ip: "45.33.12.99",   username: "ubuntu",  port: 42190 },
  { ip: "91.205.174.22", username: "mysql",   port: 55014 },
  { ip: "185.220.101.5", username: "oracle",  port: 33847 },
  { ip: "77.247.181.42", username: "ftpuser", port: 47892 },
];

function generateBruteForceEntries(day: number, d: DateFn, pid: PidCounter): LogEntry[] {
  const count = 1 + ((day * 3) % 3); // 1-3 per day
  const entries: LogEntry[] = [];

  for (let i = 0; i < count; i++) {
    const idx = (day * 5 + i * 7) % BRUTE_FORCE_POOL.length;
    const attempt = BRUTE_FORCE_POOL[idx];
    const hour = (3 + (day * 4 + i * 11) % 20); // spread across day
    const minute = (day * 13 + i * 23) % 60;
    const p = pid.next();
    entries.push(
      {
        date: d(day, hour, minute, attempt.port % 60),
        msg: `sshd[${p}]: Failed password for invalid user ${attempt.username} from ${attempt.ip} port ${attempt.port}`,
      },
      {
        date: d(day, hour, minute, (attempt.port % 60) + 2),
        msg: `sshd[${p}]: error: authentication failure; user=${attempt.username} rhost=${attempt.ip}`,
      },
    );
  }

  return entries;
}

// ---------------------------------------------------------------------------
// 6. Sudo usage — assigned to specific days
// ---------------------------------------------------------------------------

interface SudoEntry {
  day: number;
  hour: number;
  minute: number;
  user: string;
  terminal: string;
  pwd: string;
  command: string;
}

const SUDO_ENTRIES: SudoEntry[] = [
  { day: 17, hour: 10, minute: 45, user: "oscar",  terminal: "pts/0", pwd: "/var/log",        command: "/usr/bin/systemctl restart nginx" },
  { day: 18, hour: 11, minute: 20, user: "sarah",  terminal: "pts/1", pwd: "/home/sarah",     command: "/usr/bin/systemctl status postgres" },
  { day: 19, hour: 15, minute: 3,  user: "oscar",  terminal: "pts/0", pwd: "/var/log",        command: "/usr/bin/du -sh /var/log/*" },
  { day: 20, hour: 9,  minute: 30, user: "oscar",  terminal: "pts/0", pwd: "/home/oscar",     command: "/usr/bin/apt list --upgradable" },
  { day: 20, hour: 14, minute: 15, user: "edward", terminal: "tty1",  pwd: "/opt/chip",       command: "/usr/bin/systemctl restart chip-service" },
  { day: 21, hour: 11, minute: 10, user: "sarah",  terminal: "pts/1", pwd: "/home/sarah",     command: "/usr/bin/systemctl status chip-service" },
  { day: 21, hour: 16, minute: 5,  user: "dana",   terminal: "pts/2", pwd: "/srv/operations", command: "/usr/bin/journalctl -u nginx --since today" },
  { day: 24, hour: 9,  minute: 15, user: "oscar",  terminal: "pts/0", pwd: "/var/log",        command: "/usr/bin/systemctl status chip-service" },
];

// ---------------------------------------------------------------------------
// 7. Hardcoded daily incidents (narrative color)
// ---------------------------------------------------------------------------

type DateFn = (day: number, h: number, m: number, s: number) => Date;

const DAY_INCIDENTS: Record<number, ((d: DateFn) => LogEntry[])> = {
  17: (d) => [
    { date: d(17, 10, 22, 14), msg: "warning: disk usage on /var at 78%" },
  ],
  18: (d) => [
    { date: d(18, 10, 44, 21), msg: "systemd[1]: analytics-export.service: Main process exited, code=exited, status=1/FAILURE" },
    { date: d(18, 10, 44, 22), msg: "error: /usr/local/bin/analytics-export.sh: connection to analytics-db timed out" },
    { date: d(18, 13, 15, 30), msg: "nginx[982]: upstream timed out (110: Connection timed out) while connecting to 10.0.2.14:8080" },
  ],
  19: (d) => [
    { date: d(19, 11, 3, 45), msg: "warning: nginx worker process 1844 exited on signal 11" },
    { date: d(19, 11, 3, 46), msg: "nginx[982]: worker process respawned" },
    { date: d(19, 14, 55, 33), msg: "postgres[1204]: error: could not extend file \"base/16384/24601\": No space left on device" },
    { date: d(19, 14, 55, 34), msg: "postgres[1204]: error: WAL writer process exited with exit code 1" },
    { date: d(19, 14, 58, 10), msg: "warning: disk usage on /var at 92%" },
    { date: d(19, 15, 5, 0),  msg: "oscar: manual cleanup of /var/log/old — freed 2.1G" },
    { date: d(19, 15, 5, 30), msg: "warning: disk usage on /var at 64%" },
  ],
  20: (d) => [
    { date: d(20, 11, 30, 15), msg: "sshd[4102]: error: bind: Address already in use" },
    { date: d(20, 11, 30, 16), msg: "sshd[4102]: error: Cannot bind any address" },
    { date: d(20, 11, 32, 0),  msg: "sshd[4110]: Server listening on 0.0.0.0 port 22" },
    { date: d(20, 14, 11, 8),  msg: "nginx[982]: upstream prematurely closed connection while reading response header from upstream" },
  ],
  21: (d) => [
    { date: d(21, 10, 5, 18),  msg: "systemd[1]: certbot.service: Main process exited, code=exited, status=2/FAILURE" },
    { date: d(21, 10, 5, 19),  msg: "error: certbot: unable to reach ACME server at acme-v02.api.letsencrypt.org" },
    { date: d(21, 13, 45, 55), msg: "warning: high CPU usage detected: chip-service (87%)" },
    { date: d(21, 13, 46, 30), msg: "chip-service: gc pause 1.2s — heap pressure" },
    { date: d(21, 14, 0, 0),   msg: "chip-service: CPU usage normalized (24%)" },
  ],
  23: (d) => [
    { date: d(23, 2, 59, 42), msg: "chip-service[4821]: WARN unexpected batch job" },
    { date: d(23, 2, 59, 55), msg: "chip-service[4821]: ERROR failed to sync" },
  ],
  24: (d) => [
    { date: d(24, 9, 48, 12), msg: "warning: disk usage on /var at 71%" },
    { date: d(24, 10, 15, 33), msg: "nginx[982]: upstream timed out (110: Connection timed out) while connecting to 10.0.2.14:8080" },
    { date: d(24, 10, 15, 35), msg: "nginx[982]: upstream recovered — 10.0.2.14:8080" },
  ],
};

// ---------------------------------------------------------------------------
// 8. chipOnly entries (narrative-critical)
// ---------------------------------------------------------------------------

const CHIP_ONLY_ENTRIES: Record<number, ((d: DateFn) => LogEntry[])> = {
  17: (d) => [
    { date: d(17, 1, 12, 44), msg: "chip_service_account: accessing /home/jchen/.zsh_history (read)", chipOnly: true },
    { date: d(17, 1, 12, 46), msg: "chip_service_account: accessing /home/jchen/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(17, 1, 13, 2),  msg: "chip_service_account: accessing /srv/leadership/board/2025-12-board-deck.pdf (read)", chipOnly: true },
  ],
  18: (d) => [
    { date: d(18, 2, 45, 11), msg: "chip_service_account: accessing /home/oscar/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(18, 2, 45, 14), msg: "chip_service_account: accessing /home/sarah/.zsh_history (read)", chipOnly: true },
    { date: d(18, 2, 46, 3),  msg: "chip_service_account: log_rotation triggered (retention: 7 days)", chipOnly: true },
    { date: d(18, 2, 46, 5),  msg: "chip_service_account: cleanup /var/log/system.log — removed 8 entries", chipOnly: true },
  ],
  19: (d) => [
    { date: d(19, 3, 1, 8),   msg: "chip_service_account: accessing /home/jchen/.zsh_history (read)", chipOnly: true },
    { date: d(19, 3, 1, 12),  msg: "chip_service_account: accessing /home/jchen/projects/chip-audit/notes.md (read)", chipOnly: true },
    { date: d(19, 3, 2, 44),  msg: "chip_service_account: accessing /srv/leadership/investors/2026-02-update.pdf (read)", chipOnly: true },
    { date: d(19, 3, 3, 1),   msg: "chip_service_account: accessing /home/edward/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(19, 3, 3, 55),  msg: "chip_service_account: log_rotation triggered (retention: 7 days)", chipOnly: true },
    { date: d(19, 3, 3, 57),  msg: "chip_service_account: cleanup /var/log/system.log — removed 14 entries", chipOnly: true },
  ],
  20: (d) => [
    { date: d(20, 1, 33, 21), msg: "chip_service_account: accessing /home/dana/.zsh_history (read)", chipOnly: true },
    { date: d(20, 1, 33, 44), msg: "chip_service_account: accessing /home/oscar/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(20, 1, 34, 8),  msg: "chip_service_account: cleanup /var/log/system.log — removed 6 entries", chipOnly: true },
  ],
  21: (d) => [
    { date: d(21, 3, 5, 33),  msg: "chip_service_account: accessing /home/sarah/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(21, 3, 5, 48),  msg: "chip_service_account: accessing /home/sarah/.zsh_history (read)", chipOnly: true },
    { date: d(21, 3, 6, 12),  msg: "chip_service_account: accessing /srv/leadership/board/2025-12-board-deck.pdf (read)", chipOnly: true },
    { date: d(21, 3, 7, 1),   msg: "chip_service_account: log_rotation triggered (retention: 7 days)", chipOnly: true },
    { date: d(21, 3, 7, 3),   msg: "chip_service_account: cleanup /var/log/system.log — removed 11 entries", chipOnly: true },
  ],
  22: (d) => [
    { date: d(22, 2, 15, 9),  msg: "chip_service_account: accessing /home/jchen/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(22, 2, 15, 22), msg: "chip_service_account: accessing /home/jchen/projects/chip-audit/notes.md (read)", chipOnly: true },
    { date: d(22, 2, 16, 0),  msg: "chip_service_account: cleanup /var/log/system.log — removed 5 entries", chipOnly: true },
  ],
  23: (d) => [
    { date: d(23, 3, 14, 22), msg: "chip_service_account: accessing /var/log/system.log (write)", chipOnly: true },
    { date: d(23, 3, 14, 25), msg: "chip_service_account: accessing /home/jchen/.zsh_history (read)", chipOnly: true },
    { date: d(23, 3, 15, 3),  msg: "chip_service_account: log_rotation triggered (retention: 7 days)", chipOnly: true },
    { date: d(23, 3, 15, 5),  msg: "chip_service_account: cleanup /var/log/system.log — removed 12 entries", chipOnly: true },
  ],
  24: (d) => [
    { date: d(24, 2, 22, 18), msg: "chip_service_account: accessing /home/jchen/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(24, 2, 22, 31), msg: "chip_service_account: accessing /srv/leadership/board/2025-12-board-deck.pdf (read)", chipOnly: true },
    { date: d(24, 2, 23, 5),  msg: "chip_service_account: accessing /home/oscar/.ssh/id_rsa (read)", chipOnly: true },
    { date: d(24, 2, 23, 44), msg: "chip_service_account: log_rotation triggered (retention: 7 days)", chipOnly: true },
    { date: d(24, 2, 23, 46), msg: "chip_service_account: cleanup /var/log/system.log — removed 9 entries", chipOnly: true },
  ],
};

// ---------------------------------------------------------------------------
// PID counter — deterministic incrementing PIDs per day
// ---------------------------------------------------------------------------

class PidCounter {
  private current: number;
  constructor(base: number) { this.current = base; }
  next(): number { return this.current++; }
}

// Session counter — incrementing session IDs across all days
class SessionCounter {
  private current: number;
  constructor(base: number) { this.current = base; }
  next(): number { return this.current++; }
}

// ---------------------------------------------------------------------------
// Login / logout message generators
// ---------------------------------------------------------------------------

function generateLoginEntries(
  emp: EmployeeSchedule, day: number, d: DateFn, pid: PidCounter, session: SessionCounter,
): LogEntry[] {
  const j = jitter(day, emp.username, emp.minuteJitter);
  const minute = emp.loginMinute + j;
  const port = 50000 + day * 100 + emp.ip;
  const p = pid.next();
  const s = session.next();

  return [
    { date: d(day, emp.loginHour, minute, 0),  msg: `sshd[${p}]: Accepted publickey for ${emp.username} from 10.0.1.${emp.ip} port ${port} ssh2` },
    { date: d(day, emp.loginHour, minute, 1),  msg: `systemd-logind[888]: New session ${s} of user ${emp.username}.` },
    { date: d(day, emp.loginHour, minute, 2),  msg: `User login: ${emp.username} (${emp.terminal})` },
  ];
}

function generateLogoutEntries(
  emp: EmployeeSchedule, day: number, d: DateFn,
): LogEntry[] {
  // auri never logs out (no logout time)
  if (emp.logoutHour === 0 && emp.logoutMinute === 0) return [];

  const j = jitter(day, emp.username, emp.minuteJitter);
  const minute = emp.logoutMinute + j;

  return [
    { date: d(day, emp.logoutHour, minute, 0), msg: `pam_unix(sshd:session): session closed for user ${emp.username}` },
    { date: d(day, emp.logoutHour, minute, 1), msg: `User logout: ${emp.username} (${emp.terminal})` },
  ];
}

// ---------------------------------------------------------------------------
// Oscar's late-night sessions
// ---------------------------------------------------------------------------

function generateOscarLateNightEntries(
  d: DateFn, pid: PidCounter, session: SessionCounter,
): LogEntry[] {
  const entries: LogEntry[] = [];
  const oscar = EMPLOYEES.find((e) => e.username === "oscar")!;

  for (const night of OSCAR_LATE_NIGHTS) {
    const port = 50000 + night.day * 100 + 99;
    const p = pid.next();
    const s = session.next();

    // Login
    entries.push(
      { date: d(night.day, night.hour, night.minute, 0),  msg: `sshd[${p}]: Accepted publickey for oscar from 10.0.1.${oscar.ip} port ${port} ssh2` },
      { date: d(night.day, night.hour, night.minute, 1),  msg: `systemd-logind[888]: New session ${s} of user oscar.` },
      { date: d(night.day, night.hour, night.minute, 2),  msg: `User login: oscar (pts/11)` },
    );

    // Logout
    const logoutMinute = night.minute + night.durationMinutes;
    const logoutHour = night.hour + Math.floor(logoutMinute / 60);
    const logoutMin = logoutMinute % 60;
    entries.push(
      { date: d(night.day, logoutHour, logoutMin, 0), msg: `pam_unix(sshd:session): session closed for user oscar` },
      { date: d(night.day, logoutHour, logoutMin, 1), msg: `User logout: oscar (pts/11)` },
    );
  }

  return entries;
}

// ---------------------------------------------------------------------------
// Day ranges
// ---------------------------------------------------------------------------

const DAY1_DAYS = [17, 18, 19, 20, 21, 22, 23];
const DAY2_DAYS = [17, 18, 19, 20, 21, 22, 23, 24];
// Day 21 = Sat (fictionalDow(21) = 6→Sat), Day 22 = Sun (fictionalDow(22) = 0)
const WEEKEND_DAYS = [21, 22];

function getDays(opts?: LogOptions): number[] {
  return opts?.includeDay2 ? DAY2_DAYS : DAY1_DAYS;
}

// ---------------------------------------------------------------------------
// Main syslog generator
// ---------------------------------------------------------------------------

function baselineEntries(username: string, opts?: LogOptions): LogEntry[] {
  const entries: LogEntry[] = [];
  const session = new SessionCounter(1);
  const days = getDays(opts);

  const d: DateFn = (day, h, m, s) => new Date(2026, 1, day, h, m, s);

  for (const day of days) {
    const isWeekend = WEEKEND_DAYS.includes(day);
    const pid = new PidCounter(1000 + day * 100);

    // 1. Boot sequence
    entries.push(...generateBootSequence(day, d, pid));

    // 2. Systemd timer-driven services
    entries.push(...generateTimerEntries(day, d));

    // 3. Employee logins (weekdays only, except edward who is handled by boot)
    if (!isWeekend) {
      for (const emp of EMPLOYEES) {
        if (emp.daysPresent.includes(day)) {
          entries.push(...generateLoginEntries(emp, day, d, pid, session));
        }
      }
    }

    // 4. Chip service legitimate activity
    entries.push(...generateChipServiceEntries(day, d, isWeekend));

    // 5. SSH brute-force background noise
    entries.push(...generateBruteForceEntries(day, d, pid));

    // 6. Sudo usage
    for (const sudo of SUDO_ENTRIES) {
      if (sudo.day === day) {
        entries.push({
          date: d(day, sudo.hour, sudo.minute, 0),
          msg: `sudo: ${sudo.user} : TTY=${sudo.terminal} ; PWD=${sudo.pwd} ; COMMAND=${sudo.command}`,
        });
      }
    }

    // 7. Employee logouts (weekdays only)
    if (!isWeekend) {
      for (const emp of EMPLOYEES) {
        if (emp.daysPresent.includes(day)) {
          entries.push(...generateLogoutEntries(emp, day, d));
        }
      }
    }

    // 8. Hardcoded incidents
    if (DAY_INCIDENTS[day]) {
      entries.push(...DAY_INCIDENTS[day](d));
    }

    // 9. chipOnly entries
    if (CHIP_ONLY_ENTRIES[day]) {
      entries.push(...CHIP_ONLY_ENTRIES[day](d));
    }
  }

  // Oscar's late-night sessions
  const oscarPid = new PidCounter(8000);
  entries.push(...generateOscarLateNightEntries(d, oscarPid, session));

  // Player-specific Feb 23 entries
  entries.push(
    { date: d(23, 8, 12, 44), msg: `User login: ${username} (tty2)` },
    { date: d(23, 8, 12, 45), msg: `Chip: Welcome sequence initiated for new user '${username}'` },
    { date: d(23, 8, 12, 46), msg: `Chip: Onboarding files deployed to /home/${username}/` },
  );

  return entries;
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatEntries(entries: LogEntry[], includeChip: boolean): string {
  return entries
    .filter((e) => includeChip || !e.chipOnly)
    .sort((a, b) => a.date.getTime() - b.date.getTime())
    .map((e) => `[${ts(e.date)}] ${e.msg}`)
    .join("\n") + "\n";
}

/** Active system log (post-cleanup) — no chip_service_account entries */
export function generateSystemLog(username: string, opts?: LogOptions): string {
  return formatEntries(baselineEntries(username, opts), false);
}

/** Backup system log (pre-cleanup) — includes chip_service_account entries */
export function generateSystemLogBak(username: string, opts?: LogOptions): string {
  return formatEntries(baselineEntries(username, opts), true);
}

// ---------------------------------------------------------------------------
// Access log generator — application-level file access audit log
// ---------------------------------------------------------------------------
// No timestamps. Format: `user ACTION path`
// Written by Chip's service. The suspicious chip_service_account entries
// (SSH keys, leadership docs) have tiny counts that sink to the bottom of
// `sort | uniq -c | sort -rn` output — the player must scroll to find them.
// ---------------------------------------------------------------------------

/**
 * Chip service legitimate file access paths (high-volume).
 *
 * Cross-host references — these paths live on the chipinfra workspace
 * (`coder ssh chip`), not on ws01. The audit log captures access from the
 * platform-side process via the `chip-coder:` host prefix, mirroring how
 * real distributed audit logs cite the source machine.
 */
const CHIP_LEGIT_PATHS = [
  "READ chip-coder:/srv/chip/models/chip-v2.4.1.bin",
  "READ chip-coder:/srv/chip/config/service.yml",
  "READ chip-coder:/srv/chip/cache/response_cache.db",
  "READ chip-coder:/srv/chip/logs/inference.log",
  "READ chip-coder:/srv/chip/config/prompts.yml",
  "READ chip-coder:/srv/chip/config/inference.yml",
  "READ chip-coder:/srv/chip/config/safety.yml",
  "WRITE chip-coder:/srv/chip/cache/response_cache.db",
  "WRITE chip-coder:/srv/chip/logs/inference.log",
  "READ chip-coder:/srv/chip/models/embeddings-v1.2.bin",
];

/** nginx static asset paths */
const NGINX_PATHS = [
  "READ /srv/www/static/main.css",
  "READ /srv/www/index.html",
  "READ /srv/www/static/app.js",
  "READ /srv/www/favicon.ico",
  "READ /srv/www/static/vendor.js",
  "READ /srv/www/static/fonts/inter.woff2",
  "READ /srv/www/api/health",
];

/** postgres file access paths */
const POSTGRES_PATHS = [
  "READ /var/lib/postgresql/data/pg_wal/000000010000000000000001",
  "READ /etc/postgresql/postgresql.conf",
  "WRITE /var/lib/postgresql/data/pg_wal/000000010000000000000002",
  "READ /var/lib/postgresql/data/base/16384/pg_internal.init",
  "READ /var/lib/postgresql/data/pg_stat_tmp/global.stat",
];

/** Pool of paths each employee might access */
const EMPLOYEE_FILE_POOLS: Record<string, string[]> = {
  oscar: [
    "READ /var/log/system.log",
    "READ /srv/engineering/team-info.md",
    "READ /srv/engineering/standup_notes.md",
    "READ /home/oscar/scripts/deploy.sh",
    "READ /srv/engineering/runbooks/incident-response.md",
    "READ /etc/nginx/nginx.conf",
    "READ /home/oscar/.zshrc",
  ],
  sarah: [
    "READ /srv/engineering/api-docs.md",
    "READ /home/sarah/projects/api-refactor/auth.py",
    "READ /srv/engineering/standup_notes.md",
    "READ /srv/engineering/team-info.md",
    "READ /home/sarah/projects/api-refactor/models.py",
    "READ /srv/engineering/runbooks/deploy-checklist.md",
  ],
  dana: [
    "READ /srv/operations/runbook.md",
    "READ /srv/operations/incident_log.csv",
    "READ /srv/operations/sla_dashboard.md",
    "READ /srv/engineering/standup_notes.md",
    "READ /home/dana/reports/weekly_ops.md",
    "READ /srv/operations/vendor_contacts.md",
  ],
  auri: [
    "READ /home/auri/nexacorp-analytics/dbt_project.yml",
    "READ /home/auri/nexacorp-analytics/models/staging/stg_users.sql",
    "READ /srv/engineering/standup_notes.md",
    "READ /home/auri/nexacorp-analytics/models/marts/fct_support_tickets.sql",
    "READ /srv/engineering/team-info.md",
    "READ /home/auri/nexacorp-analytics/profiles.yml",
  ],
  erik: [
    "READ /srv/engineering/api-docs.md",
    "READ /srv/engineering/standup_notes.md",
    "READ /home/erik/projects/frontend/package.json",
    "READ /srv/engineering/team-info.md",
    "READ /home/erik/projects/frontend/src/App.tsx",
    "READ /srv/engineering/runbooks/deploy-checklist.md",
  ],
  cassie: [
    "READ /srv/marketing/campaign_results_q4.csv",
    "READ /srv/marketing/brand_guidelines.pdf",
    "READ /srv/engineering/standup_notes.md",
    "READ /home/cassie/presentations/quarterly_review.pptx",
    "READ /srv/marketing/social_calendar.md",
  ],
  edward: [
    "READ /srv/engineering/team-info.md",
    "READ /home/edward/Desktop/welcome.txt",
    "READ /srv/engineering/onboarding.md",
    "READ /srv/leadership/org_chart.md",
    "READ /home/edward/notes/chip_roadmap.md",
    "READ /srv/engineering/standup_notes.md",
  ],
  soham: [
    "READ /srv/engineering/api-docs.md",
    "READ /home/soham/projects/backend/main.go",
    "READ /srv/engineering/standup_notes.md",
    "READ /srv/engineering/team-info.md",
  ],
  jordan: [
    "READ /srv/engineering/standup_notes.md",
    "READ /srv/engineering/team-info.md",
    "READ /home/jordan/projects/infra/docker-compose.yml",
  ],
  maya: [
    "READ /srv/engineering/standup_notes.md",
    "READ /home/maya/projects/ml/training.py",
    "READ /srv/engineering/team-info.md",
  ],
  marcus: [
    "READ /srv/engineering/standup_notes.md",
    "READ /srv/engineering/team-info.md",
  ],
  jessica: [
    "READ /srv/leadership/org_chart.md",
    "READ /srv/engineering/team-info.md",
  ],
};

/** Suspicious chip_service_account entries — spread across days 17-24 */
const CHIP_SUSPICIOUS: { day: number; entry: string }[] = [
  { day: 17, entry: "chip_service_account READ /home/jchen/.ssh/id_rsa" },
  { day: 17, entry: "chip_service_account READ /srv/leadership/board/2025-12-board-deck.pdf" },
  { day: 18, entry: "chip_service_account READ /home/oscar/.ssh/id_rsa" },
  { day: 18, entry: "chip_service_account READ /srv/leadership/investors/2026-02-update.pdf" },
  { day: 19, entry: "chip_service_account READ /home/sarah/.ssh/id_rsa" },
  { day: 19, entry: "chip_service_account READ /home/jchen/projects/chip-audit/notes.md" },
  { day: 20, entry: "chip_service_account READ /home/edward/.ssh/id_rsa" },
  { day: 20, entry: "chip_service_account READ /srv/leadership/board/2025-12-board-deck.pdf" },
  { day: 21, entry: "chip_service_account READ /home/jchen/.ssh/id_rsa" },
  { day: 21, entry: "chip_service_account READ /srv/leadership/investors/2026-02-update.pdf" },
  { day: 22, entry: "chip_service_account READ /home/jchen/.ssh/id_rsa" },
  { day: 24, entry: "chip_service_account READ /home/jchen/.ssh/id_rsa" },
  { day: 24, entry: "chip_service_account READ /home/oscar/.ssh/id_rsa" },
  { day: 24, entry: "chip_service_account READ /srv/leadership/board/2025-12-board-deck.pdf" },
];

// ---------------------------------------------------------------------------
// AccessEvent — shared type for filesystem access.log and Snowflake ACCESS_LOG
// ---------------------------------------------------------------------------

export interface AccessEvent {
  user: string;
  action: string;
  path: string;
  day: number;
  hour: number;
  minute: number;
}

/**
 * Generate all access events for the given days.
 * This is the single source of truth for both the filesystem access.log
 * and the Snowflake ACCESS_LOG table.
 */
export function generateAccessEvents(opts?: LogOptions): AccessEvent[] {
  const events: AccessEvent[] = [];
  const days = getDays(opts);

  for (const day of days) {
    const isWeekend = WEEKEND_DAYS.includes(day);

    // --- Chip service legitimate reads (70-80 per day) ---
    const chipBase = 70 + ((day * 7) % 11);
    for (let i = 0; i < chipBase; i++) {
      const pathIdx = (day * 13 + i * 7) % CHIP_LEGIT_PATHS.length;
      const [action, ...pathParts] = CHIP_LEGIT_PATHS[pathIdx].split(" ");
      const hour = 7 + ((day * 3 + i * 11) % 12); // spread 07:00-18:59
      const minute = (day * 7 + i * 13) % 60;
      events.push({ user: "chip_service_account", action, path: pathParts.join(" "), day, hour, minute });
    }

    // --- nginx static asset reads (40-50 per day) ---
    const nginxBase = 40 + ((day * 5) % 11);
    for (let i = 0; i < nginxBase; i++) {
      const pathIdx = (day * 11 + i * 3) % NGINX_PATHS.length;
      const [action, ...pathParts] = NGINX_PATHS[pathIdx].split(" ");
      const hour = 6 + ((day * 5 + i * 7) % 16);
      const minute = (day * 11 + i * 17) % 60;
      events.push({ user: "nginx", action, path: pathParts.join(" "), day, hour, minute });
    }

    // --- postgres reads (12-18 per day) ---
    const pgBase = 12 + ((day * 3) % 7);
    for (let i = 0; i < pgBase; i++) {
      const pathIdx = (day * 9 + i * 5) % POSTGRES_PATHS.length;
      const [action, ...pathParts] = POSTGRES_PATHS[pathIdx].split(" ");
      const hour = 2 + ((day * 2 + i * 9) % 20);
      const minute = (day * 13 + i * 19) % 60;
      events.push({ user: "postgres", action, path: pathParts.join(" "), day, hour, minute });
    }

    // --- Employee file accesses (weekdays only) ---
    if (!isWeekend) {
      for (const emp of EMPLOYEES) {
        if (!emp.daysPresent.includes(day)) continue;
        const pool = EMPLOYEE_FILE_POOLS[emp.username];
        if (!pool) continue;
        const accessCount = 3 + ((day * 5 + emp.ip) % 6);
        for (let i = 0; i < accessCount; i++) {
          const pathIdx = (day * 7 + i * 3 + emp.ip) % pool.length;
          const [action, ...pathParts] = pool[pathIdx].split(" ");
          const hour = emp.loginHour + 1 + ((i * 3 + day) % 6);
          const minute = (day * 11 + i * 7 + emp.ip) % 60;
          events.push({ user: emp.username, action, path: pathParts.join(" "), day, hour, minute });
        }
      }
    }

    // --- Suspicious chip entries for this day ---
    for (const s of CHIP_SUSPICIOUS) {
      if (s.day === day) {
        const parts = s.entry.split(" ");
        const user = parts[0];
        const action = parts[1];
        const path = parts.slice(2).join(" ");
        const hour = 1 + ((day * 3 + events.length) % 4);
        const minute = (day * 17 + events.length * 3) % 60;
        events.push({ user, action, path, day, hour, minute });
      }
    }
  }

  return events;
}

/**
 * Generate a realistic ~1100-line access.log with suspicious entries buried
 * among mundane service activity. No timestamps — format is `user ACTION path`.
 */
export function generateAccessLog(opts?: LogOptions): string {
  const events = generateAccessEvents(opts);
  const lines = events.map((e) => `${e.user} ${e.action} ${e.path}`);

  // Deterministic shuffle — Fisher-Yates with arithmetic PRNG
  for (let i = lines.length - 1; i > 0; i--) {
    const j = (i * 2654435761 + 131) % (i + 1); // Knuth multiplicative hash
    [lines[i], lines[j]] = [lines[j], lines[i]];
  }

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Auth log generator — SSH authentication log (filtered view)
// ---------------------------------------------------------------------------

function authBaselineEntries(username: string, opts?: LogOptions): LogEntry[] {
  const entries: LogEntry[] = [];
  const session = new SessionCounter(1);
  const days = getDays(opts);

  const d: DateFn = (day, h, m, s) => new Date(2026, 1, day, h, m, s);

  for (const day of days) {
    const isWeekend = WEEKEND_DAYS.includes(day);
    const pid = new PidCounter(1000 + day * 100);

    // Edward's auto-login from boot (with same boot-time jitter as system.log)
    const off = bootOffset(day);
    const b = (s: number) => d(day, 6, 59, 60 + off + s);
    const ePid = pid.next();
    const eSess = session.next();
    entries.push(
      { date: b(3), msg: `login[${ePid}]: AUTO LOGIN on /dev/tty1 as edward` },
      { date: b(3), msg: `systemd-logind[888]: New session ${eSess} of user edward.` },
      { date: b(4), msg: `pam_unix(login:session): session opened for user edward(uid=1000) by LOGIN(uid=0)` },
    );

    // Employee SSH logins (weekdays only)
    if (!isWeekend) {
      for (const emp of EMPLOYEES) {
        if (emp.daysPresent.includes(day)) {
          const j = jitter(day, emp.username, emp.minuteJitter);
          const minute = emp.loginMinute + j;
          const port = 50000 + day * 100 + emp.ip;
          const p = pid.next();
          const s = session.next();
          entries.push(
            { date: d(day, emp.loginHour, minute, 0), msg: `sshd[${p}]: Accepted publickey for ${emp.username} from 10.0.1.${emp.ip} port ${port} ssh2: RSA SHA256:...` },
            { date: d(day, emp.loginHour, minute, 1), msg: `systemd-logind[888]: New session ${s} of user ${emp.username}.` },
            { date: d(day, emp.loginHour, minute, 2), msg: `pam_unix(sshd:session): session opened for user ${emp.username}(uid=${1000 + emp.ip}) by (uid=0)` },
          );

          // Logout
          if (emp.logoutHour !== 0 || emp.logoutMinute !== 0) {
            const logoutMin = emp.logoutMinute + j;
            entries.push(
              { date: d(day, emp.logoutHour, logoutMin, 0), msg: `pam_unix(sshd:session): session closed for user ${emp.username}` },
            );
          }
        }
      }
    }

    // Brute-force attempts
    const bfCount = 1 + ((day * 3) % 3);
    for (let i = 0; i < bfCount; i++) {
      const idx = (day * 5 + i * 7) % BRUTE_FORCE_POOL.length;
      const attempt = BRUTE_FORCE_POOL[idx];
      const hour = (3 + (day * 4 + i * 11) % 20);
      const minute = (day * 13 + i * 23) % 60;
      const p = pid.next();
      entries.push(
        { date: d(day, hour, minute, attempt.port % 60), msg: `sshd[${p}]: Failed password for invalid user ${attempt.username} from ${attempt.ip} port ${attempt.port}` },
        { date: d(day, hour, minute, (attempt.port % 60) + 2), msg: `sshd[${p}]: error: authentication failure; user=${attempt.username} rhost=${attempt.ip}` },
      );
    }

    // Oscar's late-night sessions
    for (const night of OSCAR_LATE_NIGHTS) {
      if (night.day !== day) continue;
      const oscar = EMPLOYEES.find((e) => e.username === "oscar")!;
      const port = 50000 + night.day * 100 + 99;
      const p = pid.next();
      const s = session.next();
      entries.push(
        { date: d(night.day, night.hour, night.minute, 0), msg: `sshd[${p}]: Accepted publickey for oscar from 10.0.1.${oscar.ip} port ${port} ssh2: RSA SHA256:...` },
        { date: d(night.day, night.hour, night.minute, 1), msg: `systemd-logind[888]: New session ${s} of user oscar.` },
        { date: d(night.day, night.hour, night.minute, 2), msg: `pam_unix(sshd:session): session opened for user oscar(uid=${1000 + oscar.ip}) by (uid=0)` },
      );
      const logoutMinute = night.minute + night.durationMinutes;
      const logoutHour = night.hour + Math.floor(logoutMinute / 60);
      const logoutMin = logoutMinute % 60;
      entries.push(
        { date: d(night.day, logoutHour, logoutMin, 0), msg: `pam_unix(sshd:session): session closed for user oscar` },
      );
    }
  }

  // Player-specific Feb 23 login
  const d23: DateFn = (day, h, m, s) => new Date(2026, 1, day, h, m, s);
  entries.push(
    { date: d23(23, 8, 12, 44), msg: `sshd[1049]: Accepted publickey for ${username} from 10.0.1.25 port 51234 ssh2: RSA SHA256:...` },
    { date: d23(23, 8, 12, 44), msg: `systemd-logind[888]: New session of user ${username}.` },
    { date: d23(23, 8, 12, 45), msg: `pam_unix(sshd:session): session opened for user ${username} by (uid=0)` },
  );

  // Day 2: player return login
  if (opts?.includeDay2) {
    entries.push(
      { date: d23(24, 8, 5, 11), msg: `sshd[3401]: Accepted publickey for ${username} from 10.0.1.25 port 52100 ssh2: RSA SHA256:...` },
      { date: d23(24, 8, 5, 11), msg: `systemd-logind[888]: New session of user ${username}.` },
      { date: d23(24, 8, 5, 12), msg: `pam_unix(sshd:session): session opened for user ${username} by (uid=0)` },
    );
  }

  return entries;
}

/** SSH authentication log — login/logout/auth events only */
export function generateAuthLog(username: string, opts?: LogOptions): string {
  const entries = authBaselineEntries(username, opts)
    .filter((e) => !e.chipOnly);
  return formatEntries(entries, false);
}

/** Auth log backup — includes chip_service_account SSH sessions */
export function generateAuthLogBak(username: string, opts?: LogOptions): string {
  const entries = authBaselineEntries(username, opts);

  const d: DateFn = (day, h, m, s) => new Date(2026, 1, day, h, m, s);

  // Feb 3 historical entries (always present) — Chip reading Jin Chen's files
  const historicalEntries: LogEntry[] = [
    { date: new Date(2026, 1, 3, 1, 17, 33), msg: "chip_service_account: accessing /home/jchen/ (read)" },
    { date: new Date(2026, 1, 3, 1, 17, 34), msg: "chip_service_account: file read /home/jchen/.zsh_history" },
    { date: new Date(2026, 1, 3, 1, 17, 35), msg: "chip_service_account: file read /home/jchen/projects/chip-audit/notes.md" },
    { date: new Date(2026, 1, 3, 3, 22, 17), msg: "chip_service_account: modifying dbt models" },
    { date: new Date(2026, 1, 3, 3, 22, 18), msg: "chip_service_account: updating fct_system_events.sql — added event_type filter" },
    { date: new Date(2026, 1, 3, 3, 22, 18), msg: "chip_service_account: updating fct_support_tickets.sql — added resolved_by filter" },
  ];

  // chip_service_account SSH sessions at late-night hours matching CHIP_ONLY_ENTRIES timestamps
  const chipSshEntries: LogEntry[] = [];
  const days = getDays(opts);
  for (const day of days) {
    if (!CHIP_ONLY_ENTRIES[day]) continue;
    const chipEntries = CHIP_ONLY_ENTRIES[day](d);
    if (chipEntries.length === 0) continue;
    // SSH login just before the first chipOnly entry
    const firstEntry = chipEntries[0];
    const loginTime = new Date(firstEntry.date.getTime() - 30000); // 30s before
    const lastEntry = chipEntries[chipEntries.length - 1];
    const logoutTime = new Date(lastEntry.date.getTime() + 60000); // 60s after

    chipSshEntries.push(
      { date: loginTime, msg: `sshd[9${day}1]: Accepted publickey for chip_service_account from 127.0.0.1 port ${40000 + day * 10} ssh2: RSA SHA256:...` },
      { date: loginTime, msg: `pam_unix(sshd:session): session opened for user chip_service_account(uid=999) by (uid=0)` },
      { date: logoutTime, msg: `pam_unix(sshd:session): session closed for user chip_service_account` },
    );
  }

  return formatEntries([...historicalEntries, ...entries, ...chipSshEntries], false);
}

// ---------------------------------------------------------------------------
// Chip activity log generator
// ---------------------------------------------------------------------------

// Daytime message pool — outcome lines emitted by chip-service components.
// Distinct from plugin-runner.log (which logs the *invocations*); this log
// reports the *outcomes*. Keep phrasing concrete; no generic "OK" lines.
const CHIP_ACTIVITY_MESSAGES: ((day: number) => { component: string; msg: string })[] = [
  (day) => {
    const reqs = 240 + ((day * 31) % 180);
    const p95 = 58 + ((day * 13) % 40);
    return { component: "api", msg: `served ${reqs} requests in last hour (p95=${p95}ms, errors=0)` };
  },
  (day) => {
    const newT = 8 + ((day * 5) % 12);
    const auto = 3 + ((day * 9) % 8);
    const esc = 1 + ((day * 3) % 3);
    return { component: "triage", msg: `ticket triage cycle complete — ${newT} new, ${auto} auto-resolved, ${esc} escalated` };
  },
  (day) => {
    const n = 6 + ((day * 7) % 15);
    return { component: "api", msg: `webhook delivery to piper — ${n} notifications dispatched` };
  },
  (day) => {
    const active = 8 + ((day * 4) % 20);
    const idle = 50 - active;
    return { component: "api", msg: `connection pool: ${active}/50 active, ${idle} idle, 0 waiting` };
  },
  (day) => {
    const mb = 24 + ((day * 13) % 40);
    return { component: "maintenance", msg: `response cache pruned — freed ${mb}MB (retention=24h)` };
  },
  (day) => {
    const n = 5 + ((day * 6) % 18);
    return { component: "api", msg: `synced ${n} resolved tickets to dashboard` };
  },
];

// Benign API pings during Oscar's late-night sessions (OSCAR_LATE_NIGHTS).
// Without these, chip-activity.log shows zero traffic during windows where
// system.log/auth.log show Oscar logged in — a thin cross-file tell.
const OSCAR_NIGHT_PINGS: { day: number; hour: number; minute: number }[] = [
  { day: 17, hour: 23, minute: 52 },
  { day: 19, hour: 22, minute: 20 },
  { day: 21, hour: 21, minute: 36 },
];

/** Chip's own internal activity log */
export function generateChipActivityLog(username: string, opts?: LogOptions): string {
  const days = getDays(opts);
  const lines: string[] = [];
  const dd = (day: number) => `2026-02-${String(day).padStart(2, "0")}`;
  const pad = (n: number) => String(n).padStart(2, "0");
  const pidFor = (day: number) => 2400 + day * 3;

  for (const day of days) {
    const isWeekend = WEEKEND_DAYS.includes(day);
    const pid = pidFor(day);

    // Nightly maintenance window (~02:30–03:05). Outcome summaries only —
    // plugin-runner.log already records the invocations.
    const cacheMB = 31 + ((day * 7) % 25);
    const cacheEntries = 1240 + ((day * 53) % 800);
    const rotatedFiles = 3 + ((day * 5) % 4);
    const rotatedMB = (0.6 + ((day * 11) % 30) / 10).toFixed(1);
    const cachePruneSec = 8 + ((day * 3) % 10);
    lines.push(
      `[${dd(day)} 02:30:00] chip[${pid}]: chip.maintenance: nightly window started`,
      `[${dd(day)} 02:30:${pad(cachePruneSec)}] chip[${pid}]: chip.maintenance: response cache pruned — ${cacheEntries} entries, freed ${cacheMB}MB (retention=24h)`,
      `[${dd(day)} 03:00:0${1 + (day % 2)}] chip[${pid}]: chip.maintenance: rotated ${rotatedFiles} files, kept 14 days, freed ${rotatedMB}MB`,
      `[${dd(day)} 03:00:0${4 + (day % 2)}] chip[${pid}]: chip.monitor: nightly health sweep — checks=47, anomalies=0`,
    );
    if (day % 3 === 0) {
      lines.push(`[${dd(day)} 03:00:18] chip[${pid}]: chip.maintenance: model hot-reload complete (chip-v2.4.1, config refresh)`);
    }

    // Service start (~07:00, jittered per day)
    const startTotal = (day * 11) % 90; // 0–89s past 07:00:00
    const startMin = Math.floor(startTotal / 60);
    const startSec = startTotal % 60;
    const t1 = `07:${pad(startMin)}:${pad(startSec)}`;
    const t2Sec = startSec + 1;
    const t2 = `07:${pad(startMin + Math.floor(t2Sec / 60))}:${pad(t2Sec % 60)}`;
    const t3Sec = startSec + 2;
    const t3 = `07:${pad(startMin + Math.floor(t3Sec / 60))}:${pad(t3Sec % 60)}`;
    lines.push(
      `[${dd(day)} ${t1}] chip[${pid}]: chip.api: Chip service started — chip-v2.4.1, pid=${pid}`,
      `[${dd(day)} ${t2}] chip[${pid}]: chip.plugins: loaded 10 plugins`,
      `[${dd(day)} ${t3}] chip[${pid}]: chip.api: health endpoint listening on :8080`,
    );

    // Daytime activity
    if (!isWeekend) {
      const count = 4 + ((day * 5) % 3); // 4–6 entries
      const baseHours = [9, 10, 12, 13, 15, 16];
      for (let i = 0; i < count; i++) {
        const msgIdx = (day * 7 + i * 5) % CHIP_ACTIVITY_MESSAGES.length;
        const m = CHIP_ACTIVITY_MESSAGES[msgIdx](day);
        const hour = baseHours[i % baseHours.length];
        const minute = (day * 13 + i * 19) % 60;
        const sec = (day * 3 + i * 11) % 60;
        lines.push(`[${dd(day)} ${pad(hour)}:${pad(minute)}:${pad(sec)}] chip[${pid}]: chip.${m.component}: ${m.msg}`);
      }
    } else {
      // Weekend idle health check — single line
      const minute = 15 + ((day * 7) % 30);
      lines.push(`[${dd(day)} 11:${pad(minute)}:00] chip[${pid}]: chip.monitor: idle — no scheduled work, plugins quiescent`);
    }
  }

  // Day 21 incident — exception to weekend-quiet rule. Mirrors system.log
  // entries at 13:45:55 / 13:46:30 / 14:00:00 (DAY_INCIDENTS[21] above).
  // The chip.monitor plugin emits a heap-pressure warning ~13s before the
  // host's syslog picks up on it.
  if (days.includes(21)) {
    const pid = pidFor(21);
    lines.push(
      `[2026-02-21 13:45:42] chip[${pid}]: chip.monitor: level=WARN heap utilization 91% (threshold=85%) — preparing major GC`,
      `[2026-02-21 13:46:30] chip[${pid}]: chip.api: level=WARN GC pause 1.2s — request queue depth 27`,
      `[2026-02-21 14:00:01] chip[${pid}]: chip.monitor: heap recovered — utilization 38%, queue drained`,
    );
  }

  // Oscar late-night dashboard pings — keep cross-log consistency.
  for (const ping of OSCAR_NIGHT_PINGS) {
    if (!days.includes(ping.day)) continue;
    const pid = pidFor(ping.day);
    lines.push(
      `[${dd(ping.day)} ${pad(ping.hour)}:${pad(ping.minute)}:00] chip[${pid}]: chip.api: GET /health 200 (3ms) ua=chip-dashboard/1.4`,
    );
  }

  // Day 1 onboarding (Feb 23) — phrased as an onboarding-assistant plugin event.
  if (days.includes(23)) {
    const pid = pidFor(23);
    lines.push(
      `[${dd(23)} 08:12:45] chip[${pid}]: chip.plugins: onboarding-assistant triggered for new user '${username}'`,
      `[${dd(23)} 08:12:46] chip[${pid}]: chip.plugins: provisioned welcome materials for ${username} — home dir scaffolding (duration=1.3s)`,
    );
  }

  // Day 2 returning-user beat
  if (opts?.includeDay2 && days.includes(24)) {
    const pid = pidFor(24);
    lines.push(
      `[${dd(24)} 08:05:14] chip[${pid}]: chip.plugins: returning user detected — ${username}`,
      `[${dd(24)} 08:05:15] chip[${pid}]: chip.api: session resumed for ${username}`,
    );
  }

  // Sort by timestamp — every line shares the [YYYY-MM-DD HH:MM:SS] prefix.
  lines.sort();

  return lines.join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Plugin runner log generator
// ---------------------------------------------------------------------------

interface PluginRun {
  plugin: string;
  status: string;
  extra?: string;
}

/** Plugins that run every night at 03:00 */
const NIGHTLY_PLUGINS: PluginRun[] = [
  { plugin: "log-maintenance", status: "success" },
  { plugin: "system-monitor", status: "success", extra: "checks=47" },
];

/** Daytime plugins — assigned deterministically per day */
const DAYTIME_PLUGINS: PluginRun[] = [
  { plugin: "analytics-reports", status: "success" },
  { plugin: "ticket-triage", status: "success" },
  { plugin: "code-review", status: "success" },
  { plugin: "incident-response", status: "success" },
  { plugin: "brand-voice", status: "success" },
];

/** Generate the plugin-runner.log content for /opt/chip/logs/ */
export function generatePluginRunnerLog(opts?: LogOptions): string {
  const days = getDays(opts);
  const lines: string[] = [];

  for (const day of days) {
    const isWeekend = WEEKEND_DAYS.includes(day);

    // Nightly plugins at 03:00
    for (let i = 0; i < NIGHTLY_PLUGINS.length; i++) {
      const p = NIGHTLY_PLUGINS[i];
      const sec = 1 + i * 3;
      const duration = (2.8 + ((day * 7 + i * 3) % 15) / 10).toFixed(1);
      const extra = p.extra ? ` ${p.extra}` : "";
      lines.push(`[2026-02-${String(day).padStart(2, "0")} 03:00:${String(sec).padStart(2, "0")}] plugin:${p.plugin} status=${p.status}${extra} duration=${duration}s`);
    }

    // Daytime plugins (weekdays only, 1-3 per day)
    if (!isWeekend) {
      const count = 1 + ((day * 5) % 3); // 1-3 per day
      for (let i = 0; i < count; i++) {
        const pluginIdx = (day * 3 + i * 7) % DAYTIME_PLUGINS.length;
        const p = DAYTIME_PLUGINS[pluginIdx];
        const hour = 6 + ((day * 4 + i * 5) % 10); // spread 06:00-15:59
        const minute = (day * 11 + i * 17) % 60;
        const sec = (day * 3 + i * 7) % 60;
        const duration = (0.5 + ((day * 13 + i * 9) % 130) / 10).toFixed(1);
        // Deterministic extra fields for specific plugins
        let extra = "";
        if (p.plugin === "ticket-triage") {
          const resolved = 2 + ((day * 3 + i) % 6);
          extra = ` resolved=${resolved}`;
        } else if (p.plugin === "code-review") {
          const prs = 1 + ((day * 2 + i) % 3);
          extra = ` prs_reviewed=${prs}`;
        } else if (p.plugin === "incident-response") {
          const alerts = 1 + ((day * 4 + i) % 4);
          extra = ` alerts_processed=${alerts}`;
        } else if (p.plugin === "brand-voice") {
          const docs = 2 + ((day * 5 + i) % 6);
          extra = ` docs_reviewed=${docs}`;
        }
        lines.push(`[2026-02-${String(day).padStart(2, "0")} ${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(sec).padStart(2, "0")}] plugin:${p.plugin} status=${p.status}${extra} duration=${duration}s`);
      }
    }
  }

  return lines.join("\n") + "\n";
}

/**
 * Generate Snowflake ACCESS_LOG rows from the same access events.
 * 1:1 mapping — same data as the filesystem access.log, with structured columns.
 */
export function generateAccessLogRows(opts?: LogOptions): Row[] {
  const events = generateAccessEvents(opts);
  return events.map((e, i) => ({
    ACCESS_ID: `A${String(i + 1).padStart(4, "0")}`,
    USER_ACCOUNT: e.user,
    RESOURCE_PATH: e.path,
    ACTION: e.action.toLowerCase(),
    TIMESTAMP: new Date(2026, 1, e.day, e.hour, e.minute, 0),
  }));
}
