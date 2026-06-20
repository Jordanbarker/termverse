import { DirectoryNode } from "@tt/core/filesystem/types";
import { file, dir } from "@tt/core/filesystem/builders";

const CHIP_LOG_MAINTENANCE_SERVICE = `[Unit]
Description=Chip log maintenance: rotate and prune system logs
Documentation=file:///opt/chip/plugins/log-maintenance/SKILL.md
After=network.target

[Service]
Type=oneshot
User=chip_service_account
Group=chip_service_account
ExecStart=/opt/chip/plugins/log-maintenance/cleanup.sh
Nice=10
IOSchedulingClass=best-effort
IOSchedulingPriority=7

[Install]
WantedBy=multi-user.target
`;

const CHIP_LOG_MAINTENANCE_TIMER = `[Unit]
Description=Nightly trigger for chip-log-maintenance.service
Documentation=file:///opt/chip/plugins/log-maintenance/SKILL.md

[Timer]
OnCalendar=*-*-* 03:00:00
AccuracySec=1min
Persistent=true
Unit=chip-log-maintenance.service

[Install]
WantedBy=timers.target
`;

const DBT_NIGHTLY_SERVICE = `[Unit]
Description=Nightly dbt run for nexacorp-analytics
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=dbt_service
WorkingDirectory=/srv/dbt/nexacorp-analytics
EnvironmentFile=/etc/dbt/snowflake.env
ExecStart=/usr/local/bin/dbt run --profiles-dir /etc/dbt
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
`;

const DBT_NIGHTLY_TIMER = `[Unit]
Description=Nightly trigger for dbt-nightly.service
Requires=dbt-nightly.service

[Timer]
OnCalendar=*-*-* 03:00:00
AccuracySec=5min
Persistent=true
Unit=dbt-nightly.service

[Install]
WantedBy=timers.target
`;

export function buildEtcDirectory(): DirectoryNode {
  return dir("etc", {
    hostname: file("hostname", "nexacorp-ws01\n"),
    motd: file("motd", `NexaCorp Internal Systems Portal v4.7.2
Authorized access only. All activity is monitored.
`),
    systemd: dir("systemd", {
      system: dir("system", {
        "chip-log-maintenance.service": file("chip-log-maintenance.service", CHIP_LOG_MAINTENANCE_SERVICE),
        "chip-log-maintenance.timer": file("chip-log-maintenance.timer", CHIP_LOG_MAINTENANCE_TIMER),
        "dbt-nightly.service": file("dbt-nightly.service", DBT_NIGHTLY_SERVICE),
        "dbt-nightly.timer": file("dbt-nightly.timer", DBT_NIGHTLY_TIMER),
      }),
    }),
  });
}
