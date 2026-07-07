"""
X-Plane 12 DATA 출력 패킷 그룹 정의 (XPlane_PackInfo_R1.ini 기준).

패킷 구조 (그룹당 36바이트):
  - group_index : 4바이트 (int32 LE, 패딩 없음)
  - values      : 8 x float32 LE (32바이트)

fields 배열 인덱스 = 값 순서 (None = Dummy 필드, 파싱 시 무시)
키는 X-Plane 실제 그룹 ID (순차 번호 아님).
"""
from typing import TypedDict


class GroupDef(TypedDict):
    name: str
    label: str
    fields: list[str | None]


GROUP_MAP: dict[int, GroupDef] = {
    1: {
        "name": "time",
        "label": "Time",
        "fields": ["real_time", "total_time", "mission_time", "timer", None, "zulu_time", "local_time", "hobbs"],
    },
    3: {
        "name": "speed",
        "label": "Speed",
        "fields": ["vind_kias", "vind_keas", "vtrue_ktas", "vtrue_ktgs", None, "vind_mph", "vtrue_mphas", "vtrue_mphgs"],
    },
    4: {
        "name": "mach",
        "label": "Mach / VVI / G",
        "fields": ["mach", None, "vvi_fpm", "toten_vario", "gload_normal", "gload_axial", "gload_side", None],
    },
    8: {
        "name": "pilot_stick",
        "label": "Pilot Stick",
        "fields": ["elevator_cmd", "aileron_cmd", "rudder_cmd", None, None, None, None, None],
    },
    11: {
        "name": "flight_control_surface",
        "label": "Control Surface",
        "fields": ["elevator_fc", "aileron_fc", "rudder_fc", None, "nose_wheel_steer_deg", None, None, None],
    },
    16: {
        "name": "angular_rate",
        "label": "Angular Rate",
        "fields": ["p_deg_s", "q_deg_s", "r_deg_s", None, None, None, None, None],
    },
    17: {
        "name": "attitude",
        "label": "Attitude",
        "fields": ["pitch_deg", "roll_deg", "true_hdg_deg", None, "mag_hdg_deg", "mag_var_deg", None, "comp_hdg_deg"],
    },
    18: {
        "name": "aoa",
        "label": "AOA / Beta",
        "fields": ["aoa_deg", "beta_deg", "hori_path_deg", "vert_path_deg", None, None, None, "sideslip_deg"],
    },
    20: {
        "name": "position",
        "label": "Position",
        "fields": ["latitude", "longitude", "cg_alt_ftmsl", "gear_height_ftagl", "terrain_alt_ftmsl", "press_alt_ftmsl", "origin_lat", "origin_lng"],
    },
    25: {
        "name": "pilot_throttle",
        "label": "Pilot Throttle",
        "fields": ["throttle1_cmd", "throttle2_cmd", "throttle3_cmd", "throttle4_cmd", "throttle5_cmd", None, None, None],
    },
    26: {
        "name": "fc_throttle",
        "label": "FC Throttle",
        "fields": ["throttle1_fc", "throttle2_fc", "throttle3_fc", "throttle4_fc", "throttle5_fc", None, None, None],
    },
    35: {
        "name": "rotor_thrust",
        "label": "Rotor Thrust",
        "fields": ["rotor1_thrust_lb", "rotor2_thrust_lb", "rotor3_thrust_lb", "rotor4_thrust_lb", "rotor5_thrust_lb", None, None, None],
    },
    36: {
        "name": "engine_torque",
        "label": "Engine Torque",
        "fields": ["engine1_tq_nm", "engine2_tq_nm", "engine3_tq_nm", "engine4_tq_nm", "engine5_tq_nm", None, None, None],
    },
    37: {
        "name": "engine_rpm",
        "label": "Engine RPM",
        "fields": ["engine1_rpm", "engine2_rpm", "engine3_rpm", "engine4_rpm", "engine5_rpm", None, None, None],
    },
    38: {
        "name": "prop_rpm",
        "label": "Prop RPM",
        "fields": ["prop1_rpm", "prop2_rpm", "prop3_rpm", "prop4_rpm", "prop5_rpm", None, None, None],
    },
    39: {
        "name": "prop_pitch",
        "label": "Prop Pitch",
        "fields": ["prop1_pitch_deg", "prop2_pitch_deg", "prop3_pitch_deg", "prop4_pitch_deg", "prop5_pitch_deg", None, None, None],
    },
    53: {
        "name": "battery_amp",
        "label": "Battery Amp",
        "fields": ["battery1_amp", "battery2_amp", "battery3_amp", "battery4_amp", "battery5_amp", None, None, None],
    },
    54: {
        "name": "battery_volt",
        "label": "Battery Volt",
        "fields": ["battery1_volt", "battery2_volt", "battery3_volt", "battery4_volt", "battery5_volt", None, None, None],
    },
    139: {
        "name": "battery_temp",
        "label": "Battery Temp",
        "fields": ["battery1_temp_degc", "battery2_temp_degc", "battery3_temp_degc", "battery4_temp_degc", "battery5_temp_degc", None, None, None],
    },
    145: {
        "name": "prop_torque",
        "label": "Prop Torque",
        "fields": ["prop1_tq_nm", "prop2_tq_nm", "prop3_tq_nm", "prop4_tq_nm", "prop5_tq_nm", None, None, None],
    },
    147: {
        "name": "battery_wh",
        "label": "Battery Wh",
        "fields": ["battery1_wh", "battery2_wh", "battery3_wh", "battery4_wh", "battery5_wh", None, None, None],
    },
    151: {
        "name": "environment",
        "label": "Environment",
        "fields": ["am_prs_inhg", "am_tmp_degc", "le_tmp_degc", "dens_ratio", "a_ktas", "q_psf", None, "gravity_m_s2"],
    },
    152: {
        "name": "weather",
        "label": "Weather",
        "fields": ["immr", "turb", "rain", "snow", "hail", "hori_wind_knots", "wind_dir_deg", "vert_wind_fpm"],
    },
    167: {
        "name": "angular_accel",
        "label": "Angular Accel",
        "fields": ["p_dot", "q_dot", "r_dot", None, None, None, None, None],
    },
}

# 그룹/필드 쌍 → WebSocket 표준 페이로드 키 매핑
STANDARD_FIELD_MAP: dict[tuple[str, str], str] = {
    ("speed",    "vind_kias"):    "ias_kt",
    ("speed",    "vtrue_ktas"):   "tas_kt",
    ("speed",    "vtrue_ktgs"):   "gs_kt",
    ("attitude", "pitch_deg"):    "pitch",
    ("attitude", "roll_deg"):     "roll",
    ("attitude", "true_hdg_deg"): "heading",
    ("position", "latitude"):     "lat",
    ("position", "longitude"):    "lon",
    ("position", "cg_alt_ftmsl"): "alt_ft",
    ("mach",     "vvi_fpm"):      "vvi_fpm",
    ("mach",     "gload_normal"): "g_normal",
    ("mach",     "mach"):         "mach",
    ("aoa",      "aoa_deg"):      "aoa_deg",
    ("aoa",      "beta_deg"):     "beta_deg",
}
