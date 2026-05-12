import { PiperDelivery } from "../../engine/piper/types";
import { getHomeDeliveries } from "./messages/home";
import { getOnboardingDeliveries } from "./messages/onboarding";
import { getOscarDeliveries } from "./messages/oscar";
import { getDanaDeliveries } from "./messages/dana";
import { getAuriDeliveries } from "./messages/auri";
import { getSarahDeliveries } from "./messages/sarah";
import { getCassieDeliveries } from "./messages/cassie";
import { getEdwardDeliveries } from "./messages/edward";
import { getJordanDeliveries } from "./messages/jordan";
import { getMarcusDeliveries } from "./messages/marcus";
import { getMayaDeliveries } from "./messages/maya";
import { getAmbientDeliveries } from "./messages/ambient";
import { getAnonDeliveries } from "./messages/anon";

export const PIPER_DELIVERY_IDS = [
  // Home deliveries
  "alex_checkin",
  "alex_nudge_accepted",
  "alex_react_accepted",
  "alex_nudge_declined",
  "alex_react_declined",
  "alex_day1_checkin",
  "olive_linux_basics",
  "olive_tree_tip",
  "olive_challenges_intro",
  "olive_challenges_decline_ack",
  "olive_challenge_file",
  "olive_challenge_which",
  "olive_challenge_mkdir",
  "olive_challenge_mv",
  "olive_challenge_pipe",
  "olive_challenge_man",
  "olive_challenges_complete",
  "olive_backup_advice",
  "olive_power_tools_intro",
  "olive_pt_challenge_grep",
  "olive_pt_challenge_wc",
  "olive_pt_challenge_redirect",
  "olive_pt_challenge_sort_uniq",
  "olive_pt_challenge_find",
  "anon_usb_tip",
  "openclam_history",
  "openclam_end_of_day",
  "bubble_buddies_history",
  "bubble_buddies_day2_nova",
  // NexaCorp deliveries
  "general_edward_welcome",
  "eng_sarah_welcome",
  "oscar_log_check",
  "oscar_log_tips",
  "oscar_tab_tip",
  "dana_welcome",
  "oscar_access_review",
  "oscar_log_normal",
  "oscar_log_tampered",
  "oscar_access_followup",
  "oscar_access_followup_tampered",
  "oscar_access_reaction",
  "oscar_access_reaction_dismissed",
  "oscar_processing_tips",
  "auri_hello",
  "auri_pipeline_help",
  "auri_chen_response",
  "auri_proactive_response",
  "auri_pipeline_tips",
  "dana_ops_dashboard",
  "dana_ask_auri",
  "auri_chmod_help",
  "dana_ops_checkin",
  "dana_ops_resolved",
  "jordan_marketing_data",
  "jordan_snowsql_tips",
  "auri_dbt_results",
  "auri_day2_morning",
  "auri_test_failure_reaction",
  "auri_test_failure_details",
  "auri_fix_pushed",
  "auri_fix_pushed_reply",
  "jordan_metrics_followup",
  "jordan_metrics_reaction",
  "dana_schema_followup",
  "general_tom_wins",
  "eng_code_review_debate",
  "maya_dm_welcome",
  "maya_dm_handoff",
  "maya_dm_jin_reply",
  "maya_dm_checkin",
  "maya_dm_checkin_reply",
  "sarah_dm_mystery",
  "cassie_dm_product",
  "edward_security_grant",
  "edward_chip_intro",
  "edward_chip_error",
  "edward_chip_fix",
  "edward_plugin_request",
  "edward_plugin_report",
  "edward_plugin_ack",
  "marcus_endgame_opening",
  "marcus_reaction_edward",
  "marcus_reaction_sarah",
  "marcus_reaction_erik",
  "marcus_reaction_nobody",
  // Ambient deliveries
  "general_kitchen_debate",
  "general_standup_cancelled",
  "general_client_demo_panic",
  "general_all_hands_recap",
  "eng_deploy_drama",
  "eng_morning_checkins",
  "eng_oncall_handoff",
  "eng_eod_signoffs",
] as const;
export type PiperDeliveryId = (typeof PIPER_DELIVERY_IDS)[number];

let cachedUsername: string | undefined;
let cachedDeliveries: PiperDelivery[] | undefined;

export function getPiperDeliveries(username: string): PiperDelivery[] {
  if (username === cachedUsername && cachedDeliveries) return cachedDeliveries;
  cachedUsername = username;
  cachedDeliveries = [
    ...getHomeDeliveries(username),
    ...getOnboardingDeliveries(username),
    ...getOscarDeliveries(username),
    ...getDanaDeliveries(username),
    ...getAuriDeliveries(username),
    ...getJordanDeliveries(username),
    ...getMayaDeliveries(username),
    ...getSarahDeliveries(username),
    ...getCassieDeliveries(username),
    ...getEdwardDeliveries(username),
    ...getMarcusDeliveries(username),
    ...getAnonDeliveries(username),
    ...getAmbientDeliveries(username),
  ];
  return cachedDeliveries;
}
