import { createDatabase } from "../src/db/database.js";

export function now() {
  return new Date().toISOString();
}

export function seedPublicData(db: ReturnType<typeof createDatabase>) {
  db.prepare(
    `INSERT INTO positions (id, name, short_name, updated_at) VALUES
      (3, 'Midfielder', 'MID', ?),
      (4, 'Forward', 'FWD', ?)`,
  ).run(now(), now());

  db.prepare(
    `INSERT INTO teams (id, code, name, short_name, strength, updated_at) VALUES
      (1, 3, 'Arsenal', 'ARS', 5, ?),
      (2, 14, 'Liverpool', 'LIV', 5, ?)`,
  ).run(now(), now());

  const insertPlayer = db.prepare(
    `INSERT INTO players (
      id, code, web_name, first_name, second_name, team_id, position_id, now_cost, total_points,
      form, selected_by_percent, points_per_game, goals_scored, assists, clean_sheets, minutes,
      bonus, bps, creativity, influence, threat, ict_index, expected_goals, expected_assists,
      expected_goal_involvements, expected_goal_performance, expected_assist_performance,
      expected_goal_involvement_performance, expected_goals_conceded, clean_sheets_per_90, starts,
      tackles, recoveries, defensive_contribution, photo, team_code, status, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );

  insertPlayer.run(
    10, 10010, "Saka", "Bukayo", "Saka", 1, 3, 105, 215,
    7.8, 35.6, 6.1, 16, 12, 10, 2890,
    30, 620, 980.5, 1122.4, 901.7, 300.4, 14.6, 11.2,
    25.8, 1.4, 0.8, 2.2, 22.3, 0.31, 33,
    54, 146, 88, "10010.jpg", 3, "a", now(),
  );
  insertPlayer.run(
    11, 10011, "Salah", "Mohamed", "Salah", 2, 4, 110, 260,
    9.1, 45.1, 7.2, 22, 14, 11, 3000,
    36, 700, 1044.2, 1305.6, 1190.8, 354.1, 20.5, 12.9,
    33.4, 1.5, 1.1, 2.6, 19.8, 0.33, 35,
    38, 121, 79, "10011.jpg", 14, "a", now(),
  );
}
