import { PiperDelivery } from "../../../engine/piper/types";

export function getAuriDeliveries(_username: string): PiperDelivery[] {
  return [
    // === DM Auri: Welcome + data audit (after reading Edward's welcome email) ===
    {
      id: "auri_hello",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_hello_1",
          from: "Auri Park",
          timestamp: "",
          body: `Hey! I'm Auri, Edward said I'm your onboarding buddy. Welcome to the team!`,
        },
        {
          id: "auri_hello_2",
          from: "Auri Park",
          timestamp: "",
          body: "I've been kind of holding the fort on the data side since Chen left. It's been a lot, honestly. Really glad to have another engineer around.",
        },
        {
          id: "auri_hello_3",
          from: "Auri Park",
          timestamp: "",
          body: "Small ask while you're getting set up. Chen left a bunch of stuff in the handoff folder. Start by checking what's in /srv/engineering/chen-handoff/. ls -lh shows file sizes. And read todo.txt to see what's still open.",
        },
        {
          id: "auri_hello_4",
          from: "Auri Park",
          timestamp: "",
          body: `Then for the data: pipeline_runs.csv has run history. head, tail, and wc are great for a quick audit.`,
        }
      ],
      trigger: { type: "after_email_read", emailId: "welcome_edward" },
      replyOptions: [
        {
          label: "I'll take a look at it.",
          messageBody: "Sure thing. I'll pull the header, tail, and line count and let you know.",
          triggerEvents: [{ type: "objective_completed", detail: "inspection_tools_accepted" }],
        },
      ],
    },

    // === DM Auri: Pipeline check-in (after reading handoff notes) ===
    {
      id: "auri_pipeline_help",
      channelId: "dm_auri",
      messages: [],
      trigger: { type: "after_file_read", filePath: "/srv/engineering/chen-handoff/notes.txt" },
      replyOptions: [
        {
          label: "The notes feel kind of rushed. Did Chen leave in a hurry?",
          messageBody: "Yeah I read through them. They feel kind of rushed honestly, like he was in a hurry to wrap up. Did something happen with Chen?",
          triggerEvents: [
            { type: "objective_completed", detail: "handoff_curious_about_chen" },
            { type: "objective_completed", detail: "handoff_reviewed" },
          ],
        },
        {
          label: "All done. What should I tackle first?",
          messageBody: "All read! Looks like there's a lot going on with the pipeline. What should I tackle first?",
          triggerEvents: [
            { type: "objective_completed", detail: "handoff_reviewed_proactive" },
            { type: "objective_completed", detail: "handoff_reviewed" },
          ],
        },
      ],
    },

    // === DM Auri: Chen response (curious about Chen's departure) ===
    {
      id: "auri_chen_response",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_chen_1",
          from: "Auri Park",
          timestamp: "",
          body: "Yeah... honestly? It all happened kind of fast. One week he was here, the next he wasn't.",
        },
        {
          id: "auri_chen_2",
          from: "Auri Park",
          timestamp: "",
          body: "Edward said it was voluntary. He'd been working late for months; maybe he just needed a break?",
        },
        {
          id: "auri_chen_3",
          from: "Auri Park",
          timestamp: "",
          body: "Anyway, I don't want to speculate. The important thing is the work he left behind.",
        },
        {
          id: "auri_chen_4",
          from: "Auri Park",
          timestamp: "",
          body: "You'll be working with the pipeline data a lot, so it'd be great if you could do a full build and get a feel for how the project's set up. Chen's todo says the test suite hasn't been run in weeks. Would be really helpful to know where things stand.",
        },
        {
          id: "auri_chen_5",
          from: "Auri Park",
          timestamp: "",
          body: "We do all our data work in a Coder dev container. Oscar should reach out with your workspace details. Once you're in, clone the repo with git clone nexacorp/nexacorp-analytics. If you hit any git issues, ask Chip. It's good at explaining git. Its service account used to have direct push access to our repos but Oscar pulled that after... well, there was an incident. It can still walk you through commands.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "handoff_curious_about_chen" },
      replyOptions: [
        {
          label: "Makes sense, I'll check it out!",
          messageBody: "Good call. I'll do a full build and let you know how it looks!",
          triggerEvents: [{ type: "objective_completed", detail: "pipeline_tools_accepted" }],
        },
        {
          label: "I've used dbt before but it's been a while. Tips?",
          messageBody: "Definitely want to get up to speed on the pipeline! I've used dbt before but it's been a while. Any tips for how things are set up here?",
          triggerEvents: [
            { type: "objective_completed", detail: "pipeline_tools_tips_requested" },
            { type: "objective_completed", detail: "pipeline_tools_accepted" },
          ],
        },
      ],
    },

    // === DM Auri: Proactive response (player wants to get started) ===
    {
      id: "auri_proactive_response",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_proactive_1",
          from: "Auri Park",
          timestamp: "",
          body: "Love the energy!",
        },
        {
          id: "auri_proactive_2",
          from: "Auri Park",
          timestamp: "",
          body: "The data pipeline is the big thing. You'll be working with it daily, so it'd be great if you could do a full build and get a feel for how the project's set up. Chen's todo says the test suite hasn't been run in weeks.",
        },
        {
          id: "auri_proactive_3",
          from: "Auri Park",
          timestamp: "",
          body: "We do all our data work in a Coder dev container. Oscar should reach out with your workspace details. The repo is nexacorp/nexacorp-analytics, git clone it once you're in.",
        },
        {
          id: "auri_proactive_3b",
          from: "Auri Park",
          timestamp: "",
          body: "If you need help with git, ask Chip. It's good at explaining the commands. Its service account used to have direct push access but Oscar pulled that after the incident. It can still walk you through anything though.",
        },
        {
          id: "auri_proactive_4",
          from: "Auri Park",
          timestamp: "",
          body: "Everything talks to our Snowflake instance. The staging models pull from raw tables, intermediate models do the joins, and the marts are what the business actually looks at.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "handoff_reviewed_proactive" },
      replyOptions: [
        {
          label: "Makes sense, I'll check it out!",
          messageBody: "Good call. I'll do a full build and let you know how it looks!",
          triggerEvents: [{ type: "objective_completed", detail: "pipeline_tools_accepted" }],
        },
        {
          label: "I've used dbt before but it's been a while. Tips?",
          messageBody: "Definitely want to get up to speed on the pipeline! I've used dbt before but it's been a while. Any tips for how things are set up here?",
          triggerEvents: [
            { type: "objective_completed", detail: "pipeline_tools_tips_requested" },
            { type: "objective_completed", detail: "pipeline_tools_accepted" },
          ],
        },
      ],
    },

    // Auri pipeline tips (after tips requested)
    {
      id: "auri_pipeline_tips",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_ptips_1",
          from: "Auri Park",
          timestamp: "",
          body: "Sure! Here's the workflow:",
        },
        {
          id: "auri_ptips_2",
          from: "Auri Park",
          timestamp: "",
          body: `First, connect to the dev container:
  coder ssh ai

Then inside the container:
  dbt run                Build all models
  dbt test               Run all tests
  dbt build              Run + test in one step`,
        },
        {
          id: "auri_ptips_3",
          from: "Auri Park",
          timestamp: "",
          body: `snow sql: Snowflake SQL console
  snow sql               Start interactive SQL shell
  snow sql -q "SELECT.." Run a single query`,
        },
        {
          id: "auri_ptips_4",
          from: "Auri Park",
          timestamp: "",
          body: `The dbt project is organized like:
  models/staging/        Clean raw data
  models/intermediate/   Combine staging models
  models/marts/          Business-facing tables`,
        },
        {
          id: "auri_ptips_5",
          from: "Auri Park",
          timestamp: "",
          body: "Start with 'git clone nexacorp/nexacorp-analytics', then 'dbt run' to build everything. If tests fail, that's actually interesting; it means something might be off in the data. Good luck!",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "pipeline_tools_tips_requested" },
    },

    // === DM Auri: dbt results follow-up (after running dbt) ===
    {
      id: "auri_dbt_results",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_dbt_1",
          from: "Auri Park",
          timestamp: "",
          body: "Hey, how'd the pipeline run go?",
        },
        {
          id: "auri_dbt_2",
          from: "Auri Park",
          timestamp: "",
          body: "Did everything build clean? I've been meaning to audit the models Chen left behind but haven't had a chance.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "ran_dbt" },
      replyOptions: [
        {
          label: "Builds passed but some tests warned.",
          messageBody: "Everything built but there were a couple of test warnings: employee count mismatch and some ticket data inconsistencies.",
          triggerEvents: [{ type: "objective_completed", detail: "auri_dbt_reported" }],
        },
        {
          label: "The pipeline ran clean, no issues.",
          messageBody: "Everything built and passed. I'll keep poking around the models.",
          triggerEvents: [{ type: "objective_completed", detail: "auri_dbt_reported" }],
        },
      ],
    },

    // === DM Auri: Day 2 morning (after SSH to work) ===
    {
      id: "auri_day2_morning",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_d2m_1",
          from: "Auri Park",
          timestamp: "",
          body: "Morning! Hope day one wasn't too overwhelming.",
        },
        {
          id: "auri_d2m_2",
          from: "Auri Park",
          timestamp: "",
          body: "I pushed a schema test for campaign conversion_rate last night. Been meaning to add coverage there for weeks. Can you pull the latest and run a build to make sure everything's green?",
        },
        {
          id: "auri_d2m_3",
          from: "Auri Park",
          timestamp: "",
          body: "cd into your nexacorp-analytics repo, `git pull`, then `dbt build`.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "ssh_day2" },
      replyOptions: [
        {
          label: "On it!",
          messageBody: "On it! I'll pull and run a build now.",
          triggerEvents: [
            { type: "objective_completed", detail: "read_auri_day2_morning" },
          ],
        },
      ],
    },

    // === DM Auri: Test failure reaction (after dbt test fails on Day 2) ===
    {
      id: "auri_test_failure_reaction",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_tfr_1",
          from: "Auri Park",
          timestamp: "",
          body: "How'd the build go? Everything green?",
        },
      ],
      trigger: { type: "after_story_flag", flag: "dbt_test_failed_day2" },
      replyOptions: [
        {
          label: "The conversion_rate test failed.",
          messageBody: "Nope. The conversion_rate test failed. Looks like something's off in the campaign data.",
          triggerEvents: [{ type: "objective_completed", detail: "auri_test_failure_reported" }],
        },
        {
          label: "Nope. Got a test failure on conversion_rate.",
          messageBody: "Got a test failure on conversion_rate. The build didn't pass clean.",
          triggerEvents: [{ type: "objective_completed", detail: "auri_test_failure_reported" }],
        },
      ],
    },

    // === DM Auri: Test failure details (after player reports failure) ===
    {
      id: "auri_test_failure_details",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_tfd_1",
          from: "Auri Park",
          timestamp: "",
          body: "Wait, really? That shouldn't happen... unless there's campaign data coming through with NULL clicks or conversions.",
        },
        {
          id: "auri_tfd_2",
          from: "Auri Park",
          timestamp: "",
          body: "Can you check the raw data? Try querying CAMPAIGN_METRICS in snow sql. Look for rows where CLICKS IS NULL.",
        },
        {
          id: "auri_tfd_3",
          from: "Auri Park",
          timestamp: "",
          body: "The fix goes in models/marts/rpt_campaign_performance.sql. The model needs to handle NULLs in the conversion_rate calculation. And make a branch before you change anything; we don't push to main directly.",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "auri_test_failure_reported" },
      replyOptions: [
        {
          label: "I'll check it out.",
          messageBody: "I'll dig into the raw data and see what's going on.",
        },
        {
          label: "What causes NULLs in campaign data?",
          messageBody: "On it. Quick question though, what causes NULLs in campaign data?",
        },
      ],
    },

    // === DM Auri: Fix pushed congrats (after pushing the fix branch) ===
    {
      id: "auri_fix_pushed",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_fp_1",
          from: "Auri Park",
          timestamp: "",
          body: "I saw the push, nice work! That was a clean fix.",
        },
        {
          id: "auri_fp_2",
          from: "Auri Park",
          timestamp: "",
          body: "This is exactly the kind of thing that slips through when there's no test coverage. Good thing we caught it before the marketing team's weekly review.",
        },
      ],
      trigger: { type: "after_story_flag", flag: "pushed_fix_branch" },
      replyOptions: [
        {
          label: "Happy to help!",
          messageBody: "Happy to help! Glad we caught it early.",
          triggerEvents: [{ type: "objective_completed", detail: "reported_fix_to_auri" }],
        },
        {
          label: "Where did those NULLs come from?",
          messageBody: "Thanks! Any idea where those NULLs came from though? Seems like a data source issue.",
          triggerEvents: [{ type: "objective_completed", detail: "reported_fix_to_auri" }],
        },
      ],
    },

    // Auri follow-up after player asks about NULLs
    {
      id: "auri_fix_pushed_reply",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_fpr_1",
          from: "Auri Park",
          timestamp: "",
          body: "Probably just an upstream source gap. It happens when a new campaign platform gets integrated and not all fields map cleanly. The marketing team adds new ad channels faster than the ingestion pipeline gets updated.",
        },
        {
          id: "auri_fpr_2",
          from: "Auri Park",
          timestamp: "",
          body: "The important thing is the model handles it now. NULLs in raw data are a when-not-if kind of thing.",
        },
      ],
      trigger: { type: "after_piper_reply", deliveryId: "auri_fix_pushed" },
    },

    // Auri explains chmod (after dana_ops_accepted)
    {
      id: "auri_chmod_help",
      channelId: "dm_auri",
      messages: [
        {
          id: "auri_chmod_1",
          from: "Auri Park",
          timestamp: "",
          body: "Hey! Dana mentioned you might need to get into /srv/operations/. I can help with that!",
        },
        {
          id: "auri_chmod_2",
          from: "Auri Park",
          timestamp: "",
          body: `You can run 'man chmod' for the full breakdown of how permissions work. But the short version, try this:

  chmod 755 /srv/operations/
  ls /srv/operations/

That should open it up so you can read the files in there.`,
        },
        {
          id: "auri_chmod_5",
          from: "Auri Park",
          timestamp: "",
          body: "We should probably get Oscar to set up proper ACLs at some point so people don't keep running into this. But chmod works for now!",
        },
      ],
      trigger: { type: "after_objective", objectiveId: "dana_ops_accepted" },
    },
  ];
}
